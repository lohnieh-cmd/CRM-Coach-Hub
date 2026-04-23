"""Phase 2 Batch D — South African payroll & tax statutory reports.

Scope:
  1. Employee register (name, id_number, monthly_gross, start_date, active, tax_status)
  2. EMP201 monthly compute — PAYE (simplified brackets), UIF (1% + 1%, capped), SDL (1% if annual > R500k)
  3. IRP6 provisional tax — half-yearly estimates (Aug + Feb), based on projected annual taxable income
  4. Dividends Tax (DT) declaration — 20% withholding on declared dividends to SA resident beneficiaries

IMPORTANT DISCLAIMER:
  - PAYE computation uses the simplified 2025/26 sliding scale. Real SARS tables are more nuanced
    (rebates, medical credits, retirement-fund contributions, travel allowances, age-based rebates).
  - For accurate payroll, use a registered SARS-approved payroll vendor (SimplePay, Sage, SAP, etc.).
  - This module produces WORKPAPERS for accountant review, not filings. Submit via SARS eFiling.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP

from fastapi import Body, Depends, HTTPException
from pydantic import BaseModel

import server as _srv


# ── SA Tax constants (2025/26 tax year) ──────────────────────────────────────
# Sliding scale per SARS for individuals. Annual taxable income → tax liability.
PAYE_BRACKETS_ANNUAL = [
    # (up_to_annual, fixed_tax, marginal_rate_on_excess)
    (237_100,       0,          0.18),
    (370_500,   42_678,          0.26),
    (512_800,   77_362,          0.31),
    (673_000,  121_475,          0.36),
    (857_900,  179_147,          0.39),
  (1_817_000,  251_258,          0.41),
    (float("inf"), 644_489,       0.45),
]

# Annual rebates (2025/26)
PAYE_PRIMARY_REBATE_ANNUAL = 17_235      # all natural persons
PAYE_SECONDARY_REBATE_ANNUAL = 9_444     # age 65+ (additional to primary)
PAYE_TERTIARY_REBATE_ANNUAL = 3_145      # age 75+ (additional to primary + secondary)

# Monthly medical scheme fees tax credit (MSFTC) — 2025/26
MTC_MAIN_MEMBER_MONTHLY = Decimal("364.00")
MTC_FIRST_DEP_MONTHLY = Decimal("364.00")
MTC_EACH_ADDITIONAL_DEP_MONTHLY = Decimal("246.00")

# Retirement-fund deduction: deductible up to the LESSER of
#   (a) 27.5% of the greater of remuneration or taxable income, or
#   (b) R350,000 per tax year
RA_ANNUAL_PERCENT_CAP = Decimal("0.275")
RA_ANNUAL_RAND_CAP = Decimal("350000.00")

# UIF caps — remuneration capped at R17,712/month for UIF; employee 1% + employer 1%
UIF_CEILING_MONTHLY = Decimal("17712.00")
UIF_RATE = Decimal("0.01")

# SDL is 1% on total leviable payroll if the annual payroll > R500k
SDL_RATE = Decimal("0.01")
SDL_THRESHOLD_ANNUAL = Decimal("500000.00")

# Dividends Tax rate
DIVIDENDS_TAX_RATE = Decimal("0.20")

# Corporate tax headline
CORPORATE_TAX_RATE = Decimal("0.27")

# Provisional tax basic amount threshold (IRP6) — R1m rule of thumb for using estimate vs basic
IRP6_BASIC_AMOUNT_THRESHOLD = Decimal("1000000.00")


# ── Pydantic models ──────────────────────────────────────────────────────────
class EmployeeIn(BaseModel):
    name: str
    id_number: str | None = None
    monthly_gross: float
    start_date: str | None = None
    role: str | None = None
    active: bool = True
    tax_status: str = "standard"     # standard | director | non_resident
    uif_applicable: bool = True
    sdl_applicable: bool = True
    # PAYE refinements
    date_of_birth: str | None = None          # YYYY-MM-DD — drives age-based rebates
    medical_aid_members: int = 0              # 0 = no medical aid, 1 = main only, 2+ = main + deps
    retirement_monthly: float = 0.0           # RA / pension contribution per month (Rand)


class DividendDeclarationIn(BaseModel):
    beneficiary_name: str
    beneficiary_type: str = "sa_resident_individual"  # or "company" (exempt) etc.
    declaration_date: str                              # YYYY-MM-DD
    gross_dividend: float
    beneficiary_tax_number: str | None = None
    notes: str | None = None


class Irp6In(BaseModel):
    tax_year: int                    # e.g. 2026 (ends Feb of that year in SA)
    period: int                      # 1 = 1st provisional (Aug), 2 = 2nd (Feb)
    estimated_taxable_income: float
    taxable_income_basic: float | None = None   # per SARS assessment; required for period 2 if income > R1m
    provisional_payment_prior: float = 0.0      # amount already paid in P1 of same tax year
    notes: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────
def _D(v) -> Decimal:
    if v is None:
        return Decimal("0.00")
    return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _annual_tax(annual_taxable: Decimal) -> Decimal:
    """SA individual tax sliding-scale computation.

    Finds the bracket containing `annual_taxable` and returns fixed + rate × (income - lower).
    """
    t = float(annual_taxable)
    lower = 0.0
    for top, fixed, margin in PAYE_BRACKETS_ANNUAL:
        if t <= top:
            return _D(fixed + margin * (t - lower))
        lower = top
    return _D(0)


# Backwards-compat alias (internal callers used _annual_tax_v2)
_annual_tax_v2 = _annual_tax


def _age_on(dob: str | None, as_of: datetime) -> int | None:
    """Return age in whole years on `as_of` given a YYYY-MM-DD birth date (None if missing)."""
    if not dob:
        return None
    try:
        d = datetime.fromisoformat(dob[:10])
    except Exception:
        return None
    years = as_of.year - d.year - ((as_of.month, as_of.day) < (d.month, d.day))
    return max(years, 0)


def _annual_rebate_for_age(age: int | None) -> Decimal:
    """SARS age-based rebate stack. Primary for all; secondary 65+; tertiary 75+."""
    reb = Decimal(PAYE_PRIMARY_REBATE_ANNUAL)
    if age is not None and age >= 65:
        reb += Decimal(PAYE_SECONDARY_REBATE_ANNUAL)
    if age is not None and age >= 75:
        reb += Decimal(PAYE_TERTIARY_REBATE_ANNUAL)
    return reb


def _annual_medical_credit(medical_members: int) -> Decimal:
    """Medical-scheme fees tax credit (MSFTC) annualised.

    members = 0 → 0; 1 → main only; 2 → main + 1 dep; 3 → main + 1 dep + 1 extra; …
    """
    if medical_members <= 0:
        return Decimal("0")
    monthly = MTC_MAIN_MEMBER_MONTHLY
    if medical_members >= 2:
        monthly += MTC_FIRST_DEP_MONTHLY
    if medical_members >= 3:
        monthly += MTC_EACH_ADDITIONAL_DEP_MONTHLY * (medical_members - 2)
    return monthly * 12


def _deductible_retirement(annual_gross: Decimal, annual_retirement: Decimal) -> Decimal:
    """Retirement-fund deduction = min(contributions, 27.5% × gross, R350k)."""
    if annual_retirement <= 0:
        return Decimal("0")
    pct_cap = annual_gross * RA_ANNUAL_PERCENT_CAP
    return min(annual_retirement, pct_cap, RA_ANNUAL_RAND_CAP)


# ── Route registration ───────────────────────────────────────────────────────
def register_payroll_routes(api):
    """Register all payroll / IRP6 / DT routes on the shared /api router."""

    # ══════ Employees CRUD ══════
    @api.post("/accounting/employees")
    async def create_employee(p: EmployeeIn, u: dict = Depends(_srv.require_accountant)):
        doc = p.model_dump()
        doc["id"] = _srv.new_id()
        doc["owner_id"] = u["id"]
        doc["created_at"] = _srv.now_iso()
        await _srv.db.employees.insert_one(doc)
        await _srv.audit(u["actor_id"], "create_employee", "employee", doc["id"], after={"name": p.name})
        return _srv._strip_oid(doc)

    @api.get("/accounting/employees")
    async def list_employees(active_only: bool = True, u: dict = Depends(_srv.current_user)):
        q: dict = {"owner_id": u["id"]}
        if active_only:
            q["active"] = True
        return await _srv.db.employees.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)

    @api.get("/accounting/employees/{eid}")
    async def get_employee(eid: str, u: dict = Depends(_srv.current_user)):
        e = await _srv.db.employees.find_one({"id": eid, "owner_id": u["id"]}, {"_id": 0})
        if not e:
            raise HTTPException(404, "Employee not found")
        return e

    @api.patch("/accounting/employees/{eid}")
    async def update_employee(eid: str, patch: dict = Body(...), u: dict = Depends(_srv.require_accountant)):
        e = await _srv.db.employees.find_one({"id": eid, "owner_id": u["id"]}, {"_id": 0})
        if not e:
            raise HTTPException(404, "Employee not found")
        await _srv.db.employees.update_one({"id": eid, "owner_id": u["id"]}, {"$set": patch})
        await _srv.audit(u["actor_id"], "update_employee", "employee", eid, before=e, after=patch)
        return {"ok": True}

    @api.delete("/accounting/employees/{eid}")
    async def terminate_employee(eid: str, u: dict = Depends(_srv.require_accountant)):
        e = await _srv.db.employees.find_one({"id": eid, "owner_id": u["id"]}, {"_id": 0})
        if not e:
            raise HTTPException(404, "Employee not found")
        await _srv.db.employees.update_one(
            {"id": eid, "owner_id": u["id"]},
            {"$set": {"active": False, "terminated_at": _srv.now_iso()}},
        )
        await _srv.audit(u["actor_id"], "terminate_employee", "employee", eid)
        return {"ok": True}

    # ══════ EMP201 monthly report ══════
    async def _compute_emp201(owner_id: str, period: str) -> dict:
        """Shared EMP201 compute used by the GET route AND the auto-journal post."""
        if len(period) != 7 or period[4] != "-":
            raise HTTPException(400, "period must be YYYY-MM")

        # Anchor date for age calc = 1st of the period month (close enough for monthly payroll)
        try:
            period_anchor = datetime.fromisoformat(period + "-01")
        except Exception:
            period_anchor = datetime.now(timezone.utc)

        employees = await _srv.db.employees.find(
            {"owner_id": owner_id, "active": True}, {"_id": 0}
        ).to_list(1000)

        rows = []
        total_gross = Decimal("0")
        total_paye = Decimal("0")
        total_uif_emp = Decimal("0")
        total_uif_er = Decimal("0")
        total_sdl = Decimal("0")
        total_net_pay = Decimal("0")
        annual_payroll = sum(Decimal(str(e["monthly_gross"])) * 12 for e in employees) if employees else Decimal("0")
        sdl_applies_this_employer = annual_payroll > SDL_THRESHOLD_ANNUAL

        for e in employees:
            monthly = _D(e["monthly_gross"])
            annual = monthly * 12

            # Retirement-fund deduction (annual, capped by 27.5% + R350k)
            ra_monthly = _D(e.get("retirement_monthly", 0))
            ra_annual = ra_monthly * 12
            ra_deduction = _deductible_retirement(annual, ra_annual)
            annual_taxable = annual - ra_deduction

            if e["tax_status"] == "non_resident":
                # Non-residents typically taxed at flat 15% withhold for services — simplified
                paye_annual_before_rebate = annual_taxable * Decimal("0.15")
                paye_annual = max(Decimal("0"), paye_annual_before_rebate)
            else:
                paye_annual_before_rebate = _annual_tax(annual_taxable)
                # Age-based rebate stack (primary + secondary 65+ + tertiary 75+)
                age = _age_on(e.get("date_of_birth"), period_anchor)
                rebate = _annual_rebate_for_age(age)
                # Medical-scheme fees tax credit (annualised)
                mtc = _annual_medical_credit(int(e.get("medical_aid_members", 0) or 0))
                paye_annual = max(Decimal("0"), paye_annual_before_rebate - rebate - mtc)
            paye_monthly = _D(paye_annual / 12)

            # UIF — capped base
            uif_base = min(monthly, UIF_CEILING_MONTHLY) if e.get("uif_applicable", True) else Decimal("0")
            uif_emp = _D(uif_base * UIF_RATE)
            uif_er = _D(uif_base * UIF_RATE)

            # SDL — 1% if employer over threshold and employee applicable
            sdl = _D(monthly * SDL_RATE) if (sdl_applies_this_employer and e.get("sdl_applicable", True)) else Decimal("0")

            # Net pay = gross − PAYE − UIF_employee − employee RA contribution
            net = monthly - paye_monthly - uif_emp - ra_monthly

            rows.append({
                "employee_id": e["id"],
                "name": e["name"],
                "monthly_gross": float(monthly),
                "retirement_monthly": float(ra_monthly),
                "paye": float(paye_monthly),
                "uif_employee": float(uif_emp),
                "uif_employer": float(uif_er),
                "sdl": float(sdl),
                "net_pay": float(net),
                "total_cost_to_employer": float(monthly + uif_er + sdl),
            })
            total_gross += monthly
            total_paye += paye_monthly
            total_uif_emp += uif_emp
            total_uif_er += uif_er
            total_sdl += sdl
            total_net_pay += net

        total_uif = total_uif_emp + total_uif_er
        emp201_payable = total_paye + total_uif + total_sdl

        return {
            "period": period,
            "employees": rows,
            "totals": {
                "gross": float(total_gross),
                "paye": float(total_paye),
                "uif_employee": float(total_uif_emp),
                "uif_employer": float(total_uif_er),
                "uif_total": float(total_uif),
                "sdl": float(total_sdl),
                "emp201_payable_to_sars": float(emp201_payable),
                "net_pay": float(total_net_pay),
                "annual_payroll_projection": float(annual_payroll),
                "sdl_applies": sdl_applies_this_employer,
            },
            "disclaimer": (
                "EMP201 workpaper. Uses SA 2025/26 sliding scale with age rebates (65+/75+), "
                "medical-scheme fees tax credit, and retirement-fund deduction (27.5% / R350k cap). "
                "Does NOT apply travel allowances, fringe benefits, directive-based PAYE, or "
                "tax-directives. Real filings must use a SARS-approved payroll vendor. "
                "Due to SARS by the 7th of the following month."
            ),
        }

    @api.get("/accounting/reports/emp201")
    async def emp201(period: str, u: dict = Depends(_srv.current_user)):
        """Compute PAYE + UIF + SDL for a month (YYYY-MM)."""
        return await _compute_emp201(u["id"], period)

    # ══════ EMP201 auto-journal posting (finalise → GL) ══════
    @api.post("/accounting/reports/emp201/{period}/post")
    async def post_emp201_journal(
        period: str,
        bank_account_code: str = "21000",
        u: dict = Depends(_srv.require_accountant),
    ):
        """Finalise an EMP201 period — post a balanced journal to the GL.

        Postings (one combined journal, dated last day of period):
          DR 82600 Salaries & Wages     (total gross)
          DR 82700 UIF Contribution (ER) (total employer UIF)
          DR 82800 SDL Contribution     (total SDL)
              CR 53000 PAYE Payable          (total PAYE)
              CR 53100 UIF Payable           (total UIF employee + employer)
              CR 53200 SDL Payable           (total SDL)
              CR {bank_account_code}         (net pay — usually 21000 Bank)

        Idempotent: one posting per (owner, period). Returns 409 on double-post.
        """
        # Idempotency check
        existing = await _srv.db.emp201_postings.find_one(
            {"owner_id": u["id"], "period": period, "reversed_at": None}, {"_id": 0}
        )
        if existing:
            raise HTTPException(409, f"EMP201 for {period} already posted — reverse journal {existing['journal_id']} first")

        comp = await _compute_emp201(u["id"], period)
        t = comp["totals"]
        if not comp["employees"]:
            raise HTTPException(400, "No active employees for this period — nothing to post")
        # If nothing owed AND no pay, still nothing to post
        if _D(t["gross"]) == 0:
            raise HTTPException(400, "Zero gross payroll — nothing to post")

        # Build balanced journal lines — only include non-zero amounts
        lines: list = []
        gross = _D(t["gross"])
        paye = _D(t["paye"])
        uif_emp = _D(t["uif_employee"])
        uif_er = _D(t["uif_employer"])
        sdl = _D(t["sdl"])
        net_pay = _D(t["net_pay"])

        # Debits
        lines.append(_srv.JournalLineIn(account_code="82600", debit=float(gross), description=f"Salaries & Wages — {period}"))
        if uif_er > 0:
            lines.append(_srv.JournalLineIn(account_code="82700", debit=float(uif_er), description=f"UIF Employer — {period}"))
        if sdl > 0:
            lines.append(_srv.JournalLineIn(account_code="82800", debit=float(sdl), description=f"SDL — {period}"))

        # Credits
        if paye > 0:
            lines.append(_srv.JournalLineIn(account_code="53000", credit=float(paye), description=f"PAYE Payable — {period}"))
        uif_total = uif_emp + uif_er
        if uif_total > 0:
            lines.append(_srv.JournalLineIn(account_code="53100", credit=float(uif_total), description=f"UIF Payable — {period}"))
        if sdl > 0:
            lines.append(_srv.JournalLineIn(account_code="53200", credit=float(sdl), description=f"SDL Payable — {period}"))
        if net_pay > 0:
            lines.append(_srv.JournalLineIn(account_code=bank_account_code, credit=float(net_pay), description=f"Net pay to employees — {period}"))

        # Date = last day of the period month
        try:
            y, m = int(period[:4]), int(period[5:7])
            if m == 12:
                d = datetime(y, 12, 31)
            else:
                d = datetime(y, m + 1, 1) - timedelta(days=1)
        except Exception:
            d = datetime.now(timezone.utc)
        journal_date = d.strftime("%Y-%m-%d")

        payload = _srv.JournalIn(
            date=journal_date,
            memo=f"EMP201 Payroll journal — {period}",
            reference=f"EMP201-{period}",
            source="payroll",
            source_id=period,
            lines=lines,
        )
        jdoc = await _srv._validate_and_post_journal(u["id"], u["actor_id"], payload, auto=False)

        # Record the posting for idempotency + later reversal
        posting_row = {
            "id": _srv.new_id(),
            "owner_id": u["id"],
            "period": period,
            "journal_id": jdoc["id"],
            "totals": t,
            "bank_account_code": bank_account_code,
            "posted_at": _srv.now_iso(),
            "posted_by": u["actor_id"],
            "reversed_at": None,
            "reversal_journal_id": None,
        }
        await _srv.db.emp201_postings.insert_one(dict(posting_row))
        await _srv.audit(
            u["actor_id"], "post_emp201", "emp201", period,
            after={"journal_id": jdoc["id"], "emp201_payable": t["emp201_payable_to_sars"]},
        )
        posting_row.pop("_id", None)
        return {
            "ok": True,
            "period": period,
            "journal_id": jdoc["id"],
            "journal_date": journal_date,
            "totals": t,
            "posting_id": posting_row["id"],
        }

    @api.get("/accounting/reports/emp201/{period}/posting")
    async def get_emp201_posting(period: str, u: dict = Depends(_srv.current_user)):
        p = await _srv.db.emp201_postings.find_one(
            {"owner_id": u["id"], "period": period}, {"_id": 0}
        )
        if not p:
            raise HTTPException(404, f"No EMP201 posting for {period}")
        return p

    @api.delete("/accounting/reports/emp201/{period}/post")
    async def reverse_emp201_journal(period: str, u: dict = Depends(_srv.require_accountant)):
        """Reverse a posted EMP201 journal (un-finalise)."""
        p = await _srv.db.emp201_postings.find_one(
            {"owner_id": u["id"], "period": period, "reversed_at": None}, {"_id": 0}
        )
        if not p:
            raise HTTPException(404, f"No active EMP201 posting for {period}")

        # Load original journal and build a reversing entry via the existing helper pattern
        jrnl = await _srv.db.journals.find_one(
            {"id": p["journal_id"], "owner_id": u["id"]}, {"_id": 0}
        )
        if not jrnl:
            raise HTTPException(404, "Underlying journal not found — cannot reverse")

        rev_lines = [
            _srv.JournalLineIn(
                account_code=ln["account_code"],
                debit=float(ln["credit"] or 0),
                credit=float(ln["debit"] or 0),
                description=f"Reversal: {ln.get('description') or ''}",
            )
            for ln in jrnl["lines"]
        ]
        rev_payload = _srv.JournalIn(
            date=_srv.now_iso()[:10],
            memo=f"Reversal of EMP201 {period}",
            reference=f"REV-EMP201-{period}",
            source="payroll",
            source_id=period,
            lines=rev_lines,
        )
        rev = await _srv._validate_and_post_journal(u["id"], u["actor_id"], rev_payload, auto=False)
        await _srv.db.journals.update_one(
            {"id": jrnl["id"]}, {"$set": {"reversed_by": rev["id"], "reversed_at": _srv.now_iso()}}
        )
        await _srv.db.journals.update_one(
            {"id": rev["id"]}, {"$set": {"reversed_of": jrnl["id"]}}
        )
        await _srv.db.emp201_postings.update_one(
            {"id": p["id"]},
            {"$set": {"reversed_at": _srv.now_iso(), "reversal_journal_id": rev["id"]}},
        )
        await _srv.audit(
            u["actor_id"], "reverse_emp201", "emp201", period,
            after={"reversal_journal_id": rev["id"]},
        )
        return {"ok": True, "period": period, "reversal_journal_id": rev["id"]}

    # ══════ IRP6 Provisional Tax ══════
    @api.post("/accounting/reports/irp6")
    async def irp6(p: Irp6In, u: dict = Depends(_srv.require_accountant)):
        """Compute provisional tax (IRP6) for a given tax year + period.

        SA tax year ends end of February. Period 1 due 31 August, Period 2 due end Feb.

        For period 1: 50% × (estimated_annual_taxable_income × 27%) minus prior-period payments.
        For period 2: full estimated tax − payments already made (IRP6-01) − PAYE withheld.
        """
        if p.period not in (1, 2):
            raise HTTPException(400, "period must be 1 (Aug) or 2 (Feb)")
        est = _D(p.estimated_taxable_income)
        if est < 0:
            raise HTTPException(400, "estimated_taxable_income must be >= 0")

        full_tax = _D(est * CORPORATE_TAX_RATE)

        if p.period == 1:
            # Half the full tax estimate − prior (usually 0)
            provisional = _D(full_tax * Decimal("0.5")) - _D(p.provisional_payment_prior)
            if provisional < 0:
                provisional = Decimal("0")
            due_by = f"{p.tax_year - 1}-08-31"  # 31 Aug PRIOR calendar year of the Feb tax-year end
        else:
            # Period 2 — full tax − period-1 payment − any PAYE on behalf (not modelled here)
            provisional = full_tax - _D(p.provisional_payment_prior)
            if provisional < 0:
                provisional = Decimal("0")
            # Under-declaration penalty protection rule: if taxable > R1m, must use at least 80% of actual
            if est > IRP6_BASIC_AMOUNT_THRESHOLD and p.taxable_income_basic is not None:
                basic = _D(p.taxable_income_basic)
                if est < basic * Decimal("0.8"):
                    provisional += _D(full_tax * Decimal("0.20"))  # 20% under-estimation penalty
            due_by = f"{p.tax_year}-02-28"

        # Persist the IRP6 workpaper
        row = {
            "id": _srv.new_id(),
            "owner_id": u["id"],
            "tax_year": p.tax_year,
            "period": p.period,
            "estimated_taxable_income": float(est),
            "tax_at_27pct": float(full_tax),
            "prior_payment": float(_D(p.provisional_payment_prior)),
            "provisional_payable": float(provisional),
            "due_by": due_by,
            "notes": p.notes,
            "created_at": _srv.now_iso(),
            "created_by": u["actor_id"],
        }
        await _srv.db.irp6_workpapers.insert_one(row)
        await _srv.audit(u["actor_id"], "create_irp6", "irp6", row["id"],
                         after={"tax_year": p.tax_year, "period": p.period, "payable": float(provisional)})

        return {
            "tax_year": p.tax_year,
            "period": p.period,
            "estimated_taxable_income": float(est),
            "tax_at_27pct": float(full_tax),
            "prior_provisional_payments": float(_D(p.provisional_payment_prior)),
            "provisional_tax_payable": float(provisional),
            "due_by": due_by,
            "workpaper_id": row["id"],
            "disclaimer": (
                "Provisional tax (IRP6) workpaper. Submit via SARS eFiling by the due date. "
                "Under-estimation penalties may apply for period 2 if estimate < 80% of actual "
                "taxable income (and taxable > R1m). Does not include interest, additional tax, "
                "assessed losses carried forward, or SBC sliding-scale relief."
            ),
        }

    @api.get("/accounting/reports/irp6")
    async def list_irp6(tax_year: int | None = None, u: dict = Depends(_srv.current_user)):
        q: dict = {"owner_id": u["id"]}
        if tax_year:
            q["tax_year"] = tax_year
        rows = await _srv.db.irp6_workpapers.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
        return rows

    # ══════ Dividends Tax ══════
    @api.post("/accounting/reports/dividends-tax")
    async def declare_dividend(p: DividendDeclarationIn, u: dict = Depends(_srv.require_accountant)):
        """Record a dividend declaration + compute 20% withholding.

        - SA resident companies: exempt under most conditions (flag exempt=True on ticker)
        - SA resident individuals: 20% DT withheld
        - Non-residents: DTA may reduce — not computed here
        """
        gross = _D(p.gross_dividend)
        if gross <= 0:
            raise HTTPException(400, "gross_dividend must be > 0")

        # Compute DT based on beneficiary type
        if p.beneficiary_type == "company":
            dt = Decimal("0")
            exempt_reason = "SA resident company dividend (section 64F exemption)"
        elif p.beneficiary_type == "non_resident":
            dt = _D(gross * DIVIDENDS_TAX_RATE)
            exempt_reason = "Default 20% withheld; may be reduced under applicable DTA — consult accountant"
        else:
            dt = _D(gross * DIVIDENDS_TAX_RATE)
            exempt_reason = None

        net_paid = gross - dt

        row = {
            "id": _srv.new_id(),
            "owner_id": u["id"],
            "beneficiary_name": p.beneficiary_name,
            "beneficiary_type": p.beneficiary_type,
            "beneficiary_tax_number": p.beneficiary_tax_number,
            "declaration_date": p.declaration_date,
            "gross_dividend": float(gross),
            "dividends_tax_withheld": float(dt),
            "net_dividend_paid": float(net_paid),
            "exemption_note": exempt_reason,
            "notes": p.notes,
            "created_at": _srv.now_iso(),
            "created_by": u["actor_id"],
        }
        await _srv.db.dividend_declarations.insert_one(row)
        await _srv.audit(u["actor_id"], "declare_dividend", "dividend", row["id"],
                         after={"gross": float(gross), "dt": float(dt), "beneficiary": p.beneficiary_name})

        return {
            **{k: v for k, v in row.items() if k != "_id"},
            "disclaimer": (
                "Dividends Tax withheld at 20% by default. Submit the DTR01 return to SARS by the "
                "end of the month following declaration. SA resident companies are generally exempt "
                "under section 64F. Non-resident rates may be reduced by double-tax agreement (DTA)."
            ),
        }

    @api.get("/accounting/reports/dividends-tax")
    async def list_dividends(u: dict = Depends(_srv.current_user)):
        rows = await _srv.db.dividend_declarations.find(
            {"owner_id": u["id"]}, {"_id": 0}
        ).sort("declaration_date", -1).to_list(500)
        return rows

    @api.get("/accounting/reports/dividends-tax/summary")
    async def dividends_tax_summary(date_from: str, date_to: str, u: dict = Depends(_srv.current_user)):
        rows = await _srv.db.dividend_declarations.find({
            "owner_id": u["id"],
            "declaration_date": {"$gte": date_from, "$lte": date_to},
        }, {"_id": 0}).to_list(1000)
        total_gross = sum(r["gross_dividend"] for r in rows)
        total_dt = sum(r["dividends_tax_withheld"] for r in rows)
        total_net = sum(r["net_dividend_paid"] for r in rows)
        return {
            "period": {"date_from": date_from, "date_to": date_to},
            "declarations_count": len(rows),
            "total_gross_dividend": total_gross,
            "total_dividends_tax_withheld": total_dt,
            "total_net_dividend_paid": total_net,
            "disclaimer": "Submit monthly DTR01 returns via SARS eFiling.",
        }

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

from datetime import datetime, timezone
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

# Annual primary rebate (under 65)
PAYE_PRIMARY_REBATE_ANNUAL = 17_235   # 2025/26 draft

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
    """SA individual tax sliding-scale computation (no age rebate beyond primary)."""
    t = float(annual_taxable)
    prev_top = 0
    for top, fixed, margin in PAYE_BRACKETS_ANNUAL:
        if t <= top:
            # tax in this bracket
            return _D(fixed + (t - prev_top) * margin if prev_top > 0 else t * margin if fixed == 0 else fixed + (t - prev_top) * margin)
        prev_top = top
    # shouldn't reach
    return _D(0)


def _annual_tax_v2(annual_taxable: Decimal) -> Decimal:
    """Cleaner sliding-scale: find bracket then compute fixed + rate*(income - lower_limit)."""
    t = float(annual_taxable)
    lower = 0.0
    for top, fixed, margin in PAYE_BRACKETS_ANNUAL:
        if t <= top:
            return _D(fixed + margin * (t - lower))
        lower = top
    return _D(0)


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
    @api.get("/accounting/reports/emp201")
    async def emp201(period: str, u: dict = Depends(_srv.current_user)):
        """Compute PAYE + UIF + SDL for a month (YYYY-MM).

        Simplified: applies the sliding scale to each active employee's monthly_gross × 12,
        then divides by 12. Does NOT handle medical-tax credits, RA contributions, travel
        allowances, fringe benefits, age rebates — use a SARS-approved payroll system for
        real filing. This is a workpaper for accountant review.
        """
        if len(period) != 7 or period[4] != "-":
            raise HTTPException(400, "period must be YYYY-MM")

        employees = await _srv.db.employees.find(
            {"owner_id": u["id"], "active": True}, {"_id": 0}
        ).to_list(1000)

        rows = []
        total_paye = Decimal("0")
        total_uif_emp = Decimal("0")
        total_uif_er = Decimal("0")
        total_sdl = Decimal("0")
        annual_payroll = sum(Decimal(str(e["monthly_gross"])) * 12 for e in employees) if employees else Decimal("0")
        sdl_applies_this_employer = annual_payroll > SDL_THRESHOLD_ANNUAL

        for e in employees:
            monthly = _D(e["monthly_gross"])
            annual = monthly * 12
            if e["tax_status"] == "non_resident":
                # Non-residents typically taxed at flat 15% withhold for services — simplified
                paye_annual = annual * Decimal("0.15")
            else:
                paye_annual = _annual_tax_v2(annual)
                # Primary rebate (under 65)
                paye_annual = max(Decimal("0"), paye_annual - _D(PAYE_PRIMARY_REBATE_ANNUAL))
            paye_monthly = _D(paye_annual / 12)

            # UIF — capped base
            uif_base = min(monthly, UIF_CEILING_MONTHLY) if e.get("uif_applicable", True) else Decimal("0")
            uif_emp = _D(uif_base * UIF_RATE)
            uif_er = _D(uif_base * UIF_RATE)

            # SDL — 1% if employer over threshold and employee applicable
            sdl = _D(monthly * SDL_RATE) if (sdl_applies_this_employer and e.get("sdl_applicable", True)) else Decimal("0")

            rows.append({
                "employee_id": e["id"],
                "name": e["name"],
                "monthly_gross": float(monthly),
                "paye": float(paye_monthly),
                "uif_employee": float(uif_emp),
                "uif_employer": float(uif_er),
                "sdl": float(sdl),
                "net_pay": float(monthly - paye_monthly - uif_emp),
                "total_cost_to_employer": float(monthly + uif_er + sdl),
            })
            total_paye += paye_monthly
            total_uif_emp += uif_emp
            total_uif_er += uif_er
            total_sdl += sdl

        total_uif = total_uif_emp + total_uif_er
        emp201_payable = total_paye + total_uif + total_sdl

        return {
            "period": period,
            "employees": rows,
            "totals": {
                "paye": float(total_paye),
                "uif_employee": float(total_uif_emp),
                "uif_employer": float(total_uif_er),
                "uif_total": float(total_uif),
                "sdl": float(total_sdl),
                "emp201_payable_to_sars": float(emp201_payable),
                "annual_payroll_projection": float(annual_payroll),
                "sdl_applies": sdl_applies_this_employer,
            },
            "disclaimer": (
                "Simplified EMP201 workpaper. Medical-tax credits, retirement-fund contributions, "
                "travel allowances, age rebates and fringe benefits are NOT applied. Real filings "
                "must use a SARS-approved payroll vendor. Due to SARS by the 7th of the following month."
            ),
        }

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

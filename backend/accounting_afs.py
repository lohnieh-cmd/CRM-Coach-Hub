"""Phase 2 Batch E — Annual Financial Statements (AFS) PDF bundle.

Single branded PDF containing:
  1. Cover page
  2. Income Statement
  3. Balance Sheet
  4. Cash Flow Statement (simplified indirect method)
  5. VAT201 summary
  6. Notes to the AFS (auto-generated, IFRS for SMEs baseline)
  7. Accountant sign-off block (CA(SA) / SAICA / SAIPA)

Endpoint: GET /api/accounting/reports/afs-bundle/pdf?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
Only signed-off: owner/admin/accountant. Writes an audit row on every export.
"""
from __future__ import annotations

import io
import os
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path as _Path

from fastapi import Depends, UploadFile, HTTPException
from fastapi import File as _File, Form as _Form
from fastapi.responses import StreamingResponse

import server as _srv
from accounting_pdf import fmt_zar, report_table

# Convenience shortcuts
_fmt = fmt_zar

# Allowed signature image suffixes
_AFS_SIG_SUFFIXES = {".png", ".jpg", ".jpeg"}
_AFS_SIG_MAX_BYTES = 2 * 1024 * 1024   # 2 MB is plenty for a signature PNG


async def _compute_cash_flow(owner_id: str, date_from: str | None, date_to: str):
    """Simplified indirect-method cash flow statement for a SA coaching SMB.

    Start: Net income (from IS).
    + Depreciation (non-cash add-back, from 82500 DR during the period)
    − Δ Trade Debtors (22000)
    + Δ Trade Creditors (51000)
    − Δ Prepayments (24000)
    + Δ Accruals (55000)
    + Δ VAT Output (52000 net credit)
    − Δ VAT Input (23000 net debit)
    = Net cash from operating activities

    Investing = − Δ PPE cost (11100, 11200)  (capex proxy)
    Financing = Δ Long-term loans (41000) + Δ Equity capital (31000) − Drawings (34000 increase)
    Ending cash = Starting cash + Op + Inv + Fin
    """
    # Pull IS/BS data via server helpers (lazy runtime lookups keep circular imports safe)
    income_stmt = await _srv.income_statement(date_from=date_from, date_to=date_to, u={"id": owner_id})  # type: ignore
    net_income = Decimal(str(income_stmt["net_income_before_tax"]))
    est_tax = Decimal(str(income_stmt["estimated_tax_at_27pct"]))

    # Period DR on depreciation expense (82500)
    bals_period = await _srv._balance_by_code(owner_id, date_from=date_from, date_to=date_to)
    depreciation = Decimal(str((bals_period.get("82500") or {}).get("debit", 0))) - Decimal(
        str((bals_period.get("82500") or {}).get("credit", 0))
    )

    # Δ working capital — use opening vs closing balances
    async def _bal_at(code: str, at: str | None) -> Decimal:
        b = await _srv._balance_by_code(owner_id, date_to=at)
        row = b.get(code) or {}
        return Decimal(str(row.get("debit", 0))) - Decimal(str(row.get("credit", 0)))

    delta_debtors   = await _bal_at("22000", date_to) - (await _bal_at("22000", date_from) if date_from else Decimal("0"))
    delta_creditors = (await _bal_at("51000", date_to) - (await _bal_at("51000", date_from) if date_from else Decimal("0")))
    delta_prepay    = await _bal_at("24000", date_to) - (await _bal_at("24000", date_from) if date_from else Decimal("0"))
    delta_accruals  = await _bal_at("55000", date_to) - (await _bal_at("55000", date_from) if date_from else Decimal("0"))
    delta_vat_out   = await _bal_at("52000", date_to) - (await _bal_at("52000", date_from) if date_from else Decimal("0"))
    delta_vat_in    = await _bal_at("23000", date_to) - (await _bal_at("23000", date_from) if date_from else Decimal("0"))

    # Liability balances are stored as (credit - debit) positive; our _bal_at returns DR-CR so for liabs we negate
    delta_creditors = -delta_creditors
    delta_accruals = -delta_accruals
    delta_vat_out = -delta_vat_out

    net_cash_op = (
        net_income
        + depreciation
        - delta_debtors
        + delta_creditors
        - delta_prepay
        + delta_accruals
        + delta_vat_out
        - delta_vat_in
        - est_tax
    )

    # Investing — capex proxy: Δ PPE cost (11100 + 11200)
    delta_ppe = (
        (await _bal_at("11100", date_to) - (await _bal_at("11100", date_from) if date_from else Decimal("0")))
        + (await _bal_at("11200", date_to) - (await _bal_at("11200", date_from) if date_from else Decimal("0")))
    )
    net_cash_inv = -delta_ppe

    # Financing — Δ loans + Δ capital − Δ drawings
    delta_loans = -(await _bal_at("41000", date_to) - (await _bal_at("41000", date_from) if date_from else Decimal("0")))
    delta_capital = -(await _bal_at("31000", date_to) - (await _bal_at("31000", date_from) if date_from else Decimal("0")))
    delta_drawings = await _bal_at("34000", date_to) - (await _bal_at("34000", date_from) if date_from else Decimal("0"))
    net_cash_fin = delta_loans + delta_capital - delta_drawings

    # Bank — opening + closing
    opening_bank = (await _bal_at("21000", date_from)) + (await _bal_at("21100", date_from)) + (await _bal_at("21200", date_from)) if date_from else Decimal("0.00")
    closing_bank = (await _bal_at("21000", date_to)) + (await _bal_at("21100", date_to)) + (await _bal_at("21200", date_to))

    net_change = net_cash_op + net_cash_inv + net_cash_fin
    reconciled = (opening_bank + net_change)

    return {
        "operating": {
            "net_income_before_tax": float(net_income),
            "estimated_tax_27pct": float(est_tax),
            "add_depreciation": float(depreciation),
            "delta_trade_debtors": float(-delta_debtors),
            "delta_trade_creditors": float(delta_creditors),
            "delta_prepayments": float(-delta_prepay),
            "delta_accruals": float(delta_accruals),
            "delta_vat_output": float(delta_vat_out),
            "delta_vat_input": float(-delta_vat_in),
            "net_cash_from_operations": float(net_cash_op),
        },
        "investing": {
            "delta_ppe_acquired": float(-delta_ppe),
            "net_cash_from_investing": float(net_cash_inv),
        },
        "financing": {
            "delta_long_term_loans": float(delta_loans),
            "delta_owner_capital": float(delta_capital),
            "delta_drawings": float(-delta_drawings),
            "net_cash_from_financing": float(net_cash_fin),
        },
        "opening_bank_balance": float(opening_bank),
        "closing_bank_balance": float(closing_bank),
        "net_change_in_cash": float(net_change),
        "reconciled_closing": float(reconciled),
        "reconciliation_variance": float(closing_bank - reconciled),
    }


def _afs_notes(owner_name: str, date_from: str | None, date_to: str) -> list[dict]:
    """Auto-generated IFRS-for-SMEs notes — starting scaffold for accountant review."""
    return [
        {
            "n": 1,
            "title": "Reporting framework and basis of preparation",
            "body": (
                f"These annual financial statements have been prepared in accordance with the International "
                f"Financial Reporting Standard for Small and Medium-sized Entities (IFRS for SMEs) and the "
                f"requirements of the Companies Act of South Africa. The financial statements cover the period "
                f"{date_from or 'inception'} to {date_to} and are presented in South African Rand (ZAR). "
                f"The accounting policies applied are consistent with those adopted in previous periods."
            ),
        },
        {
            "n": 2,
            "title": "Going concern",
            "body": (
                f"The directors of {owner_name} have reviewed cash-flow forecasts, contractual coaching-revenue "
                f"commitments and working-capital resources and are satisfied that the entity has adequate "
                f"resources to continue operations for the foreseeable future. Accordingly these AFS are "
                f"prepared on the going-concern basis."
            ),
        },
        {
            "n": 3,
            "title": "Revenue recognition",
            "body": (
                "Coaching revenue (one-on-one, group programs, retainers, assessments, speaking) is recognised "
                "on the accrual basis over the period in which the service is rendered. Retainer subscriptions "
                "are recognised on a straight-line basis over the subscription term. Export coaching revenue "
                "is zero-rated for VAT. Revenue is measured at the fair value of consideration received, "
                "net of VAT."
            ),
        },
        {
            "n": 4,
            "title": "Property, plant and equipment",
            "body": (
                "PPE is carried at historical cost less accumulated depreciation and impairment losses. "
                "Depreciation is provided on a straight-line basis over the estimated useful lives of assets: "
                "Computer equipment — 36 months; Office furniture — 60 months. Gains or losses on disposal "
                "are recognised in profit and loss."
            ),
        },
        {
            "n": 5,
            "title": "Income tax",
            "body": (
                "The corporate income tax expense is estimated at the headline South African rate of 27% "
                "applied to profit before tax. Actual tax liability depends on assessed-loss brought forward, "
                "Small Business Corporation (SBC) sliding-scale tables (if applicable), provisional payments, "
                "and add-backs/disallowances — to be finalised by a CA(SA) / SAIPA / SAICA member during "
                "ITR14 preparation. Provisional tax is paid in August (IRP6 01) and February (IRP6 02)."
            ),
        },
        {
            "n": 6,
            "title": "Value-Added Tax (VAT)",
            "body": (
                "The entity is registered for VAT and charges VAT at the standard rate of 15% on taxable "
                "supplies. VAT inputs are claimed on supporting tax invoices in the period of receipt. "
                "VAT 201 returns are submitted bi-monthly via SARS eFiling. Export coaching supplies are "
                "zero-rated in accordance with section 11(2) of the VAT Act."
            ),
        },
        {
            "n": 7,
            "title": "Financial risk management",
            "body": (
                "The entity's principal financial risks are credit risk (trade debtors) and liquidity risk. "
                "Credit risk is mitigated by requiring advance payment or short payment terms on retainers, "
                "and by monitoring the debtors ageing in the CRM. Liquidity risk is monitored through rolling "
                "cash-flow forecasts. The entity has no interest-rate exposure on material borrowings."
            ),
        },
        {
            "n": 8,
            "title": "Related-party transactions",
            "body": (
                "Transactions with related parties (owner drawings, owner contributions, capital loans) are "
                "disclosed at the carrying amount at period-end. See the statement of changes in equity and "
                "the trial balance for specific balances on accounts 31000 (owner capital), 34000 (drawings) "
                "and 41000 (loans)."
            ),
        },
    ]


def _build_afs_story(
    branding: dict,
    date_from: str | None,
    date_to: str,
    income: dict,
    balance: dict,
    cashflow: dict,
    vat: dict,
    notes: list[dict],
    signature: dict | None = None,
):
    """Build the ReportLab platypus `story` list for the whole AFS PDF.

    `signature` (if provided) = {
       "disk_path", "accountant_name", "firm", "registration", "signed_date"
    } and embeds the PNG/JPG on the sign-off page with the accompanying metadata.
    """
    from reportlab.platypus import Paragraph, Spacer, PageBreak, Image
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.colors import HexColor

    accent = HexColor("#" + branding["accent_hex"])
    base = getSampleStyleSheet()
    # Safe additive styles; do not clobber built-ins
    styles = {
        "Title":    ParagraphStyle("AFSTitle",      parent=base["Title"],     textColor=accent, fontSize=28, spaceAfter=14, alignment=1),
        "SubTitle": ParagraphStyle("AFSSubTitle",   parent=base["Normal"],    fontSize=12,     textColor=HexColor("#475569"), alignment=1, spaceAfter=18),
        "Section":  ParagraphStyle("AFSSection",    parent=base["Heading1"],  textColor=accent, fontSize=18, spaceBefore=12, spaceAfter=10),
        "Heading":  ParagraphStyle("AFSHeading",    parent=base["Heading3"],  textColor=accent, fontSize=12, spaceBefore=10, spaceAfter=6),
        "Normal":   base["Normal"],
        "Muted":    ParagraphStyle("AFSMuted",      parent=base["Normal"],    fontSize=9,      textColor=HexColor("#64748b")),
        "NoteTitle":ParagraphStyle("AFSNoteTitle",  parent=base["Heading4"],  fontSize=11,     spaceBefore=10, spaceAfter=4, textColor=HexColor("#0f172a")),
        "NoteBody": ParagraphStyle("AFSNoteBody",   parent=base["Normal"],    fontSize=10,     leading=14, spaceAfter=6),
        "Discl":    ParagraphStyle("AFSDiscl",      parent=base["Italic"],    fontSize=8,      textColor=HexColor("#64748b"), spaceBefore=10),
    }

    story = []

    # 1. Cover page
    story.extend([
        Spacer(1, 120),
        Paragraph("ANNUAL FINANCIAL STATEMENTS", styles["Title"]),
        Paragraph(branding["company_name"], styles["SubTitle"]),
        Paragraph(f"For the period ended <b>{date_to}</b>", styles["SubTitle"]),
        Spacer(1, 80),
        Paragraph(
            "Prepared on a going-concern basis under <b>IFRS for SMEs</b>.<br/>"
            "All amounts in South African Rand (ZAR).<br/>"
            f"Period: {date_from or 'inception'} → {date_to}.",
            styles["Muted"],
        ),
        Spacer(1, 80),
        Paragraph(
            "These financial statements require sign-off by a registered CA(SA), SAIPA or SAICA "
            "member before submission to SARS, CIPC or any external stakeholder.",
            styles["Discl"],
        ),
        PageBreak(),
    ])

    # 2. Income Statement
    story.append(Paragraph("Statement of Comprehensive Income", styles["Section"]))
    story.append(Paragraph(f"Period: {date_from or 'start'} → {date_to}", styles["Muted"]))
    story.append(Spacer(1, 8))
    is_rows = [["Code", "Description", "Amount (ZAR)"]]
    is_rows.append(["", "REVENUE", ""])
    for r in income["income"]:
        is_rows.append([r["code"], r["name"], _fmt(r["amount"])])
    is_rows.append(["", "Total revenue", _fmt(income["total_income"])])
    is_rows.append(["", "EXPENSES", ""])
    for r in income["expenses"]:
        is_rows.append([r["code"], r["name"], _fmt(r["amount"])])
    is_rows.append(["", "Total expenses", _fmt(income["total_expense"])])
    is_rows.append(["", "Profit / (loss) before tax", _fmt(income["net_income_before_tax"])])
    is_rows.append(["", "Estimated corporate income tax (27%)", _fmt(income["estimated_tax_at_27pct"])])
    is_rows.append(["", "PROFIT FOR THE PERIOD", _fmt(income["net_income_after_tax"])])
    story.append(report_table(is_rows, styles, accent, col_widths=[60, 290, 120], right_align_cols=[2]))
    story.append(Paragraph(income.get("disclaimer") or "", styles["Discl"]))
    story.append(PageBreak())

    # 3. Balance Sheet
    story.append(Paragraph("Statement of Financial Position", styles["Section"]))
    story.append(Paragraph(f"As at <b>{balance['as_at']}</b>", styles["Muted"]))
    story.append(Spacer(1, 8))

    def _section(title, rows, total):
        data = [["Code", "Description", "Amount (ZAR)"]]
        if not rows:
            data.append(["", "—", ""])
        for r in rows:
            data.append([r["code"], r["name"], _fmt(r["amount"])])
        data.append(["", f"Total {title}", _fmt(total)])
        return [
            Paragraph(title, styles["Heading"]),
            report_table(data, styles, accent, col_widths=[60, 290, 120], right_align_cols=[2]),
        ]

    story.extend(_section("Assets",       balance["assets"],      balance["total_assets"]))
    story.extend(_section("Liabilities",  balance["liabilities"], balance["total_liabilities"]))
    story.extend(_section("Equity",       balance["equity"],      balance["total_equity"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        f"<b>Assets {_fmt(balance['total_assets'])}</b> = "
        f"<b>Liabilities + Equity {_fmt(balance['liabilities_plus_equity'])}</b> "
        + ("&#10003; Balanced" if balance.get("balanced") else "&#10007; UNBALANCED"),
        styles["Normal"],
    ))
    story.append(PageBreak())

    # 4. Cash Flow Statement (indirect method)
    story.append(Paragraph("Statement of Cash Flows (indirect method)", styles["Section"]))
    story.append(Paragraph(f"Period: {date_from or 'start'} → {date_to}", styles["Muted"]))
    story.append(Spacer(1, 8))
    op = cashflow["operating"]
    cf_rows = [["#", "Line item", "Amount (ZAR)"]]
    cf_rows.append(["", "CASH FLOWS FROM OPERATING ACTIVITIES", ""])
    cf_rows.append(["", "Profit / (loss) before tax", _fmt(op["net_income_before_tax"])])
    cf_rows.append(["", "Add: Depreciation (non-cash)", _fmt(op["add_depreciation"])])
    cf_rows.append(["", "Δ Trade debtors", _fmt(op["delta_trade_debtors"])])
    cf_rows.append(["", "Δ Trade creditors", _fmt(op["delta_trade_creditors"])])
    cf_rows.append(["", "Δ Prepayments", _fmt(op["delta_prepayments"])])
    cf_rows.append(["", "Δ Accruals", _fmt(op["delta_accruals"])])
    cf_rows.append(["", "Δ VAT output liability", _fmt(op["delta_vat_output"])])
    cf_rows.append(["", "Δ VAT input receivable", _fmt(op["delta_vat_input"])])
    cf_rows.append(["", "Less: Estimated tax paid", _fmt(-op["estimated_tax_27pct"])])
    cf_rows.append(["", "Net cash from operating activities", _fmt(op["net_cash_from_operations"])])

    inv = cashflow["investing"]
    cf_rows.append(["", "CASH FLOWS FROM INVESTING ACTIVITIES", ""])
    cf_rows.append(["", "Acquisition of PPE", _fmt(inv["delta_ppe_acquired"])])
    cf_rows.append(["", "Net cash from investing activities", _fmt(inv["net_cash_from_investing"])])

    fin = cashflow["financing"]
    cf_rows.append(["", "CASH FLOWS FROM FINANCING ACTIVITIES", ""])
    cf_rows.append(["", "Δ Long-term loans", _fmt(fin["delta_long_term_loans"])])
    cf_rows.append(["", "Δ Owner's capital contribution", _fmt(fin["delta_owner_capital"])])
    cf_rows.append(["", "Owner's drawings", _fmt(fin["delta_drawings"])])
    cf_rows.append(["", "Net cash from financing activities", _fmt(fin["net_cash_from_financing"])])

    cf_rows.append(["", "NET CHANGE IN CASH", _fmt(cashflow["net_change_in_cash"])])
    cf_rows.append(["", "Opening bank balance", _fmt(cashflow["opening_bank_balance"])])
    cf_rows.append(["", "Closing bank balance (computed)", _fmt(cashflow["reconciled_closing"])])
    cf_rows.append(["", "Closing bank balance (actual)", _fmt(cashflow["closing_bank_balance"])])
    cf_rows.append(["", "Reconciliation variance (should be ~0)", _fmt(cashflow["reconciliation_variance"])])
    story.append(report_table(cf_rows, styles, accent, col_widths=[30, 320, 120], right_align_cols=[2]))
    story.append(Paragraph(
        "Any non-zero reconciliation variance indicates a cash-impacting transaction that "
        "has not been fully captured in the working-capital, investing or financing movements "
        "above — typically an uncategorised bank transaction. Review the Bank & Recon module.",
        styles["Discl"],
    ))
    story.append(PageBreak())

    # 5. VAT201 summary
    story.append(Paragraph("VAT 201 Summary", styles["Section"]))
    story.append(Paragraph(f"Period: {vat['period']['date_from']} → {vat['period']['date_to']}", styles["Muted"]))
    story.append(Spacer(1, 8))
    out = vat["output_tax"]
    inp = vat["input_tax"]
    vat_rows = [["Box", "Description", "Amount (ZAR)"]]
    vat_rows.append(["1",  "Standard-rated supplies 15% (output)", _fmt(out["box_1_standard_rated_15pct"])])
    vat_rows.append(["2",  "Zero-rated supplies (value)",           _fmt(out["box_2_zero_rated_supplies_value"])])
    vat_rows.append(["3",  "Exempt / other supplies (value)",       _fmt(out["box_3_exempt_and_other_supplies_value"])])
    vat_rows.append(["14", "Standard-rated inputs 15%",             _fmt(inp["box_14_standard_inputs_15pct"])])
    vat_rows.append(["15", "Capital inputs 15%",                    _fmt(inp["box_15_capital_inputs_15pct"])])
    vat_rows.append(["",   "Total input tax claim",                 _fmt(inp["total_input_tax_claim"])])
    vat_rows.append(["",   "VAT PAYABLE TO SARS",                   _fmt(vat["vat_payable_to_sars"])])
    story.append(report_table(vat_rows, styles, accent, col_widths=[40, 330, 120], right_align_cols=[2]))
    story.append(Paragraph(
        "VAT 201 is submitted via SARS eFiling bi-monthly. This summary is a supporting workpaper only.",
        styles["Discl"],
    ))
    story.append(PageBreak())

    # 6. Notes
    story.append(Paragraph("Notes to the Annual Financial Statements", styles["Section"]))
    story.append(Spacer(1, 6))
    for note in notes:
        story.append(Paragraph(f"{note['n']}. {note['title']}", styles["NoteTitle"]))
        story.append(Paragraph(note["body"], styles["NoteBody"]))
    story.append(PageBreak())

    # 7. Sign-off
    story.append(Paragraph("Accountant Sign-off", styles["Section"]))
    story.append(Paragraph(
        "These financial statements have been prepared for review by a registered accountant. "
        "By signing below the accountant confirms independent review in accordance with the "
        "relevant professional standards and the requirements of the Companies Act of South Africa.",
        styles["Normal"],
    ))
    story.append(Spacer(1, 24))

    if signature and signature.get("disk_path") and os.path.exists(signature["disk_path"]):
        # Pre-filled sign-off with uploaded signature image
        story.append(Paragraph(f"Accountant name: <b>{signature.get('accountant_name') or '—'}</b>", styles["Normal"]))
        story.append(Spacer(1, 8))
        story.append(Paragraph(f"Firm / Practice: <b>{signature.get('firm') or '—'}</b>", styles["Normal"]))
        story.append(Spacer(1, 8))
        story.append(Paragraph(
            f"Registration body &amp; number: <b>{signature.get('registration') or '—'}</b>",
            styles["Normal"],
        ))
        story.append(Spacer(1, 14))
        # Embed signature image (max height 60pt, preserve aspect ratio)
        try:
            img = Image(signature["disk_path"])
            # Scale to max 200 × 60 pts
            iw, ih = img.imageWidth, img.imageHeight
            max_w, max_h = 200.0, 60.0
            scale = min(max_w / iw, max_h / ih, 1.0)
            img.drawWidth = iw * scale
            img.drawHeight = ih * scale
            story.append(img)
        except Exception:
            story.append(Paragraph("<i>(Signature image could not be embedded)</i>", styles["Muted"]))
        story.append(Spacer(1, 6))
        sig_date = signature.get("signed_date") or datetime.now(timezone.utc).date().isoformat()
        story.append(Paragraph(f"Signature · Date signed: <b>{sig_date}</b>", styles["Muted"]))
    else:
        # Blank sign-off fields for manual wet signature
        story.append(Paragraph("Accountant name: " + "_" * 60, styles["Normal"]))
        story.append(Spacer(1, 18))
        story.append(Paragraph("Firm / Practice: " + "_" * 60, styles["Normal"]))
        story.append(Spacer(1, 18))
        story.append(Paragraph("Registration body &amp; number (CA(SA) / SAIPA / SAICA): " + "_" * 40, styles["Normal"]))
        story.append(Spacer(1, 18))
        story.append(Paragraph("Signature: " + "_" * 48 + "   Date: " + "_" * 20, styles["Normal"]))

    story.append(Spacer(1, 24))
    story.append(Paragraph(
        "<b>Disclaimer:</b> These AFS are produced by Ascent CRM's accounting module as a "
        "starting point for professional review. The registered accountant accepts professional "
        "responsibility upon signing. Ascent CRM is not a substitute for professional accounting "
        "advice. Submit via SARS eFiling and CIPC BizPortal through your accountant.",
        styles["Discl"],
    ))

    return story


def register_afs_routes(api_router):
    """Register the AFS-bundle endpoint on the shared /api router."""

    # ── Accountant signature upload (Batch F polish) ────────────────────────
    @api_router.post("/accounting/afs/signature")
    async def upload_afs_signature(
        file: UploadFile = _File(...),
        accountant_name: str = _Form(...),
        firm: str = _Form(""),
        registration: str = _Form(""),
        signed_date: str = _Form(""),
        u: dict = Depends(_srv.require_accountant),
    ):
        """Upload a PNG/JPEG signature to embed on the AFS sign-off page.

        Replaces any existing signature. Returns the stored metadata.
        """
        suffix = _Path(file.filename or "").suffix.lower()
        if suffix not in _AFS_SIG_SUFFIXES:
            raise HTTPException(400, f"Signature must be PNG or JPEG (.png/.jpg/.jpeg). Got: {suffix}")
        data = await file.read()
        if len(data) == 0:
            raise HTTPException(400, "Empty file")
        if len(data) > _AFS_SIG_MAX_BYTES:
            raise HTTPException(413, f"Signature too large (>{_AFS_SIG_MAX_BYTES // (1024*1024)} MB)")

        target_dir = _srv.UPLOAD_ROOT / u["id"] / "afs"
        target_dir.mkdir(parents=True, exist_ok=True)
        # Wipe any prior signature on disk (PNG or JPG)
        for existing in target_dir.glob("signature.*"):
            try:
                existing.unlink()
            except Exception:
                pass
        disk_path = target_dir / f"signature{suffix}"
        disk_path.write_bytes(data)

        sig_meta = {
            "accountant_name": accountant_name.strip(),
            "firm": firm.strip(),
            "registration": registration.strip(),
            "signed_date": signed_date.strip() or datetime.now(timezone.utc).date().isoformat(),
            "disk_path": str(disk_path),
            "content_type": file.content_type or ("image/png" if suffix == ".png" else "image/jpeg"),
            "size": len(data),
            "uploaded_at": _srv.now_iso(),
            "uploaded_by": u["actor_id"],
        }
        await _srv.db.users.update_one({"id": u["id"]}, {"$set": {"afs_signature": sig_meta}})
        await _srv.audit(
            u["actor_id"], "upload_afs_signature", "accounting", u["id"],
            after={"accountant_name": sig_meta["accountant_name"], "size": sig_meta["size"]},
        )
        # Do not leak disk_path
        return {k: v for k, v in sig_meta.items() if k != "disk_path"}

    @api_router.get("/accounting/afs/signature")
    async def get_afs_signature(u: dict = Depends(_srv.current_user)):
        user = await _srv.db.users.find_one({"id": u["id"]}, {"_id": 0, "afs_signature": 1})
        sig = (user or {}).get("afs_signature") or None
        if not sig:
            return {"signature": None}
        return {"signature": {k: v for k, v in sig.items() if k != "disk_path"}}

    @api_router.delete("/accounting/afs/signature")
    async def delete_afs_signature(u: dict = Depends(_srv.require_accountant)):
        user = await _srv.db.users.find_one({"id": u["id"]}, {"_id": 0, "afs_signature": 1})
        sig = (user or {}).get("afs_signature") or None
        if not sig:
            raise HTTPException(404, "No signature on file")
        try:
            dp = sig.get("disk_path")
            if dp and os.path.exists(dp):
                os.unlink(dp)
        except Exception:
            pass
        await _srv.db.users.update_one({"id": u["id"]}, {"$unset": {"afs_signature": ""}})
        await _srv.audit(u["actor_id"], "delete_afs_signature", "accounting", u["id"])
        return {"ok": True}

    @api_router.get("/accounting/reports/afs-bundle/pdf")
    async def afs_bundle_pdf(
        date_from: str | None = None,
        date_to: str | None = None,
        u: dict = Depends(_srv.require_accountant),
    ):
        """Generate the full Annual Financial Statements bundle as a single branded PDF.

        Covers: Cover · Income Statement · Balance Sheet · Cash Flow · VAT201 · Notes · Sign-off.
        Requires owner / admin / accountant role. Writes an audit row.
        """
        dto = date_to or datetime.now(timezone.utc).date().isoformat()
        dfrom = date_from  # may be None — opening period

        # Fetch report data using server-side internals (lazy so reload-safe)
        income = await _srv.income_statement(date_from=dfrom, date_to=dto, u=u)
        balance = await _srv.balance_sheet(as_at=dto, u=u)
        # VAT201 requires date_from; fall back to start of fiscal year
        vat_from = dfrom or (dto[:4] + "-03-01")  # SA fiscal year starts 1 March
        vat = await _srv.vat201(date_from=vat_from, date_to=dto, u=u)
        cashflow = await _compute_cash_flow(u["id"], dfrom, dto)

        branding = await _srv._resolve_owner_branding(u["id"])
        notes = _afs_notes(branding["company_name"], dfrom, dto)

        # Load accountant signature (if uploaded)
        user_row = await _srv.db.users.find_one({"id": u["id"]}, {"_id": 0, "afs_signature": 1})
        signature = (user_row or {}).get("afs_signature") or None

        story = _build_afs_story(branding, dfrom, dto, income, balance, cashflow, vat, notes, signature=signature)

        # Render
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate

        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=A4,
            leftMargin=1.8 * cm, rightMargin=1.8 * cm,
            topMargin=1.6 * cm, bottomMargin=1.6 * cm,
            title=f"AFS — {branding['company_name']} — {dto}",
            author=branding["company_name"],
        )
        doc.build(story)
        buf.seek(0)

        await _srv.audit(
            u["actor_id"], "export_pdf", "accounting_report", "afs_bundle",
            after={"date_from": dfrom, "date_to": dto},
        )

        fname = f"AFS_{branding['company_name'].replace(' ', '_')}_{dto}.pdf"
        return StreamingResponse(
            buf, media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )

    return afs_bundle_pdf

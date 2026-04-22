"""Static reference data for the SA Accounting module.

Pure data + pure utilities. No database, no FastAPI. Safe to import from anywhere.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime


ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"]
NORMAL_BALANCE = {
    "asset": "debit",
    "expense": "debit",
    "liability": "credit",
    "equity": "credit",
    "income": "credit",
}

# Statutory SA VAT codes used in the VAT201 return (simplified)
SA_VAT_CODES: list[dict] = [
    {"code": "S",  "name": "Standard-rated 15%",                "rate_pct": 15.0, "direction": "both",   "vat201_box": "1"},
    {"code": "Z",  "name": "Zero-rated",                         "rate_pct": 0.0,  "direction": "both",   "vat201_box": "2"},
    {"code": "E",  "name": "Exempt supplies",                    "rate_pct": 0.0,  "direction": "output", "vat201_box": "3"},
    {"code": "NV", "name": "Non-vatable / Out-of-scope",         "rate_pct": 0.0,  "direction": "both",   "vat201_box": "0"},
    {"code": "SI", "name": "Standard-rated inputs 15%",          "rate_pct": 15.0, "direction": "input",  "vat201_box": "14"},
    {"code": "CI", "name": "Capital inputs 15%",                 "rate_pct": 15.0, "direction": "input",  "vat201_box": "15"},
]

# Standard SA Chart of Accounts for a coaching / professional-services business.
# 5-digit codes, parent groupings, VAT + normal-balance presets.
SA_COA_SEED: list[dict] = [
    # --- ASSETS (1xxxx) ---
    {"code": "10000", "name": "Non-current Assets",                             "type": "asset", "subtype": "header"},
    {"code": "11000", "name": "Property, Plant & Equipment",                    "type": "asset", "subtype": "ppe",            "parent": "10000"},
    {"code": "11100", "name": "Computer Equipment — Cost",                      "type": "asset", "subtype": "ppe",            "parent": "11000"},
    {"code": "11110", "name": "Computer Equipment — Accumulated Depreciation", "type": "asset", "subtype": "ppe_contra",     "parent": "11000"},
    {"code": "11200", "name": "Office Furniture — Cost",                        "type": "asset", "subtype": "ppe",            "parent": "11000"},
    {"code": "11210", "name": "Office Furniture — Accumulated Depreciation",   "type": "asset", "subtype": "ppe_contra",     "parent": "11000"},
    {"code": "12000", "name": "Intangible Assets",                              "type": "asset", "subtype": "intangible",     "parent": "10000"},
    {"code": "20000", "name": "Current Assets",                                 "type": "asset", "subtype": "header"},
    {"code": "21000", "name": "Bank — Current Account (FNB)",                   "type": "asset", "subtype": "bank",           "parent": "20000"},
    {"code": "21100", "name": "Bank — Savings Account",                         "type": "asset", "subtype": "bank",           "parent": "20000"},
    {"code": "21200", "name": "Petty Cash",                                     "type": "asset", "subtype": "cash",           "parent": "20000"},
    {"code": "22000", "name": "Trade Debtors (Accounts Receivable)",            "type": "asset", "subtype": "receivable",     "parent": "20000"},
    {"code": "22100", "name": "Allowance for Doubtful Debts",                   "type": "asset", "subtype": "receivable_contra", "parent": "20000"},
    {"code": "23000", "name": "VAT Input (Receivable from SARS)",               "type": "asset", "subtype": "tax",            "parent": "20000"},
    {"code": "24000", "name": "Prepayments",                                    "type": "asset", "subtype": "prepaid",        "parent": "20000"},
    {"code": "25000", "name": "Provisional Tax Paid (SARS asset)",              "type": "asset", "subtype": "tax",            "parent": "20000"},

    # --- EQUITY (3xxxx) ---
    {"code": "30000", "name": "Equity",                                         "type": "equity", "subtype": "header"},
    {"code": "31000", "name": "Share Capital / Owner's Contribution",           "type": "equity", "subtype": "capital",       "parent": "30000"},
    {"code": "32000", "name": "Retained Earnings",                              "type": "equity", "subtype": "retained",      "parent": "30000"},
    {"code": "33000", "name": "Current-year Earnings (P&L clearing)",           "type": "equity", "subtype": "retained",      "parent": "30000"},
    {"code": "34000", "name": "Owner's Drawings",                               "type": "equity", "subtype": "drawings",      "parent": "30000"},

    # --- LIABILITIES (4xxxx non-current / 5xxxx current) ---
    {"code": "40000", "name": "Non-current Liabilities",                        "type": "liability", "subtype": "header"},
    {"code": "41000", "name": "Long-term Loans",                                "type": "liability", "subtype": "loan",        "parent": "40000"},
    {"code": "50000", "name": "Current Liabilities",                            "type": "liability", "subtype": "header"},
    {"code": "51000", "name": "Trade Creditors (Accounts Payable)",             "type": "liability", "subtype": "payable",     "parent": "50000"},
    {"code": "52000", "name": "VAT Output (Payable to SARS)",                   "type": "liability", "subtype": "tax",         "parent": "50000"},
    {"code": "52100", "name": "VAT Control (net of Input vs Output)",           "type": "liability", "subtype": "tax",         "parent": "50000"},
    {"code": "53000", "name": "PAYE Payable",                                   "type": "liability", "subtype": "tax",         "parent": "50000"},
    {"code": "53100", "name": "UIF Payable",                                    "type": "liability", "subtype": "tax",         "parent": "50000"},
    {"code": "53200", "name": "SDL Payable",                                    "type": "liability", "subtype": "tax",         "parent": "50000"},
    {"code": "54000", "name": "Corporate Income Tax Payable (SARS)",            "type": "liability", "subtype": "tax",         "parent": "50000"},
    {"code": "55000", "name": "Accruals",                                       "type": "liability", "subtype": "accrual",     "parent": "50000"},
    {"code": "56000", "name": "Stripe / PayPal Clearing Account",               "type": "liability", "subtype": "clearing",    "parent": "50000"},

    # --- INCOME (6xxxx) ---
    {"code": "60000", "name": "Revenue",                                        "type": "income", "subtype": "header"},
    {"code": "61000", "name": "Coaching Revenue — 1:1 Sessions",                "type": "income", "subtype": "revenue",        "parent": "60000", "vat_code": "S"},
    {"code": "61100", "name": "Coaching Revenue — Group Programs",              "type": "income", "subtype": "revenue",        "parent": "60000", "vat_code": "S"},
    {"code": "61200", "name": "Retainer / Subscription Revenue",                "type": "income", "subtype": "revenue",        "parent": "60000", "vat_code": "S"},
    {"code": "61300", "name": "Assessment & Diagnostic Revenue",                "type": "income", "subtype": "revenue",        "parent": "60000", "vat_code": "S"},
    {"code": "61400", "name": "Speaking / Keynote Revenue",                     "type": "income", "subtype": "revenue",        "parent": "60000", "vat_code": "S"},
    {"code": "61500", "name": "Export Coaching Revenue (zero-rated)",           "type": "income", "subtype": "revenue",        "parent": "60000", "vat_code": "Z"},
    {"code": "69000", "name": "Other Income",                                   "type": "income", "subtype": "other",          "parent": "60000"},
    {"code": "69100", "name": "Interest Income",                                "type": "income", "subtype": "other",          "parent": "60000", "vat_code": "E"},

    # --- OPERATING EXPENSES (8xxxx) ---
    {"code": "80000", "name": "Operating Expenses",                             "type": "expense", "subtype": "header"},
    {"code": "81000", "name": "Advertising & Marketing",                        "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "SI"},
    {"code": "81100", "name": "Subscriptions & Software",                       "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "SI"},
    {"code": "81200", "name": "Travel — Local",                                 "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "SI"},
    {"code": "81300", "name": "Travel — International (zero-rated)",            "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "Z"},
    {"code": "81400", "name": "Accommodation",                                  "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "SI"},
    {"code": "81500", "name": "Meals & Entertainment (non-deductible)",         "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "NV"},
    {"code": "81600", "name": "Telephone & Internet",                           "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "SI"},
    {"code": "81700", "name": "Bank Charges",                                   "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "E"},
    {"code": "81800", "name": "Professional Fees (Accounting / Legal)",         "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "SI"},
    {"code": "81900", "name": "Training & CPD",                                 "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "SI"},
    {"code": "82000", "name": "Stationery & Printing",                          "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "SI"},
    {"code": "82100", "name": "Insurance",                                      "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "E"},
    {"code": "82200", "name": "Rent",                                           "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "SI"},
    {"code": "82300", "name": "Utilities (Electricity, Water)",                 "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "SI"},
    {"code": "82400", "name": "Motor Vehicle Expenses",                         "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "SI"},
    {"code": "82500", "name": "Depreciation",                                   "type": "expense", "subtype": "opex",          "parent": "80000", "vat_code": "NV"},
    {"code": "82600", "name": "Salaries & Wages",                               "type": "expense", "subtype": "payroll",       "parent": "80000", "vat_code": "NV"},
    {"code": "82700", "name": "UIF Contribution (Employer)",                    "type": "expense", "subtype": "payroll",       "parent": "80000", "vat_code": "NV"},
    {"code": "82800", "name": "SDL Contribution (Employer)",                    "type": "expense", "subtype": "payroll",       "parent": "80000", "vat_code": "NV"},

    # --- FINANCE / TAX (9xxxx) ---
    {"code": "90000", "name": "Finance & Tax",                                  "type": "expense", "subtype": "header"},
    {"code": "91000", "name": "Interest Expense",                               "type": "expense", "subtype": "finance",       "parent": "90000", "vat_code": "E"},
    {"code": "91100", "name": "Foreign Exchange Loss / (Gain)",                 "type": "expense", "subtype": "finance",       "parent": "90000", "vat_code": "NV"},
    {"code": "92000", "name": "Corporate Income Tax Expense (27%)",             "type": "expense", "subtype": "tax",           "parent": "90000", "vat_code": "NV"},
]


def _D(v) -> Decimal:
    """Money helper: always 2-decimal Decimal (rounded half-up, ZAR cents)."""
    if v is None:
        return Decimal("0.00")
    return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _period_key(d: datetime | str) -> str:
    if isinstance(d, str):
        d = datetime.fromisoformat(d.replace("Z", "+00:00"))
    return d.strftime("%Y-%m")

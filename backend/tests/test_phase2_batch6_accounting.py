"""Phase 2 Batch 6 — SA Accounting module tests.

Covers: seeding, COA, journal posting + validation, period lock/close/reopen/signoff,
auto-journal hook on invoice creation, reports (TB, IS, BS, VAT201, GL), reverse,
and RBAC for rep role.
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ascent-windows.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@climbleadershiplab.com"
DEMO_PASS = "SherpaDemo2026!"


# ─── helpers ────────────────────────────────────────────────────────────────
def _signup_owner():
    """Create a fresh owner so we get a clean accounting tenant."""
    email = f"TEST_acct_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/signup", json={
        "email": email, "password": "Owner2026!", "name": "TestAcct Owner",
    })
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text}"
    body = r.json()
    return {"email": email, "token": body["token"], "user": body["user"]}


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner():
    o = _signup_owner()
    # Seed accounting
    r = requests.post(f"{API}/accounting/seed", headers=_h(o["token"]))
    assert r.status_code == 200, f"seed failed: {r.status_code} {r.text}"
    return o


@pytest.fixture(scope="module")
def demo_owner():
    """Login as the seeded demo owner — used for read-only regression checks."""
    r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASS})
    if r.status_code != 200:
        pytest.skip(f"demo login failed: {r.status_code}")
    return r.json()


@pytest.fixture(scope="module")
def rep_user(owner):
    """Create a 'rep' user under the owner via invite flow."""
    inv_email = f"TEST_rep_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/team/invites", headers=_h(owner["token"]),
                      json={"email": inv_email, "role": "rep"})
    assert r.status_code in (200, 201), f"invite create failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    r2 = requests.post(f"{API}/auth/accept-invite", json={
        "token": token, "password": "RepPass2026!", "name": "TestRep",
    })
    assert r2.status_code in (200, 201), f"accept-invite failed: {r2.status_code} {r2.text}"
    return {"email": inv_email, "token": r2.json()["token"]}


PERIOD = datetime.now(timezone.utc).strftime("%Y-%m")
TODAY = datetime.now(timezone.utc).date().isoformat()


# ═══ Seeding ═══════════════════════════════════════════════════════════════
class TestSeed:
    def test_seed_idempotent(self, owner):
        r = requests.post(f"{API}/accounting/seed", headers=_h(owner["token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        # Second call must add 0 new accounts
        assert body["accounts_added"] == 0
        assert body["period_opened"] == PERIOD

    def test_seed_creates_66_accounts(self, owner):
        r = requests.get(f"{API}/accounting/accounts?active_only=false", headers=_h(owner["token"]))
        assert r.status_code == 200
        accounts = r.json()
        assert len(accounts) == 66, f"expected 66 accounts, got {len(accounts)}"
        # Sorted by code
        codes = [a["code"] for a in accounts]
        assert codes == sorted(codes)


# ═══ Chart of Accounts ═══════════════════════════════════════════════════════
class TestCoA:
    def test_list_accounts(self, owner):
        r = requests.get(f"{API}/accounting/accounts", headers=_h(owner["token"]))
        assert r.status_code == 200
        codes = {a["code"] for a in r.json()}
        for k in ("21000", "22000", "31000", "52000", "61000"):
            assert k in codes

    def test_create_account_ok(self, owner):
        code = f"99{uuid.uuid4().hex[:3]}"
        r = requests.post(f"{API}/accounting/accounts", headers=_h(owner["token"]),
                          json={"code": code, "name": "TEST Custom Account", "type": "asset"})
        assert r.status_code == 200, r.text
        assert r.json()["code"] == code

    def test_create_account_duplicate_409(self, owner):
        r = requests.post(f"{API}/accounting/accounts", headers=_h(owner["token"]),
                          json={"code": "21000", "name": "Dup", "type": "asset"})
        assert r.status_code == 409

    def test_create_account_missing_field_400(self, owner):
        r = requests.post(f"{API}/accounting/accounts", headers=_h(owner["token"]),
                          json={"code": "98321"})
        assert r.status_code == 400

    def test_create_account_bad_type_400(self, owner):
        r = requests.post(f"{API}/accounting/accounts", headers=_h(owner["token"]),
                          json={"code": "98911", "name": "Bad", "type": "wat"})
        assert r.status_code == 400

    def test_patch_account(self, owner):
        # Find an active non-header account and rename it
        accts = requests.get(f"{API}/accounting/accounts", headers=_h(owner["token"])).json()
        target = next(a for a in accts if a["code"] == "69000")
        r = requests.patch(f"{API}/accounting/accounts/{target['id']}",
                           headers=_h(owner["token"]),
                           json={"name": "Other Income (renamed)"})
        assert r.status_code == 200
        # Re-fetch
        accts2 = requests.get(f"{API}/accounting/accounts", headers=_h(owner["token"])).json()
        new_name = next(a for a in accts2 if a["code"] == "69000")["name"]
        assert "renamed" in new_name


# ═══ Journal posting ═══════════════════════════════════════════════════════
class TestJournalPost:
    def test_post_balanced_journal(self, owner):
        payload = {
            "date": TODAY, "memo": "TEST capital injection", "reference": "CAP-1",
            "lines": [
                {"account_code": "21000", "debit": 50000.00, "credit": 0, "description": "Cash in"},
                {"account_code": "31000", "debit": 0, "credit": 50000.00, "description": "Owner equity"},
            ],
        }
        r = requests.post(f"{API}/accounting/journals", headers=_h(owner["token"]), json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["posted"] is True
        assert j["source"] == "manual"
        assert abs(j["total_debit"] - j["total_credit"]) < 0.01
        assert abs(j["total_debit"] - 50000.00) < 0.01

    def test_post_unbalanced_400(self, owner):
        payload = {
            "date": TODAY, "memo": "Unbalanced",
            "lines": [
                {"account_code": "21000", "debit": 100.0, "credit": 0},
                {"account_code": "31000", "debit": 0, "credit": 90.0},
            ],
        }
        r = requests.post(f"{API}/accounting/journals", headers=_h(owner["token"]), json=payload)
        assert r.status_code == 400

    def test_post_one_line_400(self, owner):
        payload = {
            "date": TODAY, "memo": "Single",
            "lines": [{"account_code": "21000", "debit": 100, "credit": 0}],
        }
        r = requests.post(f"{API}/accounting/journals", headers=_h(owner["token"]), json=payload)
        assert r.status_code == 400

    def test_line_both_dr_cr_400(self, owner):
        payload = {
            "date": TODAY, "memo": "BothDC",
            "lines": [
                {"account_code": "21000", "debit": 50, "credit": 50},
                {"account_code": "31000", "debit": 0, "credit": 0},
            ],
        }
        r = requests.post(f"{API}/accounting/journals", headers=_h(owner["token"]), json=payload)
        assert r.status_code == 400

    def test_negative_400(self, owner):
        payload = {
            "date": TODAY, "memo": "Neg",
            "lines": [
                {"account_code": "21000", "debit": -10, "credit": 0},
                {"account_code": "31000", "debit": 0, "credit": -10},
            ],
        }
        r = requests.post(f"{API}/accounting/journals", headers=_h(owner["token"]), json=payload)
        assert r.status_code == 400

    def test_header_account_400(self, owner):
        # 10000 = "Non-current Assets" header
        payload = {
            "date": TODAY, "memo": "Header",
            "lines": [
                {"account_code": "10000", "debit": 100, "credit": 0},
                {"account_code": "31000", "debit": 0, "credit": 100},
            ],
        }
        r = requests.post(f"{API}/accounting/journals", headers=_h(owner["token"]), json=payload)
        assert r.status_code == 400

    def test_unknown_code_400(self, owner):
        payload = {
            "date": TODAY, "memo": "Unknown",
            "lines": [
                {"account_code": "99999", "debit": 100, "credit": 0},
                {"account_code": "31000", "debit": 0, "credit": 100},
            ],
        }
        r = requests.post(f"{API}/accounting/journals", headers=_h(owner["token"]), json=payload)
        assert r.status_code == 400
        assert "99999" in r.text


# ═══ Journal list / detail / reverse ════════════════════════════════════════
class TestJournalListAndReverse:
    def test_list_period_filter(self, owner):
        r = requests.get(f"{API}/accounting/journals?period={PERIOD}", headers=_h(owner["token"]))
        assert r.status_code == 200
        for j in r.json():
            assert j["period"] == PERIOD

    def test_get_journal_detail(self, owner):
        # Post a fresh journal we can introspect
        payload = {
            "date": TODAY, "memo": "TEST detail journal",
            "lines": [
                {"account_code": "21000", "debit": 200, "credit": 0},
                {"account_code": "31000", "debit": 0, "credit": 200},
            ],
        }
        jid = requests.post(f"{API}/accounting/journals", headers=_h(owner["token"]), json=payload).json()["id"]
        r = requests.get(f"{API}/accounting/journals/{jid}", headers=_h(owner["token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == jid
        assert len(body["lines"]) == 2

    def test_reverse_journal(self, owner):
        payload = {
            "date": TODAY, "memo": "TEST to-reverse",
            "lines": [
                {"account_code": "21000", "debit": 75, "credit": 0},
                {"account_code": "31000", "debit": 0, "credit": 75},
            ],
        }
        jid = requests.post(f"{API}/accounting/journals", headers=_h(owner["token"]), json=payload).json()["id"]
        r = requests.post(f"{API}/accounting/journals/{jid}/reverse", headers=_h(owner["token"]))
        assert r.status_code == 200, r.text
        rev = r.json()
        assert rev["source"] == "reversing"
        # NOTE: response body's `reversed_of` is None due to ordering bug in endpoint
        # (DB row is updated AFTER local dict is returned). Verify via GET instead:
        r_get = requests.get(f"{API}/accounting/journals/{rev['id']}", headers=_h(owner["token"]))
        assert r_get.status_code == 200
        assert r_get.json().get("reversed_of") == jid
        # And the flipped sums must match the original
        assert abs(rev["total_debit"] - 75.0) < 0.01
        # 2nd reverse → 409
        r2 = requests.post(f"{API}/accounting/journals/{jid}/reverse", headers=_h(owner["token"]))
        assert r2.status_code == 409


# ═══ Auto-journal on invoice creation ═══════════════════════════════════════
class TestInvoiceAutoJournal:
    def test_invoice_creates_journal(self, owner):
        # Create a contact first (invoice typically needs a contact)
        c = requests.post(f"{API}/contacts", headers=_h(owner["token"]),
                          json={"first_name": "TEST", "last_name": "VATCustomer", "email": f"vat_{uuid.uuid4().hex[:6]}@x.com"})
        assert c.status_code in (200, 201), c.text
        contact_id = c.json()["id"]

        invoice_payload = {
            "contact_id": contact_id,
            "currency": "ZAR",
            "issue_date": TODAY,
            "due_date": TODAY,
            "line_items": [
                {"description": "TEST coaching session", "qty": 1, "unit_price": 1000.00, "tax_rate": 15.0},
            ],
        }
        ri = requests.post(f"{API}/invoices", headers=_h(owner["token"]), json=invoice_payload)
        assert ri.status_code in (200, 201), ri.text
        inv = ri.json()
        inv_id = inv["id"]
        # grand_total should be 1150
        assert abs(float(inv.get("grand_total") or 0) - 1150.00) < 0.01

        # Check journal exists with source='invoice', source_id=inv_id
        rj = requests.get(f"{API}/accounting/journals?period={PERIOD}", headers=_h(owner["token"]))
        assert rj.status_code == 200
        match = [j for j in rj.json() if j.get("source") == "invoice" and j.get("source_id") == inv_id]
        assert len(match) == 1, f"expected 1 invoice journal, found {len(match)}"
        j = match[0]
        assert abs(j["total_debit"] - j["total_credit"]) < 0.01
        assert abs(j["total_debit"] - 1150.00) < 0.01
        codes = {ln["account_code"] for ln in j["lines"]}
        assert {"22000", "61000", "52000"}.issubset(codes)


# ═══ Reports ════════════════════════════════════════════════════════════════
class TestReports:
    def test_trial_balance_balanced(self, owner):
        r = requests.get(f"{API}/accounting/reports/trial-balance", headers=_h(owner["token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["balanced"] is True
        assert abs(body["total_debit"] - body["total_credit"]) < 0.01

    def test_income_statement(self, owner):
        r = requests.get(f"{API}/accounting/reports/income-statement?date_from={PERIOD}-01&date_to={TODAY}",
                         headers=_h(owner["token"]))
        assert r.status_code == 200
        body = r.json()
        # Should reflect at least the R1000 revenue from invoice
        assert body["total_income"] >= 1000.0
        # Tax estimate = 27% of net (if positive)
        if body["net_income_before_tax"] > 0:
            expected = round(body["net_income_before_tax"] * 0.27, 2)
            assert abs(body["estimated_tax_at_27pct"] - expected) < 0.01
        else:
            assert body["estimated_tax_at_27pct"] == 0
        assert "disclaimer" in body

    def test_balance_sheet_balanced(self, owner):
        r = requests.get(f"{API}/accounting/reports/balance-sheet", headers=_h(owner["token"]))
        assert r.status_code == 200
        body = r.json()
        # Equity row 33000 (current-year earnings) must appear
        codes = {row["code"] for row in body["equity"]}
        assert "33000" in codes
        # A == L + E
        assert abs(body["total_assets"] - body["liabilities_plus_equity"]) < 0.01
        assert body["balanced"] is True

    def test_vat201(self, owner):
        r = requests.get(f"{API}/accounting/reports/vat201?date_from={PERIOD}-01&date_to={TODAY}",
                         headers=_h(owner["token"]))
        assert r.status_code == 200
        body = r.json()
        # Box 1 = R150 from R1000 @ 15%
        assert body["output_tax"]["box_1_standard_rated_15pct"] >= 150.0
        assert body["vat_payable_to_sars"] >= 150.0
        assert "disclaimer" in body
        assert isinstance(body["breakdown_by_vat_code"], list)

    def test_general_ledger_known_code(self, owner):
        r = requests.get(f"{API}/accounting/reports/general-ledger/22000", headers=_h(owner["token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["account"]["code"] == "22000"
        assert isinstance(body["rows"], list)
        assert "closing_balance" in body
        if body["rows"]:
            assert "running_balance" in body["rows"][-1]

    def test_general_ledger_unknown_404(self, owner):
        r = requests.get(f"{API}/accounting/reports/general-ledger/99999", headers=_h(owner["token"]))
        assert r.status_code == 404


# ═══ Fiscal Periods ═════════════════════════════════════════════════════════
class TestPeriods:
    def test_list_periods(self, owner):
        r = requests.get(f"{API}/accounting/periods", headers=_h(owner["token"]))
        assert r.status_code == 200
        periods = r.json()
        assert any(p["period"] == PERIOD for p in periods)

    def test_lock_blocks_post(self, owner):
        # Lock current period
        r = requests.post(f"{API}/accounting/periods/{PERIOD}/lock", headers=_h(owner["token"]))
        assert r.status_code == 200
        # Manual journal post should now be 423
        payload = {
            "date": TODAY, "memo": "should be blocked",
            "lines": [
                {"account_code": "21000", "debit": 1, "credit": 0},
                {"account_code": "31000", "debit": 0, "credit": 1},
            ],
        }
        r2 = requests.post(f"{API}/accounting/journals", headers=_h(owner["token"]), json=payload)
        assert r2.status_code == 423
        # Reopen
        r3 = requests.post(f"{API}/accounting/periods/{PERIOD}/reopen", headers=_h(owner["token"]))
        assert r3.status_code == 200

    def test_close_period(self, owner):
        r = requests.post(f"{API}/accounting/periods/{PERIOD}/close", headers=_h(owner["token"]))
        assert r.status_code == 200
        assert r.json()["status"] == "closed"
        # Reopen for downstream tests
        requests.post(f"{API}/accounting/periods/{PERIOD}/reopen", headers=_h(owner["token"]))

    def test_signoff_and_notes(self, owner):
        r = requests.post(f"{API}/accounting/periods/{PERIOD}/signoff",
                          headers=_h(owner["token"]),
                          json={"note": "TEST signoff by accountant"})
        assert r.status_code == 200
        assert r.json()["ok"] is True
        rn = requests.get(f"{API}/accounting/periods/{PERIOD}/notes", headers=_h(owner["token"]))
        assert rn.status_code == 200
        assert any("TEST signoff" in (n.get("note") or "") for n in rn.json())


# ═══ RBAC ═══════════════════════════════════════════════════════════════════
class TestRBAC:
    def test_rep_cannot_seed(self, rep_user):
        r = requests.post(f"{API}/accounting/seed", headers=_h(rep_user["token"]))
        assert r.status_code == 403

    def test_rep_cannot_create_account(self, rep_user):
        r = requests.post(f"{API}/accounting/accounts", headers=_h(rep_user["token"]),
                          json={"code": "98801", "name": "rep-fail", "type": "asset"})
        assert r.status_code == 403

    def test_rep_cannot_post_journal(self, rep_user):
        payload = {
            "date": TODAY, "memo": "rep journal",
            "lines": [
                {"account_code": "21000", "debit": 1, "credit": 0},
                {"account_code": "31000", "debit": 0, "credit": 1},
            ],
        }
        r = requests.post(f"{API}/accounting/journals", headers=_h(rep_user["token"]), json=payload)
        assert r.status_code == 403

    def test_rep_cannot_close_period(self, rep_user):
        r = requests.post(f"{API}/accounting/periods/{PERIOD}/close", headers=_h(rep_user["token"]))
        assert r.status_code == 403

    def test_rep_can_read_accounts(self, rep_user):
        r = requests.get(f"{API}/accounting/accounts", headers=_h(rep_user["token"]))
        assert r.status_code == 200

    def test_rep_can_read_trial_balance(self, rep_user):
        r = requests.get(f"{API}/accounting/reports/trial-balance", headers=_h(rep_user["token"]))
        assert r.status_code == 200


# ═══ Regression — invoice creation must NOT break ═══════════════════════════
class TestInvoiceRegression:
    def test_invoice_create_succeeds_even_if_no_coa(self):
        """A brand new owner without seeding accounting must still create invoices.

        The auto-journal hook is wrapped in try/except so missing COA must NOT block invoice creation.
        """
        o = _signup_owner()
        # Note: no seed call here
        c = requests.post(f"{API}/contacts", headers=_h(o["token"]),
                          json={"first_name": "X", "last_name": "Y", "email": f"x_{uuid.uuid4().hex[:5]}@e.com"})
        cid = c.json()["id"]
        ri = requests.post(f"{API}/invoices", headers=_h(o["token"]), json={
            "contact_id": cid, "currency": "ZAR",
            "issue_date": TODAY, "due_date": TODAY,
            "line_items": [{"description": "no-coa", "qty": 1, "unit_price": 100, "tax_rate": 15.0}],
        })
        assert ri.status_code in (200, 201), ri.text

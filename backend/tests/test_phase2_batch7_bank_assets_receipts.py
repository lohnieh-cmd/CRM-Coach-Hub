"""Phase 2 Batch 7 — Bank feeds + reconciliation, Fixed Assets + depreciation,
Receipt OCR (Gemini 3), and PDF exports of the 4 accounting reports.

Covers: PDF exports (TB/IS/BS/VAT201), Bank accounts CRUD, CSV import + dup_hash,
suggest-matches, reconcile (invoice + expense) + unreconcile (reverse),
Fixed-asset CRUD + monthly depreciation + idempotency, OCR receipts scan/list/post/delete, RBAC.
"""
import io
import os
import uuid
import csv as _csv
from datetime import datetime, timezone

import pytest
import requests

# Read REACT_APP_BACKEND_URL from frontend/.env if not in env
def _load_base_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if url:
        return url.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    return ""


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@climbleadershiplab.com"
DEMO_PASS = "SherpaDemo2026!"

TODAY = datetime.now(timezone.utc).date().isoformat()
PERIOD = datetime.now(timezone.utc).strftime("%Y-%m")


# ─── helpers ─────────────────────────────────────────────────────────────────
def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _signup_owner():
    email = f"TEST_b7_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/signup", json={
        "email": email, "password": "Owner2026!", "name": "B7 Owner",
    })
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text}"
    return {"email": email, "token": r.json()["token"], "user": r.json()["user"]}


@pytest.fixture(scope="module")
def owner():
    o = _signup_owner()
    r = requests.post(f"{API}/accounting/seed", headers=_h(o["token"]))
    assert r.status_code == 200, f"seed failed: {r.text}"
    # Create one invoice so reports have content for PDF
    c = requests.post(f"{API}/contacts", headers=_h(o["token"]),
                      json={"first_name": "TEST", "last_name": "B7", "email": f"b7_{uuid.uuid4().hex[:6]}@x.com"})
    cid = c.json()["id"]
    inv = requests.post(f"{API}/invoices", headers=_h(o["token"]), json={
        "contact_id": cid, "currency": "ZAR",
        "issue_date": TODAY, "due_date": TODAY,
        "line_items": [{"description": "B7 seed", "qty": 1, "unit_price": 1000.0, "tax_rate": 15.0}],
    })
    assert inv.status_code in (200, 201), inv.text
    o["invoice"] = inv.json()
    o["contact_id"] = cid
    return o


@pytest.fixture(scope="module")
def rep_user(owner):
    inv_email = f"TEST_b7rep_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/team/invites", headers=_h(owner["token"]),
                      json={"email": inv_email, "role": "rep"})
    assert r.status_code in (200, 201), r.text
    token = r.json()["token"]
    r2 = requests.post(f"{API}/auth/accept-invite", json={
        "token": token, "password": "RepPass2026!", "name": "B7 Rep",
    })
    assert r2.status_code in (200, 201), r2.text
    return {"email": inv_email, "token": r2.json()["token"]}


# ═══ PDF exports ══════════════════════════════════════════════════════════════
class TestPdfExports:
    def _assert_pdf(self, r):
        assert r.status_code == 200, r.text[:300]
        ct = r.headers.get("content-type", "")
        assert "application/pdf" in ct, f"bad content-type: {ct}"
        assert r.content.startswith(b"%PDF-"), f"missing PDF magic bytes, got: {r.content[:10]!r}"
        assert len(r.content) > 500, "PDF suspiciously small"

    def test_trial_balance_pdf(self, owner):
        r = requests.get(f"{API}/accounting/reports/trial-balance/pdf?date_to={TODAY}",
                         headers=_h(owner["token"]))
        self._assert_pdf(r)

    def test_income_statement_pdf(self, owner):
        r = requests.get(
            f"{API}/accounting/reports/income-statement/pdf?date_from={PERIOD}-01&date_to={TODAY}",
            headers=_h(owner["token"]),
        )
        self._assert_pdf(r)

    def test_balance_sheet_pdf(self, owner):
        r = requests.get(f"{API}/accounting/reports/balance-sheet/pdf?as_at={TODAY}",
                         headers=_h(owner["token"]))
        self._assert_pdf(r)

    def test_vat201_pdf(self, owner):
        r = requests.get(
            f"{API}/accounting/reports/vat201/pdf?date_from={PERIOD}-01&date_to={TODAY}",
            headers=_h(owner["token"]),
        )
        self._assert_pdf(r)


# ═══ Bank accounts CRUD ══════════════════════════════════════════════════════
class TestBankAccountsCRUD:
    def test_create_bank_account(self, owner):
        r = requests.post(f"{API}/accounting/bank-accounts", headers=_h(owner["token"]),
                          json={"name": "TEST Main FNB Cheque", "bank": "FNB",
                                "account_number": "6201234567", "gl_account_code": "21000"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == "TEST Main FNB Cheque"
        assert body["bank"] == "FNB"
        assert "id" in body
        owner["bank_id"] = body["id"]

    def test_list_bank_accounts(self, owner):
        r = requests.get(f"{API}/accounting/bank-accounts", headers=_h(owner["token"]))
        assert r.status_code == 200
        ids = [b["id"] for b in r.json()]
        assert owner["bank_id"] in ids

    def test_rep_cannot_create_bank_account(self, rep_user):
        r = requests.post(f"{API}/accounting/bank-accounts", headers=_h(rep_user["token"]),
                          json={"name": "rep fail", "bank": "X"})
        assert r.status_code == 403


# ═══ Bank CSV import + transactions ══════════════════════════════════════════
def _build_csv(rows):
    buf = io.StringIO()
    w = _csv.writer(buf)
    w.writerow(["date", "description", "amount", "balance"])
    for r in rows:
        w.writerow(r)
    return buf.getvalue().encode("utf-8")


class TestBankCsvImport:
    def test_import_csv_5_rows(self, owner):
        bid = owner["bank_id"]
        inv_total = float(owner["invoice"]["grand_total"])  # 1150
        rows = [
            [TODAY, "Salary deposit ABC", 15000.00, 20000.00],
            [TODAY, f"Invoice {owner['invoice'].get('number')} payment", inv_total, 21150.00],
            [TODAY, "Checkers groceries", -450.75, 20699.25],
            [TODAY, "Uber to client", -120.00, 20579.25],
            [TODAY, "Monthly bank fee", -85.00, 20494.25],
        ]
        files = {"file": ("test.csv", _build_csv(rows), "text/csv")}
        r = requests.post(f"{API}/accounting/bank-accounts/{bid}/import-csv",
                          headers={"Authorization": f"Bearer {owner['token']}"}, files=files)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["inserted"] == 5, body
        assert body["skipped_duplicates"] == 0

        # Re-import same CSV → all 5 duplicates
        files2 = {"file": ("test.csv", _build_csv(rows), "text/csv")}
        r2 = requests.post(f"{API}/accounting/bank-accounts/{bid}/import-csv",
                           headers={"Authorization": f"Bearer {owner['token']}"}, files=files2)
        assert r2.status_code == 200
        assert r2.json()["skipped_duplicates"] == 5

    def test_list_unreconciled(self, owner):
        bid = owner["bank_id"]
        r = requests.get(
            f"{API}/accounting/bank-accounts/{bid}/transactions?status=unreconciled",
            headers=_h(owner["token"]),
        )
        assert r.status_code == 200
        txs = r.json()
        assert len(txs) == 5
        # Sorted by date desc (all same today, just ensure list)
        assert all(t["status"] == "unreconciled" for t in txs)
        owner["txs"] = txs

    def test_csv_missing_column_400(self, owner):
        bid = owner["bank_id"]
        bad = b"date,description\n2026-01-01,no amount\n"
        r = requests.post(f"{API}/accounting/bank-accounts/{bid}/import-csv",
                          headers={"Authorization": f"Bearer {owner['token']}"},
                          files={"file": ("bad.csv", bad, "text/csv")})
        assert r.status_code == 400


# ═══ Suggest matches ═════════════════════════════════════════════════════════
class TestSuggestMatches:
    def test_suggest_matches_for_invoice_payment(self, owner):
        # Find the inbound 1150 tx
        tgt = next((t for t in owner["txs"] if abs(t["amount"] - float(owner["invoice"]["grand_total"])) < 0.01), None)
        assert tgt, "expected inbound 1150 tx"
        r = requests.get(f"{API}/accounting/bank-transactions/{tgt['id']}/suggest-matches",
                         headers=_h(owner["token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["transaction"]["id"] == tgt["id"]
        # Must suggest our seeded invoice
        ids = [s["id"] for s in body["suggestions"]]
        assert owner["invoice"]["id"] in ids, f"invoice not suggested; got {body['suggestions']}"
        owner["match_tx"] = tgt


# ═══ Reconcile (invoice) + Unreconcile ═══════════════════════════════════════
class TestReconcileInvoice:
    def test_reconcile_invoice_match(self, owner):
        tx = owner["match_tx"]
        r = requests.post(f"{API}/accounting/bank-transactions/{tx['id']}/reconcile",
                          headers=_h(owner["token"]),
                          json={"match_type": "invoice", "invoice_id": owner["invoice"]["id"]})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["invoice_paid"] == owner["invoice"]["id"]
        jid = body["journal_id"]
        # Verify journal balanced
        j = requests.get(f"{API}/accounting/journals/{jid}", headers=_h(owner["token"])).json()
        assert abs(j["total_debit"] - j["total_credit"]) < 0.01
        assert j["total_debit"] > 0
        codes = [ln["account_code"] for ln in j["lines"]]
        # DR 21000 (bank) / CR 22000 (debtors)
        assert "21000" in codes and "22000" in codes
        # Tx now reconciled
        txlist = requests.get(f"{API}/accounting/bank-accounts/{owner['bank_id']}/transactions",
                              headers=_h(owner["token"])).json()
        new_tx = next(t for t in txlist if t["id"] == tx["id"])
        assert new_tx["status"] == "reconciled"
        assert new_tx["journal_id"] == jid
        owner["reconciled_tx"] = new_tx

    def test_unreconcile_creates_reverse(self, owner):
        tx = owner["reconciled_tx"]
        orig_jid = tx["journal_id"]
        r = requests.post(f"{API}/accounting/bank-transactions/{tx['id']}/unreconcile",
                          headers=_h(owner["token"]))
        assert r.status_code == 200, r.text
        # Reversal journal must exist with flipped sums
        orig = requests.get(f"{API}/accounting/journals/{orig_jid}", headers=_h(owner["token"])).json()
        assert orig.get("reversed_by"), "original journal should be flagged reversed_by"
        rev = requests.get(f"{API}/accounting/journals/{orig['reversed_by']}",
                           headers=_h(owner["token"])).json()
        assert rev["source"] == "reversing"
        assert abs(rev["total_debit"] - rev["total_credit"]) < 0.01
        assert abs(rev["total_debit"] - orig["total_debit"]) < 0.01
        # Tx unreconciled
        tlist = requests.get(f"{API}/accounting/bank-accounts/{owner['bank_id']}/transactions",
                             headers=_h(owner["token"])).json()
        ntx = next(t for t in tlist if t["id"] == tx["id"])
        assert ntx["status"] == "unreconciled"


# ═══ Reconcile (expense / direct-to-account) ═════════════════════════════════
class TestReconcileExpense:
    def test_reconcile_expense_match(self, owner):
        # pick a money-out tx
        out_tx = next((t for t in owner["txs"] if t["direction"] == "out" and abs(t["amount"] + 450.75) < 0.01), None)
        assert out_tx, "need money-out tx"
        r = requests.post(f"{API}/accounting/bank-transactions/{out_tx['id']}/reconcile",
                          headers=_h(owner["token"]),
                          json={"match_type": "expense", "expense_account_code": "81100",
                                "description": "Groceries for staff"})
        assert r.status_code == 200, r.text
        jid = r.json()["journal_id"]
        j = requests.get(f"{API}/accounting/journals/{jid}", headers=_h(owner["token"])).json()
        assert abs(j["total_debit"] - j["total_credit"]) < 0.01
        assert all((ln["debit"] >= 0 and ln["credit"] >= 0) for ln in j["lines"])
        # No line should be both dr+cr or zero
        for ln in j["lines"]:
            assert not (ln["debit"] > 0 and ln["credit"] > 0)
            assert (ln["debit"] + ln["credit"]) > 0

    def test_reconcile_missing_account_400(self, owner):
        out_tx = next(t for t in owner["txs"] if t["direction"] == "out" and abs(t["amount"] + 120.00) < 0.01)
        r = requests.post(f"{API}/accounting/bank-transactions/{out_tx['id']}/reconcile",
                          headers=_h(owner["token"]),
                          json={"match_type": "expense"})
        assert r.status_code == 400


# ═══ Fixed Assets CRUD + Depreciation ════════════════════════════════════════
class TestFixedAssets:
    def test_create_asset(self, owner):
        r = requests.post(f"{API}/accounting/fixed-assets", headers=_h(owner["token"]),
                          json={"name": "TEST MacBook Pro",
                                "asset_category": "computers",
                                "acquisition_date": "2025-01-01",
                                "acquisition_cost": 36000.0,
                                "residual_value": 0.0,
                                "useful_life_months": 36,
                                "depreciation_method": "straight_line",
                                "asset_account_code": "21200",
                                "accumulated_depr_account_code": "21100",
                                "depreciation_expense_account_code": "82500"})
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["book_value"] == 36000.0
        assert a["status"] == "active"
        owner["asset_id"] = a["id"]

    def test_get_asset_with_schedule(self, owner):
        r = requests.get(f"{API}/accounting/fixed-assets/{owner['asset_id']}",
                         headers=_h(owner["token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["monthly_depreciation"] == 1000.0  # 36000/36
        assert len(body["schedule"]) == 36
        assert body["schedule"][-1]["book_value"] == 0

    def test_list_assets(self, owner):
        r = requests.get(f"{API}/accounting/fixed-assets", headers=_h(owner["token"]))
        assert r.status_code == 200
        assert any(a["id"] == owner["asset_id"] for a in r.json())

    def test_bad_cost_400(self, owner):
        r = requests.post(f"{API}/accounting/fixed-assets", headers=_h(owner["token"]),
                          json={"name": "X", "acquisition_date": "2025-01-01",
                                "acquisition_cost": 0, "useful_life_months": 12})
        assert r.status_code == 400

    def test_depreciation_run(self, owner):
        r = requests.post(f"{API}/accounting/fixed-assets/depreciate",
                          headers=_h(owner["token"]),
                          json={"period": PERIOD})
        assert r.status_code == 200, r.text
        body = r.json()
        # At least 1 asset posted (MacBook)
        posted_ids = [p["id"] for p in body["posted"]]
        assert owner["asset_id"] in posted_ids, f"asset not depreciated; body={body}"
        post = next(p for p in body["posted"] if p["id"] == owner["asset_id"])
        assert abs(post["amount"] - 1000.0) < 0.01
        # Verify journal: DR 82500 / CR 21100 balanced
        j = requests.get(f"{API}/accounting/journals/{post['journal_id']}",
                         headers=_h(owner["token"])).json()
        assert abs(j["total_debit"] - j["total_credit"]) < 0.01
        codes = [ln["account_code"] for ln in j["lines"]]
        assert "82500" in codes and "21100" in codes
        # Idempotent — run again same period = all skipped
        r2 = requests.post(f"{API}/accounting/fixed-assets/depreciate",
                           headers=_h(owner["token"]),
                           json={"period": PERIOD})
        assert r2.status_code == 200
        posted2 = [p["id"] for p in r2.json()["posted"]]
        assert owner["asset_id"] not in posted2

    def test_dispose_asset(self, owner):
        # Create a throwaway asset to dispose
        r = requests.post(f"{API}/accounting/fixed-assets", headers=_h(owner["token"]),
                          json={"name": "TEST Old Printer", "acquisition_date": "2024-01-01",
                                "acquisition_cost": 5000, "useful_life_months": 60,
                                "asset_account_code": "21200",
                                "accumulated_depr_account_code": "21100",
                                "depreciation_expense_account_code": "82500"})
        aid = r.json()["id"]
        rd = requests.delete(f"{API}/accounting/fixed-assets/{aid}", headers=_h(owner["token"]))
        assert rd.status_code == 200
        assert rd.json()["status"] == "disposed"


# ═══ OCR receipts ════════════════════════════════════════════════════════════
def _make_jpeg_receipt():
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (480, 640), "white")
    d = ImageDraw.Draw(img)
    d.text((10, 30),  "CHECKERS SUPERMARKET", fill="black")
    d.text((10, 60),  "Date: 2026-01-05", fill="black")
    d.text((10, 100), "Coffee Beans   R 86.96", fill="black")
    d.text((10, 130), "Subtotal:      R 100.00", fill="black")
    d.text((10, 160), "VAT 15%:       R  15.00", fill="black")
    d.text((10, 190), "TOTAL:         R 115.00", fill="black")
    d.text((10, 240), "VAT NO 4567890123", fill="black")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    buf.seek(0)
    return buf.read()


class TestReceipts:
    def test_scan_receipt(self, owner):
        img_bytes = _make_jpeg_receipt()
        files = {"file": ("receipt.jpg", img_bytes, "image/jpeg")}
        r = requests.post(f"{API}/accounting/receipts/scan",
                          headers={"Authorization": f"Bearer {owner['token']}"},
                          files=files, timeout=60)
        assert r.status_code == 200, r.text[:400]
        body = r.json()
        assert body["status"] == "pending_review"
        assert "id" in body
        assert "extracted" in body
        owner["receipt_id"] = body["id"]
        owner["receipt_extracted"] = body["extracted"] or {}

    def test_list_receipts(self, owner):
        r = requests.get(f"{API}/accounting/receipts", headers=_h(owner["token"]))
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert owner["receipt_id"] in ids

    def test_post_receipt_as_expense(self, owner):
        rid = owner["receipt_id"]
        # Use explicit overrides so the test doesn't depend on OCR quality
        body = {"expense_account_code": "81100",  # Subscriptions & Software
                "payment_account_code": "51000",
                "vendor": "Checkers", "date": TODAY,
                "subtotal": 100.0, "vat": 15.0, "total": 115.0,
                "vat_code": "SI"}
        r = requests.post(f"{API}/accounting/receipts/{rid}/post",
                          headers=_h(owner["token"]), json=body)
        assert r.status_code == 200, r.text
        jid = r.json()["journal_id"]
        # Verify journal balanced, DR expense + DR VAT input, CR creditors
        j = requests.get(f"{API}/accounting/journals/{jid}", headers=_h(owner["token"])).json()
        assert abs(j["total_debit"] - j["total_credit"]) < 0.01
        assert abs(j["total_debit"] - 115.0) < 0.01
        codes = [ln["account_code"] for ln in j["lines"]]
        assert "81100" in codes and "23000" in codes and "51000" in codes
        # Receipt status flipped
        lst = requests.get(f"{API}/accounting/receipts", headers=_h(owner["token"])).json()
        rcp = next(x for x in lst if x["id"] == rid)
        assert rcp["status"] == "posted"
        assert rcp["journal_id"] == jid

    def test_delete_posted_400(self, owner):
        r = requests.delete(f"{API}/accounting/receipts/{owner['receipt_id']}",
                            headers=_h(owner["token"]))
        assert r.status_code == 400  # cannot delete posted

    def test_delete_pending_receipt(self, owner):
        # scan again → then delete immediately
        img = _make_jpeg_receipt()
        r = requests.post(f"{API}/accounting/receipts/scan",
                          headers={"Authorization": f"Bearer {owner['token']}"},
                          files={"file": ("recv2.jpg", img, "image/jpeg")}, timeout=60)
        assert r.status_code == 200
        rid = r.json()["id"]
        rd = requests.delete(f"{API}/accounting/receipts/{rid}", headers=_h(owner["token"]))
        assert rd.status_code == 200

    def test_unsupported_filetype_400(self, owner):
        r = requests.post(f"{API}/accounting/receipts/scan",
                          headers={"Authorization": f"Bearer {owner['token']}"},
                          files={"file": ("bad.txt", b"hi", "text/plain")})
        assert r.status_code == 400


# ═══ RBAC gating ═════════════════════════════════════════════════════════════
class TestBatch7RBAC:
    def test_rep_cannot_import_csv(self, rep_user, owner):
        bid = owner["bank_id"]
        r = requests.post(f"{API}/accounting/bank-accounts/{bid}/import-csv",
                          headers={"Authorization": f"Bearer {rep_user['token']}"},
                          files={"file": ("x.csv", _build_csv([[TODAY, "x", 1, 1]]), "text/csv")})
        assert r.status_code == 403

    def test_rep_cannot_create_fixed_asset(self, rep_user):
        r = requests.post(f"{API}/accounting/fixed-assets", headers=_h(rep_user["token"]),
                          json={"name": "X", "acquisition_date": "2025-01-01",
                                "acquisition_cost": 1000, "useful_life_months": 12})
        assert r.status_code == 403

    def test_rep_cannot_depreciate(self, rep_user):
        r = requests.post(f"{API}/accounting/fixed-assets/depreciate",
                          headers=_h(rep_user["token"]), json={"period": PERIOD})
        assert r.status_code == 403

    def test_rep_cannot_post_receipt(self, rep_user, owner):
        # even if we hand them a rid, they should 403 (require_accountant on scan too)
        r = requests.post(f"{API}/accounting/receipts/scan",
                          headers={"Authorization": f"Bearer {rep_user['token']}"},
                          files={"file": ("r.jpg", _make_jpeg_receipt(), "image/jpeg")})
        assert r.status_code == 403


# ═══ Cross-tenant isolation check ════════════════════════════════════════════
class TestTenantIsolation:
    def test_bank_account_not_visible_to_another_owner(self, owner):
        other = _signup_owner()
        r = requests.get(f"{API}/accounting/bank-accounts", headers=_h(other["token"]))
        assert r.status_code == 200
        assert all(b["id"] != owner["bank_id"] for b in r.json())

    def test_cannot_reconcile_other_owners_tx(self, owner):
        other = _signup_owner()
        requests.post(f"{API}/accounting/seed", headers=_h(other["token"]))
        # Use the original owner's first tx id (from the module state)
        some_tx = owner["txs"][0]["id"]
        r = requests.post(f"{API}/accounting/bank-transactions/{some_tx}/reconcile",
                          headers=_h(other["token"]),
                          json={"match_type": "expense", "expense_account_code": "81100"})
        assert r.status_code == 404  # not visible to other tenant

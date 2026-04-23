"""
Phase 2 Batch 5 tests — Quote valid_days auto-compute, Word .docx export,
PDF attachments (quotes/invoices), Company→Contacts link.

Covers:
- POST /api/quotes with valid_days → server computes valid_until = today + N days
  Same for PUT, and explicit valid_until wins over valid_days.
- GET /api/quotes/{id}/export/docx → real .docx (zip magic), correct headers,
  python-docx round-trip with quote number visible, audit row written, 401/404.
- POST /api/{quotes|invoices}/{id}/attachments — PDF upload, disk persistence,
  bad-extension 400, unknown-resource 400, foreign owner 404, auth 401.
- GET /api/{quotes|invoices}/{id}/attachments — lists attachment rows minus disk_path.
- GET /api/attachments/{att_id}/download — bytes returned with correct content-type;
  cross-tenant 404.
- DELETE /api/attachments/{att_id} — DB row gone, file removed; cross-tenant 404.
- GET /api/companies/{cid}/contacts — owner-scoped list, 404 on foreign company.
"""

import io
import os
import uuid
import pytest
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path

import docx  # python-docx (already installed because server uses it)

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://sa-coaching-crm.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

OWNER_EMAIL = "demo@climbleadershiplab.com"
OWNER_PASSWORD = "SherpaDemo2026!"

# tiny but valid PDF body (header + EOF marker — enough for upload tests)
TINY_PDF = (
    b"%PDF-1.4\n"
    b"1 0 obj <<>> endobj\n"
    b"trailer <<>>\n"
    b"%%EOF\n"
)


# ── helpers ────────────────────────────────────────────────────────────────────
def _hdr(tok, ctype_json=True):
    h = {"Authorization": f"Bearer {tok}"}
    if ctype_json:
        h["Content-Type"] = "application/json"
    return h


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def second_owner_token():
    """Register a fresh owner for cross-tenant isolation tests."""
    email = f"TEST_owner_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/signup", json={
        "email": email, "password": "Secondary2026!", "name": "TEST Second Owner"
    })
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text[:200]}"
    body = r.json()
    assert "token" in body, f"no token in signup response: {body}"
    return body["token"]


@pytest.fixture(scope="module")
def a_contact(owner_token):
    rs = requests.get(f"{API}/contacts", headers=_hdr(owner_token))
    assert rs.status_code == 200
    if rs.json():
        return rs.json()[0]
    r = requests.post(f"{API}/contacts", headers=_hdr(owner_token), json={
        "first_name": "TEST", "last_name": "B5", "email": f"TEST_b5_{uuid.uuid4().hex[:6]}@example.com"
    })
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture(scope="module")
def a_quote(owner_token, a_contact):
    body = {
        "number": f"TEST-Q-{uuid.uuid4().hex[:6].upper()}",
        "contact_id": a_contact["id"],
        "currency": "USD",
        "line_items": [{"description": "Test svc", "qty": 2, "unit_price": 50.0, "discount_pct": 0}],
        "subtotal": 100.0, "tax_total": 0.0, "grand_total": 100.0,
        "status": "draft",
    }
    r = requests.post(f"{API}/quotes", headers=_hdr(owner_token), json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture(scope="module")
def an_invoice(owner_token, a_contact):
    body = {
        "number": f"TEST-INV-{uuid.uuid4().hex[:6].upper()}",
        "contact_id": a_contact["id"],
        "currency": "USD",
        "line_items": [{"description": "Test inv", "quantity": 1, "unit_price": 25.0}],
        "subtotal": 25.0, "tax": 0.0, "grand_total": 25.0,
        "status": "draft",
    }
    r = requests.post(f"{API}/invoices", headers=_hdr(owner_token), json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()


# ══════════════════════════════════════════════════════════════════════════════
# 1. Quote valid_days auto-compute
# ══════════════════════════════════════════════════════════════════════════════
class TestQuoteValidDays:
    def test_create_with_valid_days_computes_valid_until(self, owner_token, a_contact):
        body = {
            "number": f"TEST-VD-{uuid.uuid4().hex[:6].upper()}",
            "contact_id": a_contact["id"],
            "currency": "USD",
            "valid_days": 30,
            "line_items": [{"description": "x", "qty": 1, "unit_price": 1.0}],
            "subtotal": 1.0, "tax_total": 0.0, "grand_total": 1.0, "status": "draft",
        }
        r = requests.post(f"{API}/quotes", headers=_hdr(owner_token), json=body)
        assert r.status_code in (200, 201), r.text
        q = r.json()
        expected = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
        assert q.get("valid_until") == expected, f"expected {expected}, got {q.get('valid_until')}"

    def test_explicit_valid_until_wins(self, owner_token, a_contact):
        explicit = "2099-01-15"
        body = {
            "number": f"TEST-VW-{uuid.uuid4().hex[:6].upper()}",
            "contact_id": a_contact["id"],
            "currency": "USD",
            "valid_days": 30,
            "valid_until": explicit,
            "line_items": [{"description": "x", "qty": 1, "unit_price": 1.0}],
            "subtotal": 1.0, "tax_total": 0.0, "grand_total": 1.0, "status": "draft",
        }
        r = requests.post(f"{API}/quotes", headers=_hdr(owner_token), json=body)
        assert r.status_code in (200, 201), r.text
        assert r.json().get("valid_until") == explicit

    def test_put_valid_days_recomputes(self, owner_token, a_quote):
        # PUT requires full QuoteIn body (line_items, totals, etc.)
        body = {
            "number": a_quote["number"],
            "contact_id": a_quote.get("contact_id"),
            "currency": a_quote.get("currency", "USD"),
            "line_items": a_quote.get("line_items") or [
                {"description": "Test svc", "qty": 2, "unit_price": 50.0, "discount_pct": 0}
            ],
            "subtotal": a_quote.get("subtotal", 100.0),
            "tax_total": a_quote.get("tax_total", 0.0),
            "grand_total": a_quote.get("grand_total", 100.0),
            "status": a_quote.get("status", "draft"),
            "valid_days": 14,
            "valid_until": None,
        }
        r = requests.put(
            f"{API}/quotes/{a_quote['id']}",
            headers=_hdr(owner_token),
            json=body,
        )
        assert r.status_code == 200, r.text
        expected = (datetime.now(timezone.utc) + timedelta(days=14)).date().isoformat()
        # GET to verify persistence
        lst = requests.get(f"{API}/quotes", headers=_hdr(owner_token)).json()
        q = next((x for x in lst if x["id"] == a_quote["id"]), None)
        assert q is not None
        assert q.get("valid_until") == expected, f"expected {expected}, got {q.get('valid_until')}"


# ══════════════════════════════════════════════════════════════════════════════
# 2. Word .docx export
# ══════════════════════════════════════════════════════════════════════════════
class TestQuoteDocxExport:
    def test_requires_auth(self, a_quote):
        r = requests.get(f"{API}/quotes/{a_quote['id']}/export/docx")
        assert r.status_code in (401, 403)

    def test_unknown_quote_404(self, owner_token):
        r = requests.get(f"{API}/quotes/nope-{uuid.uuid4().hex[:8]}/export/docx",
                         headers=_hdr(owner_token, ctype_json=False))
        assert r.status_code == 404

    def test_returns_real_docx_with_quote_number(self, owner_token, a_quote):
        r = requests.get(f"{API}/quotes/{a_quote['id']}/export/docx",
                         headers=_hdr(owner_token, ctype_json=False))
        assert r.status_code == 200, r.text[:200]
        ctype = r.headers.get("content-type", "")
        assert "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in ctype
        cdisp = r.headers.get("content-disposition", "")
        assert "attachment" in cdisp.lower()
        assert f"Quote_{a_quote['number']}.docx" in cdisp
        # ZIP magic bytes
        assert r.content[:4] == b"PK\x03\x04", f"not a zip/docx: {r.content[:8]!r}"
        # python-docx round-trip
        d = docx.Document(io.BytesIO(r.content))
        all_text = "\n".join(p.text for p in d.paragraphs)
        assert a_quote["number"] in all_text, f"quote number missing in docx text"

    def test_audit_row_export_docx_written(self, owner_token, a_quote):
        # trigger one export
        r = requests.get(f"{API}/quotes/{a_quote['id']}/export/docx",
                         headers=_hdr(owner_token, ctype_json=False))
        assert r.status_code == 200
        a = requests.get(f"{API}/audit", headers=_hdr(owner_token))
        assert a.status_code == 200
        hits = [x for x in a.json()
                if x.get("action") == "export_docx"
                and x.get("entity_id") == a_quote["id"]]
        assert hits, "no export_docx audit row found for our quote"


# ══════════════════════════════════════════════════════════════════════════════
# 3. Attachments — upload / list / download / delete
# ══════════════════════════════════════════════════════════════════════════════
class TestAttachments:
    # ── upload ────────────────────────────────────────────────────────────────
    def test_upload_requires_auth(self, a_quote):
        files = {"file": ("test.pdf", TINY_PDF, "application/pdf")}
        r = requests.post(f"{API}/quotes/{a_quote['id']}/attachments", files=files)
        assert r.status_code in (401, 403)

    def test_upload_unknown_resource_404(self, owner_token):
        """Explicit routes: only /quotes and /invoices accept attachments.

        Previously the catch-all route returned 400; since tightening to explicit
        routes a non-attachable resource gets a clean 404 (route doesn't exist).
        """
        files = {"file": ("test.pdf", TINY_PDF, "application/pdf")}
        r = requests.post(f"{API}/contacts/abc/attachments",
                          headers=_hdr(owner_token, ctype_json=False), files=files)
        assert r.status_code == 404, f"expected 404 for non-attachable resource, got {r.status_code}: {r.text[:200]}"

    def test_upload_unknown_quote_404(self, owner_token):
        files = {"file": ("test.pdf", TINY_PDF, "application/pdf")}
        r = requests.post(
            f"{API}/quotes/nope-{uuid.uuid4().hex[:8]}/attachments",
            headers=_hdr(owner_token, ctype_json=False), files=files,
        )
        assert r.status_code == 404, r.text[:200]

    def test_upload_disallowed_extension_400(self, owner_token, a_quote):
        files = {"file": ("evil.exe", b"MZ\x00\x00", "application/octet-stream")}
        r = requests.post(
            f"{API}/quotes/{a_quote['id']}/attachments",
            headers=_hdr(owner_token, ctype_json=False), files=files,
        )
        assert r.status_code == 400, r.text[:200]
        assert "not allowed" in r.text.lower() or "type" in r.text.lower()

    def test_upload_quote_pdf_succeeds_and_persists(self, owner_token, a_quote):
        files = {"file": ("signed_quote.pdf", TINY_PDF, "application/pdf")}
        data = {"kind": "signed_quote"}
        r = requests.post(
            f"{API}/quotes/{a_quote['id']}/attachments",
            headers=_hdr(owner_token, ctype_json=False),
            files=files, data=data,
        )
        assert r.status_code in (200, 201), r.text
        att = r.json()
        for k in ("id", "filename", "size", "content_type", "kind"):
            assert k in att, f"missing key {k} in response: {att}"
        assert att["filename"] == "signed_quote.pdf"
        assert att["size"] == len(TINY_PDF)
        assert att["kind"] == "signed_quote"
        # Disk persistence
        # Path: /app/backend/uploads/<owner_id>/quotes/<quote_id>/<att_id>.pdf
        # We need owner_id; fetch /api/auth/me
        me = requests.get(f"{API}/auth/me", headers=_hdr(owner_token)).json()
        owner_id = me.get("id") or me.get("user", {}).get("id")
        if owner_id:
            disk = Path(f"/app/backend/uploads/{owner_id}/quotes/{a_quote['id']}/{att['id']}.pdf")
            assert disk.exists(), f"file not saved at {disk}"
            assert disk.read_bytes() == TINY_PDF
        pytest.b5_quote_attachment = att

    def test_upload_invoice_pdf_succeeds(self, owner_token, an_invoice):
        files = {"file": ("signed_invoice.pdf", TINY_PDF, "application/pdf")}
        r = requests.post(
            f"{API}/invoices/{an_invoice['id']}/attachments",
            headers=_hdr(owner_token, ctype_json=False),
            files=files, data={"kind": "signed_invoice"},
        )
        assert r.status_code in (200, 201), r.text
        att = r.json()
        assert att["kind"] == "signed_invoice"
        pytest.b5_invoice_attachment = att

    # ── list ──────────────────────────────────────────────────────────────────
    def test_list_attachments_excludes_disk_path(self, owner_token, a_quote):
        r = requests.get(f"{API}/quotes/{a_quote['id']}/attachments",
                         headers=_hdr(owner_token))
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        for row in rows:
            assert "disk_path" not in row, "disk_path must not leak"
            for k in ("id", "filename", "size", "kind", "content_type", "created_at"):
                assert k in row, f"row missing {k}: {row}"

    # ── download ──────────────────────────────────────────────────────────────
    def test_download_returns_bytes(self, owner_token):
        att = getattr(pytest, "b5_quote_attachment", None)
        if not att:
            pytest.skip("no attachment from upload step")
        r = requests.get(f"{API}/attachments/{att['id']}/download",
                         headers=_hdr(owner_token, ctype_json=False))
        assert r.status_code == 200, r.text[:200]
        assert r.content == TINY_PDF
        assert "application/pdf" in r.headers.get("content-type", "")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower() and "signed_quote.pdf" in cd

    def test_download_cross_tenant_404(self, second_owner_token):
        att = getattr(pytest, "b5_quote_attachment", None)
        if not att:
            pytest.skip("no attachment from upload step")
        r = requests.get(f"{API}/attachments/{att['id']}/download",
                         headers=_hdr(second_owner_token, ctype_json=False))
        assert r.status_code == 404, f"cross-tenant leak: {r.status_code} {r.text[:200]}"

    # ── delete ────────────────────────────────────────────────────────────────
    def test_delete_cross_tenant_404(self, second_owner_token):
        att = getattr(pytest, "b5_invoice_attachment", None)
        if not att:
            pytest.skip("no invoice attachment uploaded")
        r = requests.delete(f"{API}/attachments/{att['id']}",
                            headers=_hdr(second_owner_token, ctype_json=False))
        assert r.status_code == 404

    def test_delete_removes_row_and_file(self, owner_token):
        att = getattr(pytest, "b5_quote_attachment", None)
        if not att:
            pytest.skip("no attachment from upload step")
        # Find disk path via list (disk_path stripped) — best-effort: poke /app/backend/uploads
        me = requests.get(f"{API}/auth/me", headers=_hdr(owner_token)).json()
        owner_id = me.get("id") or me.get("user", {}).get("id")
        disk = Path(f"/app/backend/uploads/{owner_id}/quotes/{att.get('resource_id', '')}/{att['id']}.pdf") \
            if owner_id else None

        r = requests.delete(f"{API}/attachments/{att['id']}",
                            headers=_hdr(owner_token, ctype_json=False))
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

        # Verify gone via download → 404
        r2 = requests.get(f"{API}/attachments/{att['id']}/download",
                          headers=_hdr(owner_token, ctype_json=False))
        assert r2.status_code == 404
        # Verify file removed from disk (best-effort — only if we knew the path)
        if disk is not None and "resource_id" in att:
            assert not disk.exists(), f"file still on disk: {disk}"


# ══════════════════════════════════════════════════════════════════════════════
# 4. Company → Contacts link
# ══════════════════════════════════════════════════════════════════════════════
class TestCompanyContacts:
    def test_returns_owner_scoped_contacts(self, owner_token):
        # Find any company with at least one linked contact OR create one.
        cs = requests.get(f"{API}/companies", headers=_hdr(owner_token)).json()
        if not cs:
            pytest.skip("no companies seeded")
        # Pick the first company; ensure at least one contact references it
        comp = cs[0]
        contacts = requests.get(f"{API}/contacts", headers=_hdr(owner_token)).json()
        linked = [c for c in contacts if c.get("company_id") == comp["id"]]
        if not linked:
            # Create a TEST contact tied to this company
            r = requests.post(f"{API}/contacts", headers=_hdr(owner_token), json={
                "first_name": "TEST", "last_name": "Linked",
                "email": f"TEST_link_{uuid.uuid4().hex[:6]}@example.com",
                "company_id": comp["id"],
            })
            assert r.status_code in (200, 201), r.text

        r = requests.get(f"{API}/companies/{comp['id']}/contacts",
                         headers=_hdr(owner_token))
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        for row in rows:
            assert row.get("company_id") == comp["id"]
            assert "_id" not in row

    def test_foreign_company_404(self, second_owner_token, owner_token):
        cs = requests.get(f"{API}/companies", headers=_hdr(owner_token)).json()
        if not cs:
            pytest.skip("no companies")
        cid = cs[0]["id"]
        r = requests.get(f"{API}/companies/{cid}/contacts",
                        headers=_hdr(second_owner_token))
        assert r.status_code == 404

    def test_unknown_company_404(self, owner_token):
        r = requests.get(f"{API}/companies/nope-{uuid.uuid4().hex[:8]}/contacts",
                         headers=_hdr(owner_token))
        assert r.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# 5. Routing-conflict sanity — catch-all /{resource}/{rid}/attachments must NOT
#    swallow more-specific routes registered earlier.
# ══════════════════════════════════════════════════════════════════════════════
class TestRoutingNoConflict:
    def test_quotes_export_docx_still_routes(self, owner_token, a_quote):
        r = requests.get(f"{API}/quotes/{a_quote['id']}/export/docx",
                         headers=_hdr(owner_token, ctype_json=False))
        assert r.status_code == 200

    def test_existing_companies_get_unaffected(self, owner_token):
        r = requests.get(f"{API}/companies", headers=_hdr(owner_token))
        assert r.status_code == 200

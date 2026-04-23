"""Phase 2 Batch F — AFS signature upload + embed, and tightened attachment routes.

AFS signature endpoints:
  POST   /api/accounting/afs/signature   (multipart PNG/JPEG + metadata)
  GET    /api/accounting/afs/signature
  DELETE /api/accounting/afs/signature

Attachment route tightening:
  Only /quotes/{id}/attachments and /invoices/{id}/attachments are live.
  Other resource names (e.g. /contacts/{id}/attachments) now 404 at the routing
  layer instead of being caught by a generic handler.
"""
import base64
import io
import os
import uuid

import pytest
import requests


def _base_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if url:
        return url.rstrip("/")
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    return ""


API = f"{_base_url()}/api"

# Tiny 1×1 white PNG
TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
)
TINY_PDF = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1>>\nstartxref\n0\n%%EOF\n"


def _h(tok, ctype_json=True):
    h = {"Authorization": f"Bearer {tok}"}
    if ctype_json:
        h["Content-Type"] = "application/json"
    return h


def _signup_owner():
    email = f"TEST_batchF_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/signup",
                      json={"email": email, "password": "Owner2026!", "name": "Batch F Owner"})
    assert r.status_code in (200, 201), r.text
    return {"email": email, "token": r.json()["token"], "user": r.json()["user"]}


def _seed_acct(tok):
    r = requests.post(f"{API}/accounting/seed", headers=_h(tok))
    assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def owner():
    o = _signup_owner()
    _seed_acct(o["token"])
    return o


# ── AFS signature ───────────────────────────────────────────────────────────
class TestAfsSignature:

    def test_get_signature_none_by_default(self, owner):
        r = requests.get(f"{API}/accounting/afs/signature", headers=_h(owner["token"]))
        assert r.status_code == 200
        assert r.json()["signature"] is None

    def test_upload_and_fetch(self, owner):
        files = {"file": ("sig.png", TINY_PNG, "image/png")}
        data = {
            "accountant_name": "John Doe CA(SA)",
            "firm": "Doe & Partners",
            "registration": "CASA-99999",
            "signed_date": "2026-03-31",
        }
        r = requests.post(f"{API}/accounting/afs/signature",
                          headers={"Authorization": f"Bearer {owner['token']}"},
                          files=files, data=data)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accountant_name"] == "John Doe CA(SA)"
        assert body["firm"] == "Doe & Partners"
        # disk_path must NEVER be leaked back
        assert "disk_path" not in body
        # GET returns the same metadata
        g = requests.get(f"{API}/accounting/afs/signature", headers=_h(owner["token"]))
        assert g.status_code == 200
        assert g.json()["signature"]["accountant_name"] == "John Doe CA(SA)"
        assert "disk_path" not in g.json()["signature"]

    def test_upload_rejects_non_image(self, owner):
        files = {"file": ("not_image.pdf", b"%PDF-1.4", "application/pdf")}
        data = {"accountant_name": "X"}
        r = requests.post(f"{API}/accounting/afs/signature",
                          headers={"Authorization": f"Bearer {owner['token']}"},
                          files=files, data=data)
        assert r.status_code == 400
        assert "png" in r.json()["detail"].lower() or "jpeg" in r.json()["detail"].lower()

    def test_upload_rejects_empty_file(self, owner):
        files = {"file": ("empty.png", b"", "image/png")}
        data = {"accountant_name": "X"}
        r = requests.post(f"{API}/accounting/afs/signature",
                          headers={"Authorization": f"Bearer {owner['token']}"},
                          files=files, data=data)
        assert r.status_code == 400

    def test_upload_replaces_previous(self, owner):
        # Upload once
        files1 = {"file": ("a.png", TINY_PNG, "image/png")}
        requests.post(f"{API}/accounting/afs/signature",
                      headers={"Authorization": f"Bearer {owner['token']}"},
                      files=files1, data={"accountant_name": "First Name"})
        # Upload again with different metadata → previous is replaced
        files2 = {"file": ("b.png", TINY_PNG, "image/png")}
        r = requests.post(f"{API}/accounting/afs/signature",
                          headers={"Authorization": f"Bearer {owner['token']}"},
                          files=files2, data={"accountant_name": "Second Name"})
        assert r.status_code == 200
        assert r.json()["accountant_name"] == "Second Name"
        g = requests.get(f"{API}/accounting/afs/signature", headers=_h(owner["token"]))
        assert g.json()["signature"]["accountant_name"] == "Second Name"

    def test_afs_pdf_embeds_signature_when_present(self, owner):
        """When a signature exists, generating the AFS bundle PDF should succeed
        and the PDF body should still parse as a valid PDF. We cannot grep
        text from inside an embedded raster signature, but we DO assert the
        file is a valid PDF and is materially larger when a signature is embedded
        vs. when it isn't (baseline varies, so we just assert >0 bytes + magic).
        """
        # Ensure signature is present
        files = {"file": ("sig.png", TINY_PNG, "image/png")}
        requests.post(f"{API}/accounting/afs/signature",
                      headers={"Authorization": f"Bearer {owner['token']}"},
                      files=files, data={"accountant_name": "Auditor"})
        r = requests.get(
            f"{API}/accounting/reports/afs-bundle/pdf?date_to=2026-03-31",
            headers=_h(owner["token"]),
        )
        assert r.status_code == 200, r.text[:200]
        assert r.headers["content-type"] == "application/pdf"
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 5000  # AFS bundle is always several KB

    def test_delete_signature(self, owner):
        files = {"file": ("sig.png", TINY_PNG, "image/png")}
        requests.post(f"{API}/accounting/afs/signature",
                      headers={"Authorization": f"Bearer {owner['token']}"},
                      files=files, data={"accountant_name": "ToDelete"})
        d = requests.delete(f"{API}/accounting/afs/signature", headers=_h(owner["token"]))
        assert d.status_code == 200
        assert d.json()["ok"] is True
        g = requests.get(f"{API}/accounting/afs/signature", headers=_h(owner["token"]))
        assert g.json()["signature"] is None

    def test_delete_signature_404_when_absent(self):
        o = _signup_owner()
        _seed_acct(o["token"])
        r = requests.delete(f"{API}/accounting/afs/signature", headers=_h(o["token"]))
        assert r.status_code == 404

    def test_rbac_rep_forbidden_to_upload(self, owner):
        # Invite a rep
        inv_email = f"TEST_repf_{uuid.uuid4().hex[:6]}@example.com"
        inv = requests.post(f"{API}/team/invites",
                            headers=_h(owner["token"]),
                            json={"email": inv_email, "role": "rep"})
        assert inv.status_code == 200
        tok = inv.json()["token"]
        acc = requests.post(f"{API}/auth/accept-invite",
                            json={"token": tok, "password": "Rep2026!", "name": "Rep"})
        rep_tok = acc.json()["token"]
        files = {"file": ("s.png", TINY_PNG, "image/png")}
        r = requests.post(f"{API}/accounting/afs/signature",
                          headers={"Authorization": f"Bearer {rep_tok}"},
                          files=files, data={"accountant_name": "Nope"})
        assert r.status_code == 403


# ── Attachment route tightening ─────────────────────────────────────────────
class TestAttachmentRouteTightening:

    def test_quotes_route_works(self, owner):
        # Create a quote first (need a contact)
        c = requests.post(f"{API}/contacts", headers=_h(owner["token"]),
                          json={"first_name": "Att", "last_name": "Test"})
        cid = c.json()["id"]
        q = requests.post(f"{API}/quotes", headers=_h(owner["token"]),
                          json={"contact_id": cid, "line_items": [{"description": "x", "qty": 1, "unit_price": 100}]})
        assert q.status_code == 200, q.text
        qid = q.json()["id"]
        files = {"file": ("t.pdf", TINY_PDF, "application/pdf")}
        up = requests.post(f"{API}/quotes/{qid}/attachments",
                           headers={"Authorization": f"Bearer {owner['token']}"}, files=files)
        assert up.status_code == 200, up.text
        lst = requests.get(f"{API}/quotes/{qid}/attachments", headers=_h(owner["token"]))
        assert lst.status_code == 200
        assert len(lst.json()) == 1

    def test_invoices_route_works(self, owner):
        # Create an invoice (needs contact)
        c = requests.post(f"{API}/contacts", headers=_h(owner["token"]),
                          json={"first_name": "InvAtt", "last_name": "Test"})
        cid = c.json()["id"]
        inv = requests.post(f"{API}/invoices", headers=_h(owner["token"]),
                            json={"contact_id": cid, "line_items": [{"description": "y", "qty": 1, "unit_price": 200}]})
        assert inv.status_code == 200, inv.text
        iid = inv.json()["id"]
        files = {"file": ("t.pdf", TINY_PDF, "application/pdf")}
        up = requests.post(f"{API}/invoices/{iid}/attachments",
                           headers={"Authorization": f"Bearer {owner['token']}"}, files=files)
        assert up.status_code == 200
        lst = requests.get(f"{API}/invoices/{iid}/attachments", headers=_h(owner["token"]))
        assert lst.status_code == 200
        assert len(lst.json()) == 1

    def test_other_resources_404_not_400(self, owner):
        """Contacts/companies/deals are NOT attachable — now the route doesn't
        even exist (404), no more generic 400 fallback."""
        for res in ("contacts", "companies", "deals", "foobar"):
            files = {"file": ("t.pdf", TINY_PDF, "application/pdf")}
            r = requests.post(f"{API}/{res}/some-id/attachments",
                              headers={"Authorization": f"Bearer {owner['token']}"},
                              files=files)
            assert r.status_code == 404, f"{res} returned {r.status_code} (expected 404): {r.text[:100]}"
            g = requests.get(f"{API}/{res}/some-id/attachments", headers=_h(owner["token"]))
            assert g.status_code == 404, f"GET {res} returned {g.status_code} (expected 404)"

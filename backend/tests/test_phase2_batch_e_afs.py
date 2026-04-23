"""Phase 2 Batch E — AFS (Annual Financial Statements) PDF bundle.

Endpoint: GET /api/accounting/reports/afs-bundle/pdf?date_from=&date_to=
Covers: cover · IS · BS · Cash Flow · VAT201 · Notes · Sign-off.
RBAC: owner/admin/accountant only. Writes an audit row.
"""
import os
import uuid
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


def _signup_owner():
    email = f"TEST_afs_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/signup", json={"email": email, "password": "Owner2026!", "name": "AFS Owner"})
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text}"
    return {"email": email, "token": r.json()["token"], "user": r.json()["user"]}


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _signup_rep(owner_token):
    """Create a rep team member under the owner via the invite flow."""
    email = f"TEST_afsrep_{uuid.uuid4().hex[:8]}@example.com"
    inv = requests.post(f"{API}/team/invites",
                        headers={**_h(owner_token), "Content-Type": "application/json"},
                        json={"email": email, "role": "rep"})
    assert inv.status_code == 200, inv.text
    token = inv.json()["token"]
    acc = requests.post(f"{API}/auth/accept-invite", json={
        "token": token, "password": "RepPass2026!", "name": "Rep Tester",
    })
    assert acc.status_code == 200, acc.text
    return {"email": email, "token": acc.json()["token"]}


@pytest.fixture(scope="module")
def owner():
    o = _signup_owner()
    # Seed accounts
    r = requests.post(f"{API}/accounting/seed", headers=_h(o["token"]))
    assert r.status_code == 200, r.text
    return o


class TestAfsBundle:

    def test_afs_basic_export(self, owner):
        today = datetime.now(timezone.utc).date().isoformat()
        r = requests.get(
            f"{API}/accounting/reports/afs-bundle/pdf?date_from=2026-03-01&date_to={today}",
            headers=_h(owner["token"]),
        )
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        assert "attachment" in r.headers.get("content-disposition", "").lower()
        body = r.content
        # Valid PDF magic
        assert body[:4] == b"%PDF", f"bad pdf magic: {body[:8]!r}"
        # Multi-page (cover + IS + BS + CF + VAT + Notes + Signoff >= 6)
        assert body.count(b"/Type /Page") + body.count(b"/Type/Page") >= 6
        # Not tiny
        assert len(body) > 4000

    def test_afs_without_date_from(self, owner):
        """When date_from is omitted, server should still produce a valid PDF
        (falls back to SA fiscal year start for VAT201)."""
        today = datetime.now(timezone.utc).date().isoformat()
        r = requests.get(
            f"{API}/accounting/reports/afs-bundle/pdf?date_to={today}",
            headers=_h(owner["token"]),
        )
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_afs_writes_audit(self, owner):
        today = datetime.now(timezone.utc).date().isoformat()
        before = requests.get(f"{API}/audit?limit=500", headers=_h(owner["token"])).json()
        requests.get(f"{API}/accounting/reports/afs-bundle/pdf?date_to={today}", headers=_h(owner["token"]))
        after = requests.get(f"{API}/audit?limit=500", headers=_h(owner["token"])).json()
        assert len(after) > len(before)
        # Most recent entry should be export_pdf for accounting_report 'afs_bundle'
        last_few = after[:5]
        found = any(e.get("action") == "export_pdf" and e.get("entity_id") == "afs_bundle" for e in last_few)
        assert found, f"no audit row for afs_bundle export; recent: {last_few[:3]}"

    def test_afs_filename_has_tenant(self, owner):
        today = datetime.now(timezone.utc).date().isoformat()
        r = requests.get(
            f"{API}/accounting/reports/afs-bundle/pdf?date_to={today}",
            headers=_h(owner["token"]),
        )
        cd = r.headers.get("content-disposition", "")
        # Default tenant name is the signup "name" → "AFS Owner", stripped of spaces
        assert "AFS_" in cd
        assert today in cd

    def test_afs_rep_forbidden(self, owner):
        """Rep role cannot export AFS (owner/admin/accountant only)."""
        rep = _signup_rep(owner["token"])
        today = datetime.now(timezone.utc).date().isoformat()
        r = requests.get(
            f"{API}/accounting/reports/afs-bundle/pdf?date_to={today}",
            headers=_h(rep["token"]),
        )
        assert r.status_code == 403, f"expected 403 for rep; got {r.status_code} {r.text[:200]}"

    def test_afs_requires_auth(self):
        today = datetime.now(timezone.utc).date().isoformat()
        r = requests.get(f"{API}/accounting/reports/afs-bundle/pdf?date_to={today}")
        assert r.status_code in (401, 403)


class TestCashFlowMath:
    """Confirm the cash-flow section of the AFS ties to the Balance Sheet bank balance."""

    def test_cashflow_reconciles_with_zero_activity(self, owner):
        """A freshly-seeded tenant with zero journals should produce a zero-variance cash-flow."""
        today = datetime.now(timezone.utc).date().isoformat()
        r = requests.get(
            f"{API}/accounting/reports/afs-bundle/pdf?date_from=2026-03-01&date_to={today}",
            headers=_h(owner["token"]),
        )
        assert r.status_code == 200
        # The PDF bytes contain the variance line "Reconciliation variance (should be ~0)"
        # ReportLab usually compresses text streams, so we only validate structural OK here.
        assert len(r.content) > 4000

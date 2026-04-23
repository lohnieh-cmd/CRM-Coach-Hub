"""
Phase 2 Batch 3 tests — Team seats/RBAC, Invites, Data scoping, IMAP sync.
Covers: /api/auth/me shape, /api/team/*, /api/auth/invite/{token},
/api/auth/accept-invite, RBAC, team-scoped data visibility, audit attribution,
/api/email/imap/config (CRUD), /api/email/imap/sync error paths.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://sa-coaching-crm.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER_EMAIL = "demo@climbleadershiplab.com"
OWNER_PASSWORD = "SherpaDemo2026!"


# ── helpers ───────────────────────────────────────────────────────────────────
def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def owner_me(owner_token):
    r = requests.get(f"{API}/auth/me", headers=_headers(owner_token))
    assert r.status_code == 200, r.text
    return r.json()


# ── 1. /auth/me shape ─────────────────────────────────────────────────────────
class TestAuthMe:
    def test_me_owner_role_and_ids(self, owner_me):
        assert owner_me["role"] == "owner"
        assert "actor_id" in owner_me
        assert "team_owner_id" in owner_me
        # owner: id == team_owner_id == actor_id
        assert owner_me["id"] == owner_me["team_owner_id"] == owner_me["actor_id"]


# ── 2. Invite flow: create → peek → accept ────────────────────────────────────
_INVITE_STATE = {}


class TestInviteFlow:
    def test_create_invite(self, owner_token):
        email = f"TEST_rep_{uuid.uuid4().hex[:8]}@example.com".lower()
        r = requests.post(f"{API}/team/invites", headers=_headers(owner_token),
                          json={"email": email, "role": "rep"})
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["email"] == email  # backend lowercases
        assert inv["role"] == "rep"
        assert inv["status"] == "pending"
        assert isinstance(inv["token"], str) and len(inv["token"]) > 10
        _INVITE_STATE["invite"] = inv
        _INVITE_STATE["email"] = email

    def test_list_invites_contains_created(self, owner_token):
        r = requests.get(f"{API}/team/invites", headers=_headers(owner_token))
        assert r.status_code == 200
        ids = [i["id"] for i in r.json()]
        assert _INVITE_STATE["invite"]["id"] in ids

    def test_peek_invite_public_and_no_token_echo(self):
        tok = _INVITE_STATE["invite"]["token"]
        r = requests.get(f"{API}/auth/invite/{tok}")  # PUBLIC — no auth header
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == _INVITE_STATE["email"]
        assert data["role"] == "rep"
        assert "token" not in data, "Public peek endpoint MUST NOT echo the token back"

    def test_accept_invite_creates_rep_user(self):
        tok = _INVITE_STATE["invite"]["token"]
        r = requests.post(f"{API}/auth/accept-invite",
                          json={"token": tok, "password": "RepPass123!", "name": "TEST Rep User"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body
        assert body["user"]["email"] == _INVITE_STATE["email"]
        assert body["user"]["role"] == "rep"
        _INVITE_STATE["rep_token"] = body["token"]
        _INVITE_STATE["rep_user"] = body["user"]

    def test_reuse_accepted_token_returns_404(self):
        tok = _INVITE_STATE["invite"]["token"]
        r = requests.post(f"{API}/auth/accept-invite",
                          json={"token": tok, "password": "x", "name": "y"})
        assert r.status_code == 404

    def test_cleanup_accepted_rep(self, owner_token):
        uid = _INVITE_STATE.get("rep_user", {}).get("id")
        if uid:
            requests.delete(f"{API}/team/members/{uid}", headers=_headers(owner_token))

    def test_revoke_pending_invite(self, owner_token):
        # create a fresh invite, then revoke
        email = f"TEST_revoke_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/team/invites", headers=_headers(owner_token),
                          json={"email": email, "role": "rep"})
        assert r.status_code == 200
        iid = r.json()["id"]
        rd = requests.delete(f"{API}/team/invites/{iid}", headers=_headers(owner_token))
        assert rd.status_code == 200
        # confirm removed
        rl = requests.get(f"{API}/team/invites", headers=_headers(owner_token))
        assert iid not in [i["id"] for i in rl.json()]


# Re-used across multiple classes — module-scoped invite-accepted rep fixture
@pytest.fixture(scope="module")
def rep_context(owner_token, owner_me):
    email = f"TEST_rep2_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/team/invites", headers=_headers(owner_token),
                      json={"email": email, "role": "rep"})
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    ra = requests.post(f"{API}/auth/accept-invite",
                       json={"token": tok, "password": "RepPass123!", "name": "TEST Rep2"})
    assert ra.status_code == 200, ra.text
    ctx = {"token": ra.json()["token"], "user": ra.json()["user"], "email": email}
    yield ctx
    # cleanup — remove the rep user as owner
    try:
        requests.delete(f"{API}/team/members/{ctx['user']['id']}", headers=_headers(owner_token))
    except Exception:
        pass


# ── 3. Data scoping: rep sees owner data via existing endpoints ───────────────
class TestDataScoping:
    def test_rep_me_has_owner_team_id(self, rep_context, owner_me):
        r = requests.get(f"{API}/auth/me", headers=_headers(rep_context["token"]))
        assert r.status_code == 200
        m = r.json()
        assert m["role"] == "rep"
        # remapped id should == owner's id
        assert m["id"] == owner_me["id"]
        # actor_id should be rep's real user id
        assert m["actor_id"] == rep_context["user"]["id"]
        assert m["team_owner_id"] == owner_me["id"]

    @pytest.mark.parametrize("path", ["/companies", "/contacts", "/deals"])
    def test_rep_sees_owner_records(self, rep_context, owner_token, path):
        owner_r = requests.get(f"{API}{path}", headers=_headers(owner_token))
        rep_r = requests.get(f"{API}{path}", headers=_headers(rep_context["token"]))
        assert owner_r.status_code == 200 and rep_r.status_code == 200
        owner_ids = {x["id"] for x in owner_r.json()}
        rep_ids = {x["id"] for x in rep_r.json()}
        # Rep should see every record the owner sees
        assert owner_ids.issubset(rep_ids), f"Rep missing records from {path}"
        assert len(rep_ids) > 0


# ── 4. RBAC ───────────────────────────────────────────────────────────────────
class TestRBAC:
    def test_rep_cannot_create_invite(self, rep_context):
        r = requests.post(f"{API}/team/invites", headers=_headers(rep_context["token"]),
                          json={"email": f"TEST_x_{uuid.uuid4().hex[:6]}@ex.com", "role": "rep"})
        assert r.status_code == 403, r.text

    def test_rep_cannot_patch_member_role(self, rep_context):
        r = requests.patch(f"{API}/team/members/{rep_context['user']['id']}",
                           headers=_headers(rep_context["token"]), json={"role": "admin"})
        assert r.status_code == 403

    def test_owner_can_patch_member_role(self, owner_token, rep_context):
        uid = rep_context["user"]["id"]
        r = requests.patch(f"{API}/team/members/{uid}",
                           headers=_headers(owner_token), json={"role": "admin"})
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "admin"
        # revert to rep for remaining tests
        requests.patch(f"{API}/team/members/{uid}",
                       headers=_headers(owner_token), json={"role": "rep"})


# ── 5. Team members list ──────────────────────────────────────────────────────
class TestTeamMembers:
    def test_owner_sees_self_and_invited(self, owner_token, owner_me, rep_context):
        r = requests.get(f"{API}/team/members", headers=_headers(owner_token))
        assert r.status_code == 200
        ids = {m["id"] for m in r.json()}
        assert owner_me["id"] in ids
        assert rep_context["user"]["id"] in ids

    def test_rep_sees_same_set(self, rep_context, owner_me):
        r = requests.get(f"{API}/team/members", headers=_headers(rep_context["token"]))
        assert r.status_code == 200
        ids = {m["id"] for m in r.json()}
        assert owner_me["id"] in ids
        assert rep_context["user"]["id"] in ids


# ── 6. Audit attribution ──────────────────────────────────────────────────────
class TestAuditAttribution:
    def test_rep_mutation_writes_audit_with_rep_actor_id(self, rep_context, owner_token):
        # Rep creates a company; audit entry should be attributed to rep.actor_id
        rep_uid = rep_context["user"]["id"]
        payload = {"name": f"TEST_Audit_Co_{uuid.uuid4().hex[:6]}", "industry": "tech"}
        rc = requests.post(f"{API}/companies", headers=_headers(rep_context["token"]), json=payload)
        assert rc.status_code == 200, rc.text
        cid = rc.json()["id"]

        # GET /api/audit as rep. Note: endpoint filters by u["id"] which is remapped to team_owner_id,
        # so rep will see owner-id-filtered entries. But each entry's actor_id should still be the rep's
        # real id when rep did the action. So we inspect entries across the audit collection (as owner)
        # because as rep the filter won't show their own entries. This exposes a likely bug (flagged).
        rep_audit = requests.get(f"{API}/audit", headers=_headers(rep_context["token"]))
        assert rep_audit.status_code == 200
        # As rep, the audit list is filtered by u["id"] (= team_owner_id). Entries with actor_id=rep
        # would NOT appear. Track whether the rep can see their own audit trail.
        rep_sees_own = any(a.get("actor_id") == rep_uid for a in rep_audit.json())

        owner_audit = requests.get(f"{API}/audit", headers=_headers(owner_token))
        # Owner's list filtered by owner.id — also doesn't show rep.actor_id entries.
        owner_sees_rep = any(a.get("actor_id") == rep_uid and a.get("entity_id") == cid
                             for a in owner_audit.json())

        # cleanup — delete the company as owner
        requests.delete(f"{API}/companies/{cid}", headers=_headers(owner_token))

        # Document behaviour: a mutation by rep must write an audit row with actor_id=rep_uid.
        # Neither owner's nor rep's /api/audit shows this row because filter is on u["id"]
        # (= team_owner_id) for both. Flag as observability gap but pass the happy-path:
        # at least one of them should reveal the audit — otherwise the audit endpoint is
        # effectively useless for team activity visibility.
        assert rep_sees_own or owner_sees_rep, (
            "GET /api/audit returns no entry with actor_id=rep for a rep-created company. "
            "The endpoint filters by u['id'] (remapped to team_owner_id) rather than team_owner_id "
            "or actor_id, so neither owner nor rep can surface team-member audit entries. "
            "Fix: change filter in list_audit to {$or: [{actor_id: u['actor_id']}, team-scope by user ids]}."
        )


# ── 7. IMAP config CRUD ───────────────────────────────────────────────────────
class TestIMAPConfig:
    def test_initial_config_is_null(self, owner_token):
        # delete first to ensure clean slate
        requests.delete(f"{API}/email/imap/config", headers=_headers(owner_token))
        r = requests.get(f"{API}/email/imap/config", headers=_headers(owner_token))
        assert r.status_code == 200
        assert r.json() in (None, {}), f"Expected null, got {r.json()}"

    def test_save_and_obfuscate_password(self, owner_token):
        body = {
            "host": "imap.nonexistent-host.invalid", "port": 993, "use_ssl": True,
            "username": "demo@climbleadershiplab.com", "password": "sekret123",
            "mailbox": "INBOX",
        }
        r = requests.post(f"{API}/email/imap/config", headers=_headers(owner_token), json=body)
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/email/imap/config", headers=_headers(owner_token))
        assert g.status_code == 200
        cfg = g.json()
        assert cfg["host"] == body["host"]
        assert cfg["username"] == body["username"]
        # Server hardening (iter-5): plaintext IMAP password is NEVER persisted at rest.
        # GET returns empty password; user must supply it with each sync call.
        # Accept either empty ("") [new, hardened] or "••••••" [old, masked] for forward compat.
        assert cfg["password"] in ("", "••••••"), f"Unexpected password value: {cfg['password']!r}"

    def test_imap_sync_without_password_returns_400(self, owner_token):
        # config saved; GET returns obfuscated pw; sync without body.password must fail with 400
        r = requests.post(f"{API}/email/imap/sync", headers=_headers(owner_token), json={})
        assert r.status_code == 400, r.text

    def test_imap_sync_with_stub_creds_502(self, owner_token):
        r = requests.post(f"{API}/email/imap/sync", headers=_headers(owner_token),
                          json={"password": "sekret123", "limit": 1})
        # unreachable host → 502
        assert r.status_code == 502, r.text
        assert "IMAP" in (r.json().get("detail") or "")

    def test_delete_config(self, owner_token):
        r = requests.delete(f"{API}/email/imap/config", headers=_headers(owner_token))
        assert r.status_code == 200
        g = requests.get(f"{API}/email/imap/config", headers=_headers(owner_token))
        assert g.status_code == 200
        assert g.json() in (None, {})

    def test_imap_sync_no_config_400(self, owner_token):
        r = requests.post(f"{API}/email/imap/sync", headers=_headers(owner_token),
                          json={"password": "x"})
        assert r.status_code == 400


# ── 8. Regression — key iter-3 endpoints still green ──────────────────────────
class TestRegression:
    def test_companies_list(self, owner_token):
        r = requests.get(f"{API}/companies", headers=_headers(owner_token))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_deals_list(self, owner_token):
        r = requests.get(f"{API}/deals", headers=_headers(owner_token))
        assert r.status_code == 200

    def test_scheduler_status(self, owner_token):
        r = requests.get(f"{API}/scheduler/status", headers=_headers(owner_token))
        assert r.status_code == 200
        assert "running" in r.json()

    def test_forms_delete_endpoint_exists(self, owner_token):
        # non-existent id → 404 (not 405); confirms DELETE route is registered
        r = requests.delete(f"{API}/forms/does-not-exist",
                            headers=_headers(owner_token))
        assert r.status_code in (200, 404), f"DELETE /api/forms/{{id}} missing? got {r.status_code}"

    def test_tasks_list(self, owner_token):
        r = requests.get(f"{API}/tasks", headers=_headers(owner_token))
        assert r.status_code == 200

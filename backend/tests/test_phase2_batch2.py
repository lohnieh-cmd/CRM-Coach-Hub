"""
Phase 2 batch 2 Ascent CRM tests:
- Tasks CRUD
- Email log CRUD + contact interaction_count bump
- Contact detail timeline
- Scheduler status endpoint
- Multi-step funnel (steps[] + branches)
- AI reply draft grounding on CRM
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://sa-coaching-crm.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@climbleadershiplab.com"
DEMO_PASSWORD = "SherpaDemo2026!"


# ── Fixtures ──────────────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def auth_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Demo login failed: {r.status_code} {r.text[:200]}")
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="session")
def a_contact(auth_session):
    r = auth_session.get(f"{API}/contacts")
    assert r.status_code == 200
    items = r.json()
    assert items
    return items[0]


@pytest.fixture(scope="session")
def a_deal(auth_session):
    r = auth_session.get(f"{API}/deals")
    assert r.status_code == 200
    items = r.json()
    assert items
    return items[0]


# ── Tasks CRUD ────────────────────────────────────────────────────────────────
class TestTasks:
    def test_create_task_with_contact(self, auth_session, a_contact):
        r = auth_session.post(f"{API}/tasks", json={
            "title": "TEST_call_contact",
            "contact_id": a_contact["id"],
            "due_date": "2026-02-01T09:00:00Z",
            "notes": "TEST reach out",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "TEST_call_contact"
        assert d["status"] == "open"
        assert d["related_entity_type"] == "contact"
        assert d["related_entity_id"] == a_contact["id"]
        assert d.get("source") == "manual"
        TestTasks.tid_contact = d["id"]

    def test_create_task_with_deal(self, auth_session, a_deal):
        r = auth_session.post(f"{API}/tasks", json={
            "title": "TEST_deal_task",
            "deal_id": a_deal["id"],
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["related_entity_type"] == "deal"
        assert d["related_entity_id"] == a_deal["id"]
        TestTasks.tid_deal = d["id"]

    def test_list_tasks_contains_created(self, auth_session):
        r = auth_session.get(f"{API}/tasks")
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert TestTasks.tid_contact in ids
        assert TestTasks.tid_deal in ids

    def test_patch_status_done_sets_completed_at(self, auth_session):
        r = auth_session.patch(f"{API}/tasks/{TestTasks.tid_contact}", json={"status": "done"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "done"
        assert d.get("completed_at"), "completed_at should be set when status=done"

    def test_delete_task(self, auth_session):
        r = auth_session.delete(f"{API}/tasks/{TestTasks.tid_deal}")
        assert r.status_code == 200
        r2 = auth_session.get(f"{API}/tasks")
        assert TestTasks.tid_deal not in [t["id"] for t in r2.json()]


# ── Email log CRUD ────────────────────────────────────────────────────────────
class TestEmailLog:
    def test_log_email_and_bump_contact(self, auth_session, a_contact):
        before = a_contact.get("interaction_count", 0)
        r = auth_session.post(f"{API}/emails", json={
            "contact_id": a_contact["id"],
            "direction": "in",
            "subject": "TEST inbound ping",
            "body": "Hi — interested in coaching. What's pricing?",
            "from_addr": "prospect@example.com",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["subject"] == "TEST inbound ping"
        assert d["direction"] == "in"
        assert d.get("source") == "manual"
        assert "_id" not in d
        TestEmailLog.eid = d["id"]
        # Verify contact interaction_count incremented
        contacts = auth_session.get(f"{API}/contacts").json()
        c = next(x for x in contacts if x["id"] == a_contact["id"])
        assert c.get("interaction_count", 0) >= before + 1

    def test_list_emails_by_contact_sorted(self, auth_session, a_contact):
        # log a 2nd email to validate ordering
        auth_session.post(f"{API}/emails", json={
            "contact_id": a_contact["id"],
            "direction": "out",
            "subject": "TEST reply",
            "body": "Thanks for your email.",
        })
        r = auth_session.get(f"{API}/emails", params={"contact_id": a_contact["id"]})
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 2
        # desc sort: first row received_at >= last row
        assert rows[0]["received_at"] >= rows[-1]["received_at"]
        assert all(e["contact_id"] == a_contact["id"] for e in rows)

    def test_delete_email(self, auth_session):
        r = auth_session.delete(f"{API}/emails/{TestEmailLog.eid}")
        assert r.status_code == 200


# ── Contact timeline (existing endpoint drives ContactDetail page) ───────────
class TestContactTimeline:
    def test_timeline_includes_emails(self, auth_session, a_contact):
        # log an email first to guarantee content
        auth_session.post(f"{API}/emails", json={
            "contact_id": a_contact["id"],
            "direction": "in",
            "subject": "TEST_timeline_email",
            "body": "Hello",
        })
        r = auth_session.get(f"{API}/contacts/{a_contact['id']}/timeline")
        assert r.status_code == 200, r.text
        tl = r.json()
        assert "emails" in tl
        assert "deals" in tl
        assert "form_submissions" in tl or "submissions" in tl
        # invoices & tasks may be present
        assert any(e.get("subject") == "TEST_timeline_email" for e in tl["emails"])


# ── Scheduler status ─────────────────────────────────────────────────────────
class TestScheduler:
    def test_status_shape(self, auth_session):
        r = auth_session.get(f"{API}/scheduler/status")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("running") is True
        assert "last_run_at" in d
        assert "last_run_processed" in d
        assert d.get("tick_seconds") and isinstance(d["tick_seconds"], int)


# ── Multi-step funnel ────────────────────────────────────────────────────────
class TestFunnel:
    slug = f"test-funnel-{uuid.uuid4().hex[:6]}"

    def test_create_multistep(self, auth_session):
        form = {
            "name": "TEST Qualify Funnel",
            "slug": TestFunnel.slug,
            "fields": [],  # empty for multi-step
            "steps": [
                {
                    "id": "s1",
                    "title": "Qualify",
                    "fields": [
                        {"key": "budget", "label": "Budget", "type": "select",
                         "options": ["<$5k", "$5k+"], "required": True}
                    ],
                    "branches": [
                        {"if_field": "budget", "equals": "<$5k", "goto_step_id": None},
                    ],
                },
                {
                    "id": "s2",
                    "title": "Contact",
                    "fields": [
                        {"key": "email", "label": "Email", "type": "email", "required": True}
                    ],
                    "branches": [],
                },
            ],
            "consent_text": "I agree",
        }
        r = auth_session.post(f"{API}/forms", json=form)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["slug"] == TestFunnel.slug
        assert len(d.get("steps") or []) == 2
        assert d["fields"] == []
        TestFunnel.form_id = d["id"]

    def test_public_returns_steps(self):
        r = requests.get(f"{API}/forms/{TestFunnel.slug}/public")
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("steps"), list) and len(d["steps"]) == 2
        assert d["steps"][0]["fields"][0]["key"] == "budget"
        assert d["steps"][0]["branches"][0]["equals"] == "<$5k"

    def test_public_submit_creates_contact(self, auth_session):
        email = f"funnel_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{API}/forms/{TestFunnel.slug}/submit", json={
            "answers": {"budget": "$5k+", "email": email, "first_name": "TEST_Funnel"},
            "consent_given": True,
        })
        assert r.status_code == 200, r.text
        # Verify contact persisted
        contacts = auth_session.get(f"{API}/contacts").json()
        assert any(c.get("email") == email for c in contacts)

    def test_cleanup(self, auth_session):
        # DELETE /api/forms/{id} endpoint does not exist; skip to avoid false failures
        r = auth_session.delete(f"{API}/forms/{TestFunnel.form_id}")
        if r.status_code == 404:
            pytest.skip("No DELETE /api/forms/{id} endpoint — minor gap, not a regression")
        assert r.status_code == 200


# ── AI reply draft grounding ─────────────────────────────────────────────────
class TestAIReply:
    def test_reply_draft(self, auth_session, a_contact):
        r = auth_session.post(f"{API}/ai/generate", json={
            "kind": "reply",
            "prompt": "Please draft a short friendly reply.",
            "tone": "warm-sherpa",
            "contact_id": a_contact["id"],
            "incoming_email": "Subject: Pricing question\n\nHi, can you share pricing for 1:1 coaching?",
        }, timeout=90)
        assert r.status_code == 200, f"AI call failed {r.status_code} {r.text[:400]}"
        d = r.json()
        assert isinstance(d.get("draft"), str) and len(d["draft"]) > 20
        assert "fields_used" in d
        assert "questions_for_user" in d
        # Ensure contact was part of grounding
        grounding = d.get("grounding_fields") or d.get("fields_used") or []
        assert any(g.get("entity") == "contact" for g in grounding if isinstance(g, dict))

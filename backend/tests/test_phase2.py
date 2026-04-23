"""
Phase 2 Ascent CRM tests:
- Subscriptions / dunning
- Automation engine (deal stage change, form submission, calendly booking)
- SEO pages CRUD + sitemap + AI schema-suggest (Gemini 3)
- Calendly inbound webhook
"""
import json
import os
import time
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
def first_product(auth_session):
    r = auth_session.get(f"{API}/products")
    assert r.status_code == 200
    items = r.json()
    assert items, "Need at least one seeded product"
    return items[0]


@pytest.fixture(scope="session")
def stages(auth_session):
    r = auth_session.get(f"{API}/pipeline-stages")
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) >= 2
    return items


# ── Subscriptions ────────────────────────────────────────────────────────────
class TestSubscriptions:
    def test_create_sub(self, auth_session, first_product):
        r = auth_session.post(f"{API}/subscriptions", json={
            "product_id": first_product["id"],
            "interval": "monthly",
            "quantity": 1,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "active"
        assert d["product_id"] == first_product["id"]
        assert d["next_billing_at"]
        TestSubscriptions.sub_id = d["id"]
        TestSubscriptions.first_next = d["next_billing_at"]

    def test_list_subs(self, auth_session):
        r = auth_session.get(f"{API}/subscriptions")
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert TestSubscriptions.sub_id in ids

    def test_tick_creates_invoice_and_advances(self, auth_session):
        sid = TestSubscriptions.sub_id
        r = auth_session.post(f"{API}/subscriptions/{sid}/tick")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("invoice_id") and body.get("invoice_number", "").startswith("INV-")
        # Verify invoice persisted via list
        r2 = auth_session.get(f"{API}/invoices")
        assert r2.status_code == 200
        assert any(inv["id"] == body["invoice_id"] for inv in r2.json())
        # next_billing_at should have advanced
        r3 = auth_session.get(f"{API}/subscriptions")
        sub = next(s for s in r3.json() if s["id"] == sid)
        assert sub["cycles_billed"] == 1
        assert sub["next_billing_at"] != TestSubscriptions.first_next

    def test_mark_failed_dunning(self, auth_session, first_product):
        # New sub for clean dunning state
        r = auth_session.post(f"{API}/subscriptions", json={
            "product_id": first_product["id"],
            "interval": "monthly",
        })
        sid = r.json()["id"]
        # 1st fail -> past_due
        r1 = auth_session.post(f"{API}/subscriptions/{sid}/mark-failed")
        assert r1.json()["status"] == "past_due"
        assert r1.json()["failed_payments"] == 1
        # 2nd fail -> past_due
        r2 = auth_session.post(f"{API}/subscriptions/{sid}/mark-failed")
        assert r2.json()["status"] == "past_due"
        # 3rd fail -> paused
        r3 = auth_session.post(f"{API}/subscriptions/{sid}/mark-failed")
        assert r3.json()["status"] == "paused"
        assert r3.json()["failed_payments"] == 3

    def test_patch_status(self, auth_session, first_product):
        r = auth_session.post(f"{API}/subscriptions", json={"product_id": first_product["id"]})
        sid = r.json()["id"]
        r2 = auth_session.patch(f"{API}/subscriptions/{sid}", json={"status": "paused"})
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "paused"

    def test_soft_delete(self, auth_session, first_product):
        r = auth_session.post(f"{API}/subscriptions", json={"product_id": first_product["id"]})
        sid = r.json()["id"]
        r2 = auth_session.delete(f"{API}/subscriptions/{sid}")
        assert r2.status_code == 200
        ids = [s["id"] for s in auth_session.get(f"{API}/subscriptions").json()]
        assert sid not in ids


# ── Automations CRUD + execution ─────────────────────────────────────────────
class TestAutomations:
    def test_create_with_trigger_and_actions(self, auth_session, stages):
        target_stage = stages[1]  # "Ascent" or whatever 2nd stage
        rule = {
            "name": "TEST_stage_to_ascent",
            "trigger": {"type": "deal_stage_change", "config": {"to": target_stage["name"]}},
            "actions": [
                {"type": "create_task", "config": {"name": "TEST_followup_task"}},
                {"type": "tag_contact", "config": {"tag": "TEST_auto_tag"}},
            ],
            "enabled": True,
        }
        r = auth_session.post(f"{API}/automations", json=rule)
        assert r.status_code == 200, r.text
        TestAutomations.rule_id = r.json()["id"]
        TestAutomations.target_stage = target_stage

    def test_patch_enabled(self, auth_session):
        r = auth_session.patch(f"{API}/automations/{TestAutomations.rule_id}", json={"enabled": False})
        assert r.status_code == 200, r.text
        assert r.json()["enabled"] is False
        # Re-enable for execution test
        r2 = auth_session.patch(f"{API}/automations/{TestAutomations.rule_id}", json={"enabled": True})
        assert r2.json()["enabled"] is True

    def test_execution_via_stage_change(self, auth_session, stages):
        # Create deal+contact, move to target stage, expect task created and contact tagged
        c = auth_session.post(f"{API}/contacts", json={
            "first_name": "TEST_Auto", "last_name": "Trigger",
            "email": f"auto_{uuid.uuid4().hex[:6]}@example.com",
            "consent": {"marketing": True, "newsletter": True, "source": "TEST", "updated_at": "2026-01-01T00:00:00Z"},
        })
        assert c.status_code == 200, c.text
        contact_id = c.json()["id"]
        d = auth_session.post(f"{API}/deals", json={
            "title": "TEST_AutoDeal",
            "contact_id": contact_id,
            "pipeline_stage_id": stages[0]["id"],
            "value": 100, "currency": "USD",
        })
        assert d.status_code == 200, d.text
        deal_id = d.json()["id"]

        tasks_before = len(auth_session.get(f"{API}/tasks").json())

        # Get rule run_count BEFORE
        rules_before = {r["id"]: r for r in auth_session.get(f"{API}/automations").json()}
        rc_before = rules_before[TestAutomations.rule_id].get("run_count", 0)

        # Move to target stage
        mv = auth_session.patch(f"{API}/deals/{deal_id}/stage",
                                json={"pipeline_stage_id": TestAutomations.target_stage["id"]})
        assert mv.status_code == 200, mv.text

        time.sleep(0.5)

        # 1. run_count incremented
        rules_after = {r["id"]: r for r in auth_session.get(f"{API}/automations").json()}
        assert rules_after[TestAutomations.rule_id].get("run_count", 0) >= rc_before + 1, "run_count not incremented"

        # 2. task created
        tasks_after = auth_session.get(f"{API}/tasks").json()
        assert len(tasks_after) > tasks_before
        new_task = [t for t in tasks_after if t["title"] == "TEST_followup_task"]
        assert new_task, "create_task action did not produce task"

        # 3. contact tagged
        contacts_now = auth_session.get(f"{API}/contacts").json()
        cnow = next((x for x in contacts_now if x["id"] == contact_id), None)
        assert cnow, "contact disappeared"
        assert "TEST_auto_tag" in (cnow.get("tags") or []), f"tag_contact missed: tags={cnow.get('tags')}"

    def test_test_endpoint(self, auth_session):
        r = auth_session.post(f"{API}/automations/{TestAutomations.rule_id}/test",
                              json={"context": {"entity_type": "deal", "entity_id": "fake"}})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert isinstance(body.get("run_log"), list) and len(body["run_log"]) >= 1

    def test_form_submission_trigger(self, auth_session):
        # Create automation that should fire on form submit
        rule = {
            "name": "TEST_form_discovery",
            "trigger": {"type": "form_submission", "config": {"slug": "discovery"}},
            "actions": [{"type": "create_task", "config": {"name": "TEST_discovery_task"}}],
            "enabled": True,
        }
        rc = auth_session.post(f"{API}/automations", json=rule)
        rid = rc.json()["id"]
        rc_before = rc.json().get("run_count", 0)

        # Public submission (no auth)
        pub = requests.post(f"{API}/forms/discovery/submit", json={
            "answers": {"email": f"formauto_{uuid.uuid4().hex[:6]}@example.com",
                        "first_name": "TEST_FormAuto"},
            "consent_given": True,
        })
        assert pub.status_code == 200, pub.text

        time.sleep(0.5)
        rules_after = {r["id"]: r for r in auth_session.get(f"{API}/automations").json()}
        if rules_after[rid].get("run_count", 0) < rc_before + 1:
            pytest.fail("form_submission trigger did not fire (_run_automations not hooked into submit_form)")

    def test_delete(self, auth_session):
        r = auth_session.delete(f"{API}/automations/{TestAutomations.rule_id}")
        assert r.status_code == 200


# ── SEO ──────────────────────────────────────────────────────────────────────
class TestSEO:
    def test_create_page_with_checklist(self, auth_session):
        page = {
            "url_path": f"/test/{uuid.uuid4().hex[:6]}",
            "title": "TEST 5 Voices Leadership Foundation Course Page",
            "meta_description": "Learn the five voices framework for leadership in this comprehensive course offered by CLiMB Leadership Lab.",
            "keywords": ["leadership", "5 voices"],
            "canonical_url": "https://example.com/test",
            "og_image": "https://example.com/img.png",
            "schema_jsonld": '{"@context":"https://schema.org","@type":"Course"}',
        }
        r = auth_session.post(f"{API}/seo/pages", json=page)
        assert r.status_code == 200, r.text
        TestSEO.page_id = r.json()["id"]

    def test_list_returns_checklist(self, auth_session):
        r = auth_session.get(f"{API}/seo/pages")
        assert r.status_code == 200
        items = r.json()
        ours = next((p for p in items if p["id"] == TestSEO.page_id), None)
        assert ours, "Created SEO page not in list"
        assert isinstance(ours.get("checklist"), list) and len(ours["checklist"]) >= 4
        # Each checklist item should have check + pass
        for c in ours["checklist"]:
            assert "check" in c and "pass" in c

    def test_sitemap_xml(self, auth_session):
        r = requests.get(f"{API}/seo/sitemap.xml", params={"owner_email": DEMO_EMAIL})
        assert r.status_code == 200, r.text
        assert "application/xml" in r.headers.get("content-type", "")
        assert "<urlset" in r.text and "</urlset>" in r.text
        assert "<url>" in r.text

    def test_schema_suggest_llm(self, auth_session):
        r = auth_session.post(f"{API}/seo/schema-suggest", json={
            "url_path": "/services/coaching",
            "page_title": "1:1 Executive Coaching",
            "business_type": "coach",
        }, timeout=60)
        assert r.status_code == 200, f"LLM call failed: {r.status_code} {r.text[:300]}"
        jsonld = r.json().get("jsonld", "")
        assert jsonld
        # Must parse as JSON
        data = json.loads(jsonld)
        ctx = data.get("@context", "")
        assert "schema.org" in str(ctx).lower(), f"@context missing schema.org: {ctx}"

    def test_delete(self, auth_session):
        r = auth_session.delete(f"{API}/seo/pages/{TestSEO.page_id}")
        assert r.status_code == 200


# ── Calendly webhook ─────────────────────────────────────────────────────────
class TestCalendlyWebhook:
    def test_inbound_creates_contact_and_deal(self):
        unique = uuid.uuid4().hex[:6]
        email = f"calendly_{unique}@example.com"
        # Public, no auth
        r = requests.post(f"{API}/webhook/calendly", json={
            "payload": {
                "email": email,
                "name": f"TEST CalLead{unique}",
                "scheduled_event": {"name": "Discovery Call"},
            }
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("contact_id")
        assert body.get("deal_id"), "Should create deal in first Basecamp stage"

        # Login and verify
        s = requests.Session()
        tok = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}).json()["token"]
        s.headers.update({"Authorization": f"Bearer {tok}"})
        # Contact tagged source:calendly
        contacts = s.get(f"{API}/contacts").json()
        c = next((x for x in contacts if x["id"] == body["contact_id"]), None)
        assert c, "Contact not found after webhook"
        assert "source:calendly" in (c.get("tags") or [])
        # Deal in Basecamp stage
        deals = s.get(f"{API}/deals").json()
        d = next((x for x in deals if x["id"] == body["deal_id"]), None)
        assert d
        stages = s.get(f"{API}/pipeline-stages").json()
        stg = next((x for x in stages if x["id"] == d["pipeline_stage_id"]), None)
        assert stg and stg.get("altitude_label") == "Basecamp"

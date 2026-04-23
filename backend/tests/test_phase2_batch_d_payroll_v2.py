"""Phase 2 Batch D v2 — PAYE refinements + EMP201 auto-journal posting.

Adds:
  - PAYE age-rebate stack (primary / secondary 65+ / tertiary 75+)
  - Medical-scheme fees tax credit (MSFTC)
  - Retirement-fund deduction (27.5% of gross capped at R350k)
  - POST /api/accounting/reports/emp201/{period}/post      (auto-journal)
  - GET  /api/accounting/reports/emp201/{period}/posting   (fetch posting record)
  - DELETE /api/accounting/reports/emp201/{period}/post    (reverse journal)
"""
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


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _signup_owner():
    email = f"TEST_payv2_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/signup",
                      json={"email": email, "password": "Owner2026!", "name": "Payroll v2 Owner"})
    assert r.status_code in (200, 201), r.text
    return {"email": email, "token": r.json()["token"], "user": r.json()["user"]}


def _seed_accounting(tok):
    r = requests.post(f"{API}/accounting/seed", headers=_h(tok))
    assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def owner():
    o = _signup_owner()
    _seed_accounting(o["token"])
    return o


# ── PAYE refinements ────────────────────────────────────────────────────────
class TestPayeRefinements:

    def test_age_65plus_extra_rebate(self, owner):
        """Age 66 → primary (17,235) + secondary (9,444) = R26,679 rebate.

        R25,000/month → R300k/year → 18% bracket... wait, crosses 237,100:
          42,678 + 0.26 × (300,000 - 237,100) = 42,678 + 16,354 = 59,032.
          Young (under 65): 59,032 - 17,235 = 41,797 → R3,483.08/month.
          Age 66:           59,032 - 26,679 = 32,353 → R2,696.08/month.
        """
        o = _signup_owner()
        _seed_accounting(o["token"])
        requests.post(f"{API}/accounting/employees",
                      headers={**_h(o["token"]), "Content-Type": "application/json"},
                      json={"name": "Senior", "monthly_gross": 25000,
                            "date_of_birth": "1960-01-01"})  # ~66 in 2026
        data = requests.get(f"{API}/accounting/reports/emp201?period=2026-03",
                            headers=_h(o["token"])).json()
        emp = data["employees"][0]
        assert abs(emp["paye"] - 2696.08) < 0.5, f"paye was {emp['paye']}"

    def test_age_75plus_tertiary_rebate(self, owner):
        """Age 76 → primary + secondary + tertiary = 17,235 + 9,444 + 3,145 = R29,824 rebate."""
        o = _signup_owner()
        _seed_accounting(o["token"])
        requests.post(f"{API}/accounting/employees",
                      headers={**_h(o["token"]), "Content-Type": "application/json"},
                      json={"name": "Grandparent", "monthly_gross": 25000,
                            "date_of_birth": "1950-01-01"})  # ~76 in 2026
        data = requests.get(f"{API}/accounting/reports/emp201?period=2026-03",
                            headers=_h(o["token"])).json()
        emp = data["employees"][0]
        # 59,032 - 29,824 = 29,208 / 12 = 2,434.00
        assert abs(emp["paye"] - 2434.0) < 0.5, f"paye was {emp['paye']}"

    def test_medical_aid_tax_credit(self, owner):
        """R50k/month + medical 3 members.
        MSFTC monthly = 364 (main) + 364 (first dep) + 246 (extra) = 974; annual 11,688.
        PAYE base (no RA, no MTC) = R11,302.67/month (R135,632 annual).
        With MTC: 135,632 - 11,688 = 123,944 → R10,328.67/month.
        """
        o = _signup_owner()
        _seed_accounting(o["token"])
        requests.post(f"{API}/accounting/employees",
                      headers={**_h(o["token"]), "Content-Type": "application/json"},
                      json={"name": "Exec", "monthly_gross": 50000, "medical_aid_members": 3})
        data = requests.get(f"{API}/accounting/reports/emp201?period=2026-03",
                            headers=_h(o["token"])).json()
        emp = data["employees"][0]
        assert abs(emp["paye"] - 10328.67) < 0.5, f"paye was {emp['paye']}"

    def test_retirement_fund_deduction(self, owner):
        """R80k/month, RA R5k/month → taxable = 960k − 60k = 900k.
        Slide @ 900k: 251,258 + 0.41×(900,000 − 857,900) = 268,519.
        Minus primary rebate 17,235 → 251,284/12 = R20,940.33 (no medical, young).
        """
        o = _signup_owner()
        _seed_accounting(o["token"])
        requests.post(f"{API}/accounting/employees",
                      headers={**_h(o["token"]), "Content-Type": "application/json"},
                      json={"name": "RA Contributor", "monthly_gross": 80000,
                            "retirement_monthly": 5000})
        data = requests.get(f"{API}/accounting/reports/emp201?period=2026-03",
                            headers=_h(o["token"])).json()
        emp = data["employees"][0]
        assert abs(emp["paye"] - 20940.33) < 1.0, f"paye was {emp['paye']}"
        assert emp["retirement_monthly"] == 5000

    def test_retirement_deduction_capped_at_275pct(self, owner):
        """Over-contribution capped at 27.5% of gross.

        R30k/month (annual 360k), RA R15k/month (annual 180k).
        27.5% cap = 99,000. Deduction = min(180k, 99k, 350k) = R99,000.
        Taxable = 360,000 - 99,000 = 261,000.
        Slide: 42,678 + 0.26×(261,000 - 237,100) = 42,678 + 6,214 = 48,892.
        Minus rebate 17,235 = 31,657/12 = R2,638.08/month.
        """
        o = _signup_owner()
        _seed_accounting(o["token"])
        requests.post(f"{API}/accounting/employees",
                      headers={**_h(o["token"]), "Content-Type": "application/json"},
                      json={"name": "OverContrib", "monthly_gross": 30000,
                            "retirement_monthly": 15000})
        data = requests.get(f"{API}/accounting/reports/emp201?period=2026-03",
                            headers=_h(o["token"])).json()
        emp = data["employees"][0]
        assert abs(emp["paye"] - 2638.08) < 0.5, f"paye was {emp['paye']}"

    def test_totals_includes_gross_and_net(self, owner):
        o = _signup_owner()
        _seed_accounting(o["token"])
        requests.post(f"{API}/accounting/employees",
                      headers={**_h(o["token"]), "Content-Type": "application/json"},
                      json={"name": "One", "monthly_gross": 10000})
        data = requests.get(f"{API}/accounting/reports/emp201?period=2026-03",
                            headers=_h(o["token"])).json()
        assert data["totals"]["gross"] == 10000
        assert data["totals"]["net_pay"] > 0
        # 10k → 120k/year → below 237,100 threshold → 18%×120k = 21,600 − rebate 17,235 = 4,365/12 = 363.75
        assert abs(data["employees"][0]["paye"] - 363.75) < 0.5


# ── EMP201 auto-journal posting ─────────────────────────────────────────────
class TestEmp201AutoJournal:

    def test_post_creates_balanced_journal(self, owner):
        o = _signup_owner()
        _seed_accounting(o["token"])
        requests.post(f"{API}/accounting/employees",
                      headers={**_h(o["token"]), "Content-Type": "application/json"},
                      json={"name": "A", "monthly_gross": 50000})
        requests.post(f"{API}/accounting/employees",
                      headers={**_h(o["token"]), "Content-Type": "application/json"},
                      json={"name": "B", "monthly_gross": 30000})
        r = requests.post(f"{API}/accounting/reports/emp201/2026-03/post",
                          headers=_h(o["token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["journal_date"] == "2026-03-31"
        assert data["totals"]["gross"] == 80000
        # Verify journal exists and is balanced
        j = requests.get(f"{API}/accounting/journals/{data['journal_id']}",
                         headers=_h(o["token"])).json()
        assert j["total_debit"] == j["total_credit"]
        assert j["source"] == "payroll"
        codes = {ln["account_code"] for ln in j["lines"]}
        # Must include at minimum: salaries, PAYE liab, UIF liab, bank net pay
        assert "82600" in codes  # Salaries
        assert "53000" in codes  # PAYE
        assert "53100" in codes  # UIF
        assert "21000" in codes  # Bank
        # Salaries DR should equal gross
        sal = next(ln for ln in j["lines"] if ln["account_code"] == "82600")
        assert sal["debit"] == 80000
        assert sal["credit"] == 0

    def test_post_is_idempotent(self, owner):
        o = _signup_owner()
        _seed_accounting(o["token"])
        requests.post(f"{API}/accounting/employees",
                      headers={**_h(o["token"]), "Content-Type": "application/json"},
                      json={"name": "X", "monthly_gross": 25000})
        r1 = requests.post(f"{API}/accounting/reports/emp201/2026-03/post",
                           headers=_h(o["token"]))
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/accounting/reports/emp201/2026-03/post",
                           headers=_h(o["token"]))
        assert r2.status_code == 409
        assert "already posted" in r2.json()["detail"].lower()

    def test_post_no_employees_400(self, owner):
        o = _signup_owner()
        _seed_accounting(o["token"])
        r = requests.post(f"{API}/accounting/reports/emp201/2026-03/post",
                          headers=_h(o["token"]))
        assert r.status_code == 400

    def test_get_posting_record(self, owner):
        o = _signup_owner()
        _seed_accounting(o["token"])
        requests.post(f"{API}/accounting/employees",
                      headers={**_h(o["token"]), "Content-Type": "application/json"},
                      json={"name": "Y", "monthly_gross": 20000})
        requests.post(f"{API}/accounting/reports/emp201/2026-03/post",
                      headers=_h(o["token"]))
        r = requests.get(f"{API}/accounting/reports/emp201/2026-03/posting",
                         headers=_h(o["token"]))
        assert r.status_code == 200
        assert r.json()["period"] == "2026-03"
        assert r.json()["reversed_at"] is None

    def test_get_posting_404_when_absent(self, owner):
        o = _signup_owner()
        _seed_accounting(o["token"])
        r = requests.get(f"{API}/accounting/reports/emp201/2099-12/posting",
                         headers=_h(o["token"]))
        assert r.status_code == 404

    def test_reverse_then_repost(self, owner):
        o = _signup_owner()
        _seed_accounting(o["token"])
        requests.post(f"{API}/accounting/employees",
                      headers={**_h(o["token"]), "Content-Type": "application/json"},
                      json={"name": "Z", "monthly_gross": 20000})
        p1 = requests.post(f"{API}/accounting/reports/emp201/2026-03/post",
                           headers=_h(o["token"])).json()
        rev = requests.delete(f"{API}/accounting/reports/emp201/2026-03/post",
                              headers=_h(o["token"]))
        assert rev.status_code == 200
        assert "reversal_journal_id" in rev.json()
        # Original journal should be marked reversed
        j = requests.get(f"{API}/accounting/journals/{p1['journal_id']}",
                         headers=_h(o["token"])).json()
        assert j["reversed_by"] == rev.json()["reversal_journal_id"]
        # Re-post works
        p2 = requests.post(f"{API}/accounting/reports/emp201/2026-03/post",
                           headers=_h(o["token"]))
        assert p2.status_code == 200
        assert p2.json()["journal_id"] != p1["journal_id"]

    def test_reverse_404_when_no_active_posting(self, owner):
        o = _signup_owner()
        _seed_accounting(o["token"])
        r = requests.delete(f"{API}/accounting/reports/emp201/2099-12/post",
                            headers=_h(o["token"]))
        assert r.status_code == 404

    def test_rbac_rep_forbidden_to_post(self, owner):
        # Spin up rep on fresh owner
        o = _signup_owner()
        _seed_accounting(o["token"])
        requests.post(f"{API}/accounting/employees",
                      headers={**_h(o["token"]), "Content-Type": "application/json"},
                      json={"name": "Q", "monthly_gross": 20000})
        inv_email = f"TEST_reppayv2_{uuid.uuid4().hex[:6]}@example.com"
        inv = requests.post(f"{API}/team/invites",
                            headers={**_h(o["token"]), "Content-Type": "application/json"},
                            json={"email": inv_email, "role": "rep"})
        assert inv.status_code == 200
        tok = inv.json()["token"]
        acc = requests.post(f"{API}/auth/accept-invite",
                            json={"token": tok, "password": "Rep2026!", "name": "Rep"})
        rep_tok = acc.json()["token"]
        # Rep cannot post
        r = requests.post(f"{API}/accounting/reports/emp201/2026-03/post",
                          headers=_h(rep_tok))
        assert r.status_code == 403

"""Phase 2 Batch D — Payroll, IRP6 provisional tax, and Dividends Tax.

Endpoints:
  POST/GET/PATCH/DELETE /api/accounting/employees  (employee register CRUD)
  GET  /api/accounting/reports/emp201?period=YYYY-MM   (PAYE/UIF/SDL monthly)
  POST /api/accounting/reports/irp6                    (provisional tax workpaper)
  GET  /api/accounting/reports/irp6?tax_year=YYYY      (list workpapers)
  POST /api/accounting/reports/dividends-tax           (declare + 20% WHT)
  GET  /api/accounting/reports/dividends-tax           (list)
  GET  /api/accounting/reports/dividends-tax/summary   (period totals)
"""
import os
import uuid

import pytest
import requests


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
    email = f"TEST_pay_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/signup", json={"email": email, "password": "Owner2026!", "name": "Payroll Owner"})
    assert r.status_code in (200, 201), r.text
    return {"email": email, "token": r.json()["token"], "user": r.json()["user"]}


def _signup_rep(owner_token):
    email = f"TEST_payrep_{uuid.uuid4().hex[:8]}@example.com"
    inv = requests.post(f"{API}/team/invites",
                        headers={"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"},
                        json={"email": email, "role": "rep"})
    assert inv.status_code == 200, inv.text
    tok = inv.json()["token"]
    acc = requests.post(f"{API}/auth/accept-invite", json={
        "token": tok, "password": "RepPass2026!", "name": "Rep Payroll",
    })
    return {"email": email, "token": acc.json()["token"]}


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def owner():
    return _signup_owner()


class TestEmployeesCrud:

    def test_create_employee(self, owner):
        r = requests.post(f"{API}/accounting/employees",
                          headers={**_h(owner["token"]), "Content-Type": "application/json"},
                          json={"name": "Emp One", "monthly_gross": 30000, "role": "Coach"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "Emp One"
        assert data["active"] is True
        assert "id" in data

    def test_list_employees(self, owner):
        r = requests.get(f"{API}/accounting/employees", headers=_h(owner["token"]))
        assert r.status_code == 200
        assert any(e["name"] == "Emp One" for e in r.json())

    def test_patch_employee(self, owner):
        # Find Emp One
        rows = requests.get(f"{API}/accounting/employees", headers=_h(owner["token"])).json()
        eid = next(e["id"] for e in rows if e["name"] == "Emp One")
        r = requests.patch(f"{API}/accounting/employees/{eid}",
                           headers={**_h(owner["token"]), "Content-Type": "application/json"},
                           json={"monthly_gross": 35000})
        assert r.status_code == 200
        updated = requests.get(f"{API}/accounting/employees/{eid}", headers=_h(owner["token"])).json()
        assert updated["monthly_gross"] == 35000

    def test_terminate_employee(self, owner):
        r = requests.post(f"{API}/accounting/employees",
                          headers={**_h(owner["token"]), "Content-Type": "application/json"},
                          json={"name": "Emp Leaving", "monthly_gross": 25000})
        eid = r.json()["id"]
        d = requests.delete(f"{API}/accounting/employees/{eid}", headers=_h(owner["token"]))
        assert d.status_code == 200
        # Should not appear in active_only list
        rows = requests.get(f"{API}/accounting/employees", headers=_h(owner["token"])).json()
        assert not any(e["id"] == eid for e in rows)
        # But does appear with active_only=false
        all_rows = requests.get(f"{API}/accounting/employees?active_only=false", headers=_h(owner["token"])).json()
        assert any(e["id"] == eid for e in all_rows)


class TestEmp201:

    def test_emp201_zero_employees(self, owner):
        o = _signup_owner()  # fresh owner with no employees
        r = requests.get(f"{API}/accounting/reports/emp201?period=2026-04", headers=_h(o["token"]))
        assert r.status_code == 200
        data = r.json()
        assert data["period"] == "2026-04"
        assert data["totals"]["paye"] == 0
        assert data["totals"]["sdl_applies"] is False

    def test_emp201_r50k_employee(self, owner):
        """R50k/month × 12 = R600k annual. SARS 2025/26: 121,475 + 36%×(600k-512,800) = R152,867.
        Minus primary rebate R17,235 = R135,632 annual → R11,302.67 monthly PAYE."""
        o = _signup_owner()
        requests.post(f"{API}/accounting/employees",
                      headers={**_h(o["token"]), "Content-Type": "application/json"},
                      json={"name": "Senior Coach", "monthly_gross": 50000})
        r = requests.get(f"{API}/accounting/reports/emp201?period=2026-04", headers=_h(o["token"]))
        assert r.status_code == 200
        data = r.json()
        assert len(data["employees"]) == 1
        emp = data["employees"][0]
        assert abs(emp["paye"] - 11302.67) < 0.01, f"paye was {emp['paye']}"
        assert abs(emp["uif_employee"] - 177.12) < 0.01, f"uif was {emp['uif_employee']}"
        assert abs(emp["sdl"] - 500.0) < 0.01  # 1% of R50k
        assert data["totals"]["sdl_applies"] is True  # annual 600k > 500k threshold

    def test_emp201_low_income_no_paye(self, owner):
        """R15,000/month → R180k/year → below R237,100 threshold → 18%×180k = R32,400,
        minus rebate R17,235 = R15,165/year = R1,263.75/month."""
        o = _signup_owner()
        requests.post(f"{API}/accounting/employees",
                      headers={**_h(o["token"]), "Content-Type": "application/json"},
                      json={"name": "Junior", "monthly_gross": 15000})
        data = requests.get(f"{API}/accounting/reports/emp201?period=2026-04", headers=_h(o["token"])).json()
        emp = data["employees"][0]
        assert abs(emp["paye"] - 1263.75) < 0.5, f"paye was {emp['paye']}"

    def test_emp201_sdl_threshold(self, owner):
        """Employer under R500k annual payroll should NOT pay SDL."""
        o = _signup_owner()
        requests.post(f"{API}/accounting/employees",
                      headers={**_h(o["token"]), "Content-Type": "application/json"},
                      json={"name": "Small", "monthly_gross": 30000})  # 360k annual < 500k
        data = requests.get(f"{API}/accounting/reports/emp201?period=2026-04", headers=_h(o["token"])).json()
        assert data["totals"]["sdl_applies"] is False
        assert data["totals"]["sdl"] == 0
        assert data["employees"][0]["sdl"] == 0

    def test_emp201_invalid_period(self, owner):
        r = requests.get(f"{API}/accounting/reports/emp201?period=202604", headers=_h(owner["token"]))
        assert r.status_code == 400


class TestIrp6:

    def test_period_1_50pct(self, owner):
        r = requests.post(f"{API}/accounting/reports/irp6",
                          headers={**_h(owner["token"]), "Content-Type": "application/json"},
                          json={"tax_year": 2026, "period": 1, "estimated_taxable_income": 800000})
        assert r.status_code == 200, r.text
        data = r.json()
        assert abs(data["tax_at_27pct"] - 216000) < 0.5
        assert abs(data["provisional_tax_payable"] - 108000) < 0.5  # half of 216k
        assert data["due_by"] == "2025-08-31"

    def test_period_2_settle_remainder(self, owner):
        r = requests.post(f"{API}/accounting/reports/irp6",
                          headers={**_h(owner["token"]), "Content-Type": "application/json"},
                          json={"tax_year": 2026, "period": 2,
                                "estimated_taxable_income": 800000,
                                "provisional_payment_prior": 108000})
        data = r.json()
        # 216k - 108k already paid = 108k payable in P2
        assert abs(data["provisional_tax_payable"] - 108000) < 0.5
        assert data["due_by"] == "2026-02-28"

    def test_invalid_period(self, owner):
        r = requests.post(f"{API}/accounting/reports/irp6",
                          headers={**_h(owner["token"]), "Content-Type": "application/json"},
                          json={"tax_year": 2026, "period": 3, "estimated_taxable_income": 100000})
        assert r.status_code == 400

    def test_list_filters_by_year(self, owner):
        rows = requests.get(f"{API}/accounting/reports/irp6?tax_year=2026", headers=_h(owner["token"])).json()
        assert isinstance(rows, list)
        assert all(r["tax_year"] == 2026 for r in rows)


class TestDividendsTax:

    def test_resident_individual_20pct(self, owner):
        r = requests.post(f"{API}/accounting/reports/dividends-tax",
                          headers={**_h(owner["token"]), "Content-Type": "application/json"},
                          json={"beneficiary_name": "Owner",
                                "beneficiary_type": "sa_resident_individual",
                                "declaration_date": "2026-04-22",
                                "gross_dividend": 100000})
        assert r.status_code == 200
        data = r.json()
        assert abs(data["dividends_tax_withheld"] - 20000) < 0.01
        assert abs(data["net_dividend_paid"] - 80000) < 0.01

    def test_company_beneficiary_exempt(self, owner):
        r = requests.post(f"{API}/accounting/reports/dividends-tax",
                          headers={**_h(owner["token"]), "Content-Type": "application/json"},
                          json={"beneficiary_name": "HoldCo Pty Ltd",
                                "beneficiary_type": "company",
                                "declaration_date": "2026-04-22",
                                "gross_dividend": 50000})
        data = r.json()
        assert data["dividends_tax_withheld"] == 0
        assert data["net_dividend_paid"] == 50000
        assert "section 64F" in (data.get("exemption_note") or "").lower() or "section 64f" in (data.get("exemption_note") or "").lower()

    def test_negative_gross_rejected(self, owner):
        r = requests.post(f"{API}/accounting/reports/dividends-tax",
                          headers={**_h(owner["token"]), "Content-Type": "application/json"},
                          json={"beneficiary_name": "X", "beneficiary_type": "sa_resident_individual",
                                "declaration_date": "2026-04-22", "gross_dividend": -10})
        assert r.status_code == 400

    def test_summary_totals(self, owner):
        data = requests.get(
            f"{API}/accounting/reports/dividends-tax/summary?date_from=2026-01-01&date_to=2026-12-31",
            headers=_h(owner["token"]),
        ).json()
        assert data["declarations_count"] >= 1
        assert data["total_gross_dividend"] >= 100000


class TestPayrollRBAC:

    def test_rep_cannot_create_employee(self, owner):
        rep = _signup_rep(owner["token"])
        r = requests.post(f"{API}/accounting/employees",
                          headers={**_h(rep["token"]), "Content-Type": "application/json"},
                          json={"name": "Nope", "monthly_gross": 10000})
        assert r.status_code == 403

    def test_rep_cannot_declare_dividend(self, owner):
        rep = _signup_rep(owner["token"])
        r = requests.post(f"{API}/accounting/reports/dividends-tax",
                          headers={**_h(rep["token"]), "Content-Type": "application/json"},
                          json={"beneficiary_name": "X", "beneficiary_type": "sa_resident_individual",
                                "declaration_date": "2026-04-22", "gross_dividend": 1000})
        assert r.status_code == 403

    def test_rep_can_read_emp201(self, owner):
        """Read-only endpoints available to rep for transparency."""
        rep = _signup_rep(owner["token"])
        r = requests.get(f"{API}/accounting/reports/emp201?period=2026-04", headers=_h(rep["token"]))
        assert r.status_code == 200

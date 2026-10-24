import pytest
from decimal import Decimal
from services.payroll_engine import Rules, calc_pit, calc_payslip, Block


def test_calc_pit_7_brackets():
    # <= 0
    assert calc_pit(Decimal("0")) == Decimal("0")
    assert calc_pit(Decimal("-1000000")) == Decimal("0")

    # Bậc 1: <= 5M (5%)
    assert calc_pit(Decimal("4000000")) == Decimal("200000")
    assert calc_pit(Decimal("5000000")) == Decimal("250000")

    # Bậc 2: 5M - 10M (10% - 250k)
    # 8M * 0.1 - 250k = 550k
    assert calc_pit(Decimal("8000000")) == Decimal("550000")

    # Bậc 3: 10M - 18M (15% - 750k)
    # 15M * 0.15 - 750k = 1.5M
    assert calc_pit(Decimal("15000000")) == Decimal("1500000")

    # Bậc 4: 18M - 32M (20% - 1.65M)
    # 25M * 0.20 - 1.65M = 3.35M
    assert calc_pit(Decimal("25000000")) == Decimal("3350000")


def test_calc_payslip_sme_vs_enterprise():
    rules_sme = Rules(payroll_mode="sme")
    rules_ent = Rules(
        payroll_mode="enterprise",
        insurance_rate=Decimal("0.105"),
        insurance_cap=46800000,
        tax_self_deduction=11000000,
        tax_dependent_deduction=4400000
    )

    # 1. Chế độ SME: không bảo hiểm, không thuế
    p_sme = calc_payslip(
        base_salary=20000000, allowance=0, std_days_month=26, std_hours=8,
        days=[], ot_hours_official=0, ot_hours_probation=0,
        commission=0, spa_commission=0, tips=0, advances=0,
        rules=rules_sme, has_contract=True, dependents_count=1
    )
    assert p_sme["insurance"] == 0
    assert p_sme["pit"] == 0

    # 2. Chế độ Enterprise: có HĐ, 1 người phụ thuộc, lương 20tr
    # Gross: 0 công (ở đây giả lập full month 26 công để gross = 20tr)
    from dataclasses import dataclass
    from datetime import date
    @dataclass
    class FakeDay:
        work_date: date
        credit: float = 1.0
        probation: bool = False
        holiday: bool = False
        employed: bool = True
        code: str = "X"
        violations: list = None
        penalty: int = 0
        waived: bool = False

    fake_days = [FakeDay(work_date=date(2026, 10, i)) for i in range(1, 27)]
    p_ent = calc_payslip(
        base_salary=20000000, allowance=0, std_days_month=26, std_hours=8,
        days=fake_days, ot_hours_official=0, ot_hours_probation=0,
        commission=0, spa_commission=0, tips=0, advances=0,
        rules=rules_ent, has_contract=True, dependents_count=1
    )
    # Gross = 20M + 500k attendance_bonus = 20.5M
    # BHXH = 20M * 10.5% = 2.1M
    assert p_ent["insurance"] == 2100000
    # Taxable = 20.5M
    # Total deduction = 2.1M (BH) + 11M (bản thân) + 4.4M (1 con) = 17.5M
    # Assessable income = 20.5M - 17.5M = 3.0M (<= 5M)
    # PIT = 3.0M * 5% = 150.000 đ
    assert p_ent["pit"] == 150000
    assert p_ent["net"] == 20500000 - 2100000 - 150000  # 18.250.000 đ

    # 3. Chế độ Enterprise nhưng không có hợp đồng lao động -> miễn bảo hiểm
    p_no_contract = calc_payslip(
        base_salary=20000000, allowance=0, std_days_month=26, std_hours=8,
        days=fake_days, ot_hours_official=0, ot_hours_probation=0,
        commission=0, spa_commission=0, tips=0, advances=0,
        rules=rules_ent, has_contract=False, dependents_count=0
    )
    assert p_no_contract["insurance"] == 0


def test_api_enterprise_rules_and_staff_contract():
    from fastapi.testclient import TestClient
    from server import app
    from tests.auth_helpers import owner_auth_headers
    import database

    database.init_db()
    client = TestClient(app, headers=owner_auth_headers())

    # 1. Update rules to enterprise mode
    res_rules = client.put("/api/hrm/config/rules", json={
        "payroll_mode": "enterprise",
        "insurance_rate": "0.105",
        "insurance_cap": 46800000,
        "tax_self_deduction": 11000000,
        "tax_dependent_deduction": 4400000
    })
    assert res_rules.status_code == 200, res_rules.text
    assert res_rules.json()["rules"]["payroll_mode"] == "enterprise"

    # 2. Tạo nhân viên có hợp đồng lao động & người phụ thuộc
    res_staff = client.post("/api/hrm/employees", json={
        "name": "Nhân Viên Có HĐ Test",
        "employee_code": "NV-CONTRACT-TEST",
        "phone": "0988776655",
        "has_contract": 1,
        "contract_number": "HD-2026/99",
        "contract_type": "Có thời hạn",
        "dependents_count": 2,
        "insurance_salary": 10000000,
        "is_insurance_exempt": 0,
        "base_salary": 15000000
    })
    assert res_staff.status_code == 200, res_staff.text
    sid = res_staff.json()["id"]

    # 3. Lấy lại nhân viên kiểm tra
    res_get = client.get("/api/hrm/employees")
    assert res_get.status_code == 200
    emp = next((x for x in res_get.json() if x["id"] == sid), None)
    assert emp is not None
    assert emp["has_contract"] == 1
    assert emp["contract_number"] == "HD-2026/99"
    assert emp["dependents_count"] == 2
    assert emp["insurance_salary"] == 10000000.0

    # 4. Trả lại rules về SME
    client.put("/api/hrm/config/rules", json={"payroll_mode": "sme"})

    # Dọn dẹp
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM staff WHERE id = ?", (sid,))
    conn.commit()
    conn.close()

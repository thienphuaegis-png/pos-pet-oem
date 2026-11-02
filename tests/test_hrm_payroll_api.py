"""HRM: hồ sơ, import chấm công, tăng ca, tạm ứng, tính/chốt/trả lương, hoa hồng, quyền."""
import io
import json

import openpyxl
import pytest
from fastapi.testclient import TestClient

import database
from server import app
from tests.auth_helpers import owner_auth_headers, staff_auth_headers

client = TestClient(app, headers=owner_auth_headers())
MONTH = "2025-03"  # tháng tương lai xa: không đụng dữ liệu thật, 31 ngày, 5 CN (2,9,16,23,30)


def _db():
    return database.get_db()


@pytest.fixture
def kho_emp():
    conn = _db(); cur = conn.cursor()
    cur.execute("DELETE FROM payroll_periods WHERE month = ?", (MONTH,))
    cur.execute("DELETE FROM staff_attendance WHERE staff_id IN (SELECT id FROM staff WHERE employee_code IN ('TST01','TST02'))")
    cur.execute("DELETE FROM staff_leaves WHERE staff_id IN (SELECT id FROM staff WHERE employee_code IN ('TST01','TST02'))")
    cur.execute("DELETE FROM staff_overtime WHERE staff_id IN (SELECT id FROM staff WHERE employee_code IN ('TST01','TST02'))")
    cur.execute("DELETE FROM hrm_salary_adjustments WHERE staff_id IN (SELECT id FROM staff WHERE employee_code IN ('TST01','TST02'))")
    cur.execute("DELETE FROM staff WHERE employee_code IN ('TST01','TST02')")
    conn.commit()
    kho = cur.execute("SELECT id FROM hrm_work_blocks WHERE name='Kho'").fetchone()[0]
    conn.close()
    r = client.post("/api/hrm/employees", json={
        "name": "NV Test Kho", "employee_code": "TST01", "device_code": "9901", "work_block_id": kho,
        "base_salary": 7_000_000, "allowance": 0, "hire_date": "2025-03-01", "probation_start": "2025-03-01",
        "official_date": "2025-03-16", "bank_account": "0001", "bank_name": "TPBank"})
    assert r.status_code == 200, r.text
    yield r.json()["id"]
    conn = _db(); cur = conn.cursor()
    cur.execute("DELETE FROM payroll_periods WHERE month = ?", (MONTH,))
    cur.execute("DELETE FROM cashbook WHERE ref_type IN ('payroll','salary_advance') AND note LIKE '%NV Test Kho%'")
    cur.execute("DELETE FROM staff_attendance WHERE staff_id IN (SELECT id FROM staff WHERE employee_code IN ('TST01','TST02'))")
    cur.execute("DELETE FROM staff_leaves WHERE staff_id IN (SELECT id FROM staff WHERE employee_code IN ('TST01','TST02'))")
    cur.execute("DELETE FROM staff_overtime WHERE staff_id IN (SELECT id FROM staff WHERE employee_code IN ('TST01','TST02'))")
    cur.execute("DELETE FROM hrm_salary_adjustments WHERE staff_id IN (SELECT id FROM staff WHERE employee_code IN ('TST01','TST02'))")
    cur.execute("DELETE FROM staff WHERE employee_code IN ('TST01','TST02')")
    conn.commit(); conn.close()


def _xlsx(rows):
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["Mã chấm công", "Tên N.Viên", "Phòng ban", "Chức vụ", "Ngày", "Thứ", "Vào1", "Ra1", "Vào2", "Ra2", "Vào3", "Ra3"])
    for r in rows:
        ws.append(r)
    buf = io.BytesIO(); wb.save(buf)
    return ("cc.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


def _full_month_rows(code="9901", skip=(), late_day=None):
    rows = []
    for d in range(1, 32):
        if d in skip:
            continue
        vin = "08:01" if d == late_day else "07:55"
        rows.append([int(code), "NV Test Kho", "Kho", "NV", f"{d:02d}/03/2025", "", vin, "18:00", None, None, None, None])
    return rows


def _line(res, sid):
    return [l for l in res["lines"] if l["staff_id"] == sid][0]


def test_import_unknown_code_reported_and_manual_kept(kho_emp):
    client.put("/api/hrm/attendance", json={"staff_id": kho_emp, "work_date": "2025-03-03", "punches": ["08:00", "18:00"], "note": "sửa tay"})
    r = client.post("/api/hrm/attendance/import", files={"file": _xlsx([
        [9901, "NV Test Kho", "", "", "03/03/2025", "", "09:00", "18:00"],
        [9901, "NV Test Kho", "", "", "04/03/2025", "", "07:59", "18:00"],
        [7777, "Người lạ", "", "", "04/03/2025", "", "08:00", "18:00"],
    ])})
    body = r.json()
    assert r.status_code == 200, r.text
    assert body["imported"] == 1 and body["skipped_manual"] == 1
    assert body["unknown_codes"] == [{"device_code": "7777", "name": "Người lạ"}]
    conn = _db()
    p = conn.execute("SELECT punches FROM staff_attendance WHERE staff_id=? AND work_date='2025-03-03'", (kho_emp,)).fetchone()[0]
    conn.close()
    assert json.loads(p) == ["08:00", "18:00"]


def test_import_device_export_format_leading_zeros(kho_emp):
    """File xuất thẳng từ máy: tiêu đề 'Mã N.Viên', 2 dòng tiêu đề phía trên, mã '09901' (staff lưu '9901')."""
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["CHI TIẾT CHẤM CÔNG"]); ws.append(["Từ ngày 01/03/2025 đến ngày 31/03/2025"])
    ws.append(["Mã N.Viên", "Tên N.Viên", "Phòng ban", "Chức vụ", "Ngày", "Thứ", "Vào1", "Ra1", "Vào2", "Ra2", "Vào3", "Ra3", "Công"])
    ws.append(["09901", "NV Test Kho", "Kho", "", "05/03/2025", "T.4", "07:50", "18:02", "", "", "", "", 1])
    buf = io.BytesIO(); wb.save(buf)
    r = client.post("/api/hrm/attendance/import", files={"file": ("D2026.xlsx", buf.getvalue(), "application/vnd.ms-excel")})
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 1 and r.json()["unknown_codes"] == []


def test_import_no_header_returns_400():
    wb = openpyxl.Workbook(); wb.active.append(["abc", "xyz"])
    buf = io.BytesIO(); wb.save(buf)
    r = client.post("/api/hrm/attendance/import", files={"file": ("x.xlsx", buf.getvalue(), "application/vnd.ms-excel")})
    assert r.status_code == 400 and "tiêu đề" in r.json()["detail"]


def test_exempt_staff_full_pay_but_no_attendance_bonus(kho_emp):
    client.put(f"/api/hrm/employees/{kho_emp}", json={"is_attendance_exempt": 1})
    for d in ("2025-03-10", "2025-03-20"):
        client.put("/api/hrm/attendance", json={"staff_id": kho_emp, "work_date": d, "leave_type": "off"})
    line = _line(client.post(f"/api/hrm/payroll/{MONTH}/calculate").json(), kho_emp)
    assert line["days_official"] + line["days_probation"] == 29 and line["penalties"] == 0
    assert line["attendance_bonus"] == 0


def test_full_month_split_probation_attendance_bonus(kho_emp):
    # Nghỉ có phép 2 ngày (Kho được nghỉ 2 ngày/tháng): 10 và 20. Thử việc 01-15, chính thức từ 16.
    client.post("/api/hrm/attendance/import", files={"file": _xlsx(_full_month_rows(skip=(10, 20)))})
    for d in ("2025-03-10", "2025-03-20"):
        assert client.put("/api/hrm/attendance", json={"staff_id": kho_emp, "work_date": d, "leave_type": "off"}).status_code == 200
    res = client.post(f"/api/hrm/payroll/{MONTH}/calculate").json()
    line = _line(res, kho_emp)
    assert line["std_days"] == 29
    assert line["days_probation"] == 14.0 and line["days_official"] == 15.0
    # 7tr/29*15 + 5.95tr/29*14 = 3.620.690 + 2.872.414
    assert line["pay_days"] == 6_493_103
    assert line["penalties"] == 0
    assert line["attendance_bonus"] == 500_000
    assert line["net_rounded"] == 6_993_000


def test_late_one_minute_penalty_and_no_attendance_bonus(kho_emp):
    client.post("/api/hrm/attendance/import", files={"file": _xlsx(_full_month_rows(skip=(10, 20), late_day=5))})
    for d in ("2025-03-10", "2025-03-20"):
        client.put("/api/hrm/attendance", json={"staff_id": kho_emp, "work_date": d, "leave_type": "off"})
    line = _line(client.post(f"/api/hrm/payroll/{MONTH}/calculate").json(), kho_emp)
    assert line["penalties"] == 5000
    assert line["attendance_bonus"] == 0


def test_no_penalty_before_hire_date(kho_emp):
    client.put(f"/api/hrm/employees/{kho_emp}", json={"hire_date": "2025-03-25", "probation_start": "2025-03-25", "official_date": None})
    line = _line(client.post(f"/api/hrm/payroll/{MONTH}/calculate").json(), kho_emp)
    before = [d for d in line["days"] if d["date"] < "2025-03-25"]
    assert before and all(d["penalty"] == 0 for d in before)


def test_advances_filtered_by_month_and_overtime(kho_emp):
    client.post("/api/hrm/attendance/import", files={"file": _xlsx(_full_month_rows(skip=(10, 20)))})
    assert client.post("/api/hrm/advances", json={"staff_id": kho_emp, "advance_date": "2025-02-20", "amount": 3_000_000}).status_code == 200
    assert client.post("/api/hrm/advances", json={"staff_id": kho_emp, "advance_date": "2025-03-05", "amount": 500_000}).status_code == 200
    assert client.post("/api/hrm/overtime", json={"staff_id": kho_emp, "work_date": "2025-03-20", "hours": 2}).status_code == 200
    line = _line(client.post(f"/api/hrm/payroll/{MONTH}/calculate").json(), kho_emp)
    assert line["advances"] == 500_000
    assert line["ot_hours_official"] == 2 and line["ot_pay"] == round(7_000_000 / 29 / 8.5 * 1.5 * 2)


def test_salary_adjustment_effective_date(kho_emp):
    client.post(f"/api/hrm/employees/{kho_emp}/adjustments", json={"effective_date": "2025-04-01", "base_delta": 1_000_000, "reason": "tăng lương"})
    line = _line(client.post(f"/api/hrm/payroll/{MONTH}/calculate").json(), kho_emp)
    assert line["base_salary"] == 7_000_000


def test_lock_blocks_edits_and_pay_creates_cashbook_and_delete_reverts(kho_emp):
    client.post("/api/hrm/attendance/import", files={"file": _xlsx(_full_month_rows(skip=(10, 20)))})
    client.post(f"/api/hrm/payroll/{MONTH}/calculate")
    assert client.post(f"/api/hrm/payroll/{MONTH}/lock").status_code == 200
    assert client.put("/api/hrm/attendance", json={"staff_id": kho_emp, "work_date": "2025-03-11", "punches": []}).status_code == 400
    assert client.post(f"/api/hrm/payroll/{MONTH}/calculate").status_code == 400
    conn = _db()
    acc = conn.execute("SELECT id FROM payment_accounts WHERE is_active=1 ORDER BY id LIMIT 1").fetchone()[0]
    conn.close()
    r = client.post(f"/api/hrm/payroll/{MONTH}/pay", json={"account_id": acc, "staff_ids": [kho_emp]})
    assert r.status_code == 200, r.text
    line = _line(r.json(), kho_emp)
    assert line["cashbook_id"]
    conn = _db()
    cb = conn.execute("SELECT * FROM cashbook WHERE id=?", (line["cashbook_id"],)).fetchone()
    conn.close()
    assert cb["type"] == "out" and cb["category"] == "Chi lương & hoa hồng nhân viên" and cb["amount"] == line["net_pay"]
    assert client.post(f"/api/hrm/payroll/{MONTH}/unlock").status_code == 400
    assert client.delete(f"/api/cashbook/{line['cashbook_id']}").status_code == 200
    after = _line(client.get(f"/api/hrm/payroll/{MONTH}").json(), kho_emp)
    assert after["cashbook_id"] is None
    assert client.post(f"/api/hrm/payroll/{MONTH}/unlock").status_code == 200


def test_permission_required():
    c = TestClient(app, headers=staff_auth_headers("cashier"))
    assert c.get(f"/api/hrm/payroll/{MONTH}").status_code == 403
    assert c.post("/api/hrm/attendance/import", files={"file": _xlsx([])}).status_code == 403


def test_spa_staff_merged_into_staff():
    conn = _db()
    legacy = conn.execute("SELECT COUNT(*) FROM spa_staff").fetchone()[0]
    merged = conn.execute("SELECT COUNT(*) FROM staff WHERE legacy_spa_staff_id IS NOT NULL").fetchone()[0]
    conn.close()
    assert merged == legacy
    database.init_db()
    conn = _db()
    assert conn.execute("SELECT COUNT(*) FROM staff WHERE legacy_spa_staff_id IS NOT NULL").fetchone()[0] == legacy
    conn.close()


def test_order_edit_and_bulk_reassign_recompute_commission():
    conn = _db(); cur = conn.cursor()
    cur.execute("DELETE FROM staff WHERE employee_code IN ('TSTC1','TSTC2')")
    cur.execute("INSERT INTO staff (name, role, is_active, commission_rate, employee_code) VALUES ('HH 5%', 'staff', 1, 5, 'TSTC1')")
    a = cur.lastrowid
    cur.execute("INSERT INTO staff (name, role, is_active, commission_rate, employee_code) VALUES ('HH 10%', 'staff', 1, 10, 'TSTC2')")
    b = cur.lastrowid
    cur.execute("DELETE FROM orders WHERE code = 'HD-TST-COMM'")
    cur.execute("""INSERT INTO orders (code, customer_id, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, commission_amount, status)
                   VALUES ('HD-TST-COMM', NULL, ?, 1000000, 0, 1000000, 1000000, 0, 50000, 'Đã thanh toán')""", (a,))
    conn.commit(); conn.close()
    r = client.put("/api/orders/HD-TST-COMM", json={"discount": 400000})
    assert r.status_code == 200, r.text
    conn = _db()
    assert conn.execute("SELECT commission_amount FROM orders WHERE code='HD-TST-COMM'").fetchone()[0] == 30000
    conn.close()
    r = client.post("/api/orders/bulk-update-staff", json={"order_codes": ["HD-TST-COMM"], "new_staff_id": b})
    assert r.status_code == 200, r.text
    conn = _db(); cur = conn.cursor()
    assert cur.execute("SELECT commission_amount FROM orders WHERE code='HD-TST-COMM'").fetchone()[0] == 60000
    cur.execute("DELETE FROM orders WHERE code='HD-TST-COMM'")
    cur.execute("DELETE FROM staff WHERE employee_code IN ('TSTC1','TSTC2')")
    conn.commit(); conn.close()


def test_sales_commission_excludes_draft_and_subtracts_returns():
    from services.commission import sales_commission_by_staff
    conn = _db(); cur = conn.cursor()
    cur.execute("DELETE FROM staff WHERE employee_code='TSTC3'")
    cur.execute("INSERT INTO staff (name, role, is_active, commission_rate, employee_code) VALUES ('HH ret', 'staff', 1, 10, 'TSTC3')")
    sid = cur.lastrowid
    cur.execute("""INSERT INTO orders (code, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, status, created_at)
                   VALUES ('HD-TST-R1', ?, 1000000, 0, 1000000, 1000000, 0, 'Đã thanh toán', '2025-03-05 03:00:00')""", (sid,))
    oid = cur.lastrowid
    cur.execute("""INSERT INTO orders (code, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, status, created_at)
                   VALUES ('HD-TST-R2', ?, 500000, 0, 500000, 0, 500000, 'Lưu nháp', '2025-03-05 03:00:00')""", (sid,))
    cur.execute("""INSERT INTO order_returns (code, original_order_id, return_total, created_at)
                   VALUES ('TH-TST-R1', ?, 200000, '2025-03-06 03:00:00')""", (oid,))
    res = sales_commission_by_staff(cur, "2025-03-01 00:00:00", "2025-03-31 23:59:59")[sid]
    assert res["net"] == 800000 and res["commission"] == 80000
    cur.execute("DELETE FROM order_returns WHERE code='TH-TST-R1'")
    cur.execute("DELETE FROM orders WHERE code IN ('HD-TST-R1','HD-TST-R2')")
    cur.execute("DELETE FROM staff WHERE id=?", (sid,))
    conn.commit(); conn.close()


def test_spa_commission_by_role_and_tip_split():
    from services.commission import spa_commission_by_name
    conn = _db(); cur = conn.cursor()
    cur.execute("DELETE FROM spa_commission_rules")
    cur.execute("INSERT INTO spa_commission_rules (role_key, service_name, rate_type, value) VALUES ('cutter', NULL, 'percent', 10)")
    cur.execute("INSERT INTO spa_commission_rules (role_key, service_name, rate_type, value) VALUES ('worker_1', NULL, 'fixed', 5000)")
    cust = cur.execute("SELECT id FROM contacts ORDER BY id LIMIT 1").fetchone()[0]
    pet = cur.execute("SELECT id FROM pets ORDER BY id LIMIT 1").fetchone()
    cur.execute("""INSERT INTO pet_service_tickets (code, customer_id, pet_id, service_type, price, status, ticket_date, services_json, staff_cutter, staff_worker_1, tip_amount)
                   VALUES ('SPA-TST-1', ?, ?, 'Combo', 220000, 'completed', '2025-03-07', ?, 'Thợ A', 'Thợ B', 20000)""",
                (cust, pet[0] if pet else None, json.dumps([{"name": "Combo Vip 2", "quantity": 1, "price": 200000}, {"name": "Tiền tip thợ", "quantity": 1, "price": 20000, "is_tip": True}])))
    res = spa_commission_by_name(cur, "2025-03-01", "2025-03-31")
    assert res["thợ a"]["commission"] == 20000 and res["thợ a"]["tips"] == 10000
    assert res["thợ b"]["commission"] == 5000 and res["thợ b"]["tips"] == 10000
    cur.execute("DELETE FROM pet_service_tickets WHERE code='SPA-TST-1'")
    cur.execute("DELETE FROM spa_commission_rules")
    conn.commit(); conn.close()

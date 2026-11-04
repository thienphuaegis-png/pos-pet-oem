import sqlite3
from fastapi.testclient import TestClient

import database
from server import app
from dependencies import get_current_user, require_permission


def test_purge_staff_with_shifts_contacts_adjustments_and_spa_staff_never_resurrects():
    database.init_db()
    conn = database.get_db()
    cur = conn.cursor()

    # 1. Tạo thợ Spa cũ ở bảng spa_staff + đồng bộ sang staff (tái hiện Thanh Vân / Thanh Thanh / Vân Vân)
    cur.execute("CREATE TABLE IF NOT EXISTS spa_staff (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_code TEXT, name TEXT, phone TEXT, role TEXT, is_active INTEGER DEFAULT 1)")
    cur.execute("INSERT INTO spa_staff (staff_code, name, phone, role, is_active) VALUES ('SPA99', 'Thanh Vân Zombie Test', '0900111222', 'Spa', 1)")
    legacy_id = cur.lastrowid

    cur.execute(
        "INSERT INTO staff (name, phone, role, is_active, position, is_spa_worker, is_payroll_staff, legacy_spa_staff_id) VALUES (?, ?, 'staff', 1, 'Spa', 1, 1, ?)",
        ("Thanh Vân Zombie Test", "0900111222", legacy_id),
    )
    zombie_staff_id = cur.lastrowid

    # 2. Gắn đủ khóa ngoại khó xóa (shifts.cashier_id NOT NULL, contacts.created_by, hrm_salary_adjustments) tái hiện #4 Trần Nguyễn Quế Đôn
    cur.execute("INSERT INTO shifts (cashier_id, status, opening_cash) VALUES (?, 'closed', 0)", (zombie_staff_id,))
    shift_id = cur.lastrowid
    cur.execute("INSERT INTO contacts (type, name, phone, created_by) VALUES ('customer', 'Khách Test FK Staff', '0988777665', ?)", (zombie_staff_id,))
    contact_id = cur.lastrowid
    cur.execute(
        "INSERT INTO hrm_salary_adjustments (staff_id, decision_date, effective_date, adjustment_type, base_delta, allowance_delta, reason) VALUES (?, '2026-08-01', '2026-08-01', 'salary', 500000, 0, 'Test FK')",
        (zombie_staff_id,),
    )
    conn.commit()
    conn.close()

    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner"}
    app.dependency_overrides[require_permission("payroll.manage")] = lambda: {"id": 1, "name": "Admin", "role": "owner"}
    client = TestClient(app)

    try:
        # 3. Xóa qua API HRM -> phải thành công 200 thay vì lỗi FK 500
        res_del = client.delete(f"/api/hrm/employees/{zombie_staff_id}")
        assert res_del.status_code == 200, res_del.text

        # 4. Restart/chạy lại init_db() và list_spa_staff -> nhân viên đã xóa TUYỆT ĐỐI KHÔNG tự mọc lại
        database.init_db()
        client.get("/api/pet-services/staff?month=2026-10")

        res_emps = client.get("/api/hrm/employees")
        assert res_emps.status_code == 200
        names = [e["name"] for e in res_emps.json()]
        assert "Thanh Vân Zombie Test" not in names

        # 5. Lịch sử ca và khách hàng vẫn được bảo toàn an toàn
        conn2 = database.get_db()
        cur2 = conn2.cursor()
        sh = cur2.execute("SELECT cashier_id FROM shifts WHERE id=?", (shift_id,)).fetchone()
        assert sh is not None and sh["cashier_id"] != zombie_staff_id
        ct = cur2.execute("SELECT created_by FROM contacts WHERE id=?", (contact_id,)).fetchone()
        assert ct is not None and ct["created_by"] is None
        cur2.execute("DELETE FROM shifts WHERE id=?", (shift_id,))
        cur2.execute("DELETE FROM contacts WHERE id=?", (contact_id,))
        conn2.commit()
        conn2.close()
    finally:
        app.dependency_overrides.clear()


def test_admin_role_can_view_other_employee_payslip():
    database.init_db()
    conn = database.get_db()
    cur = conn.cursor()
    emp = cur.execute("SELECT id, name FROM staff WHERE COALESCE(is_payroll_staff, 1)=1 AND id != 1 LIMIT 1").fetchone()
    conn.close()
    assert emp is not None

    # Đăng nhập với role = 'admin' (trước đây bị sót khỏi danh sách cho phép xem staff_id khác)
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "admin"}
    app.dependency_overrides[require_permission("payroll.manage")] = lambda: {"id": 1, "name": "Admin", "role": "admin"}
    client = TestClient(app)

    try:
        client.post("/api/hrm/payroll/2026-10/calculate")
        res = client.get(f"/api/hrm/my-payslip?month=2026-10&staff_id={emp['id']}")
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["staff"]["id"] == emp["id"]
        assert body["status"] == "ok"
        assert "payslip" in body
    finally:
        app.dependency_overrides.clear()


def test_ui_adjustment_filter_and_admin_payslip_controls_present():
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    html = (root / "templates" / "index.html").read_text(encoding="utf-8")
    hrm_js = (root / "static" / "js" / "modules" / "hrm.js").read_text(encoding="utf-8")

    # 1. Điều chỉnh lương: loadHrmSalaryAdjustments gọi filterHrmAdjustmentsTable() thay vì render thẳng toàn bộ
    assert 'onchange="onHrmAdjStaffFilterChange(this.value)"' in html
    assert "renderHrmAdjustmentsTable(hrmAdjustmentsList)" not in hrm_js

    # 2. Admin xem phiếu lương nhân viên ở cả Bảng Lương, Nhân Sự, Modal và Tab Phiếu Lương
    assert 'id="my-payslip-admin-staff-box"' in html
    assert 'id="hrm-payslip-modal-staff"' in html
    assert "openHrmPayslipModal(${l.staff_id})" in hrm_js
    assert "openHrmPayslipModal(${r.id})" in hrm_js


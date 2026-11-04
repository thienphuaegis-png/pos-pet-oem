from pathlib import Path
from datetime import date
from fastapi.testclient import TestClient

import database
from server import app
from routers.auth import _make_token, pwd_ctx


def _owner_headers():
    database.init_db()
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, COALESCE(token_version, 0) tv FROM staff WHERE role IN ('owner', 'admin') ORDER BY id LIMIT 1")
    row = cur.fetchone()
    conn.close()
    tok = _make_token(row["id"], row["tv"], hours=2, typ="access")
    return {"Authorization": f"Bearer {tok}"}


def _create_phi_phung_staff():
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM hrm_work_blocks WHERE name='Văn Phòng' LIMIT 1")
    blk = cur.fetchone()
    blk_id = blk["id"] if blk else 1
    cur.execute("DELETE FROM staff WHERE username = 'phiphung_test' OR employee_code = 'NV99PP'")
    cur.execute(
        """
        INSERT INTO staff (name, username, password_hash, role, employee_code, department, position,
                           work_block_id, base_salary, is_payroll_staff, is_active, allow_remote_checkin)
        VALUES (?, ?, ?, 'staff', 'NV99PP', 'Văn Phòng', 'Nhân viên VP', ?, 8000000, 1, 1, 0)
        """,
        ("Hoàng Phi Phụng Test", "phiphung_test", pwd_ctx.hash("123456"), blk_id),
    )
    sid = cur.lastrowid
    conn.commit()
    conn.close()
    return sid


def _login(client, username, password):
    r = client.post("/api/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"Authorization": f"Bearer {data['access_token']}"}, data


def test_staff_with_payroll_manage_perm_access_and_briefing_privacy():
    auth_headers = _owner_headers()
    client = TestClient(app)
    sid = _create_phi_phung_staff()

    # Cấp quyền payroll.manage riêng cho Phi Phụng (role = 'staff')
    r_perm = client.post(
        "/api/settings/staff-permissions",
        headers=auth_headers,
        json={"staff_id": sid, "perm_key": "payroll.manage", "allowed": True},
    )
    assert r_perm.status_code == 200

    pp_headers, login_data = _login(client, "phiphung_test", "123456")
    assert login_data["user"]["role"] == "staff"
    assert "payroll.manage" in login_data["user"]["permissions"]

    r_me = client.get("/api/auth/me", headers=pp_headers)
    assert r_me.status_code == 200
    assert "payroll.manage" in r_me.json()["permissions"]

    # Phi Phụng truy cập được API HRM Bảng lương & Chấm công
    ym = date.today().strftime("%Y-%m")
    assert client.get(f"/api/hrm/payroll/{ym}", headers=pp_headers).status_code == 200
    assert client.get(f"/api/hrm/attendance?month={ym}", headers=pp_headers).status_code == 200

    # Tác Nhân AI briefing không rò rỉ doanh thu/nợ NCC của chủ shop cho role='staff'
    r_brief = client.get("/api/ai/staff-briefing", headers=pp_headers)
    assert r_brief.status_code == 200
    bdata = r_brief.json()
    assert "nợ NCC/xưởng" not in bdata["briefing_desc"]
    assert "self_attendance" in bdata


def test_remote_wfh_checkin_guard_and_punch_flow():
    auth_headers = _owner_headers()
    client = TestClient(app)
    sid = _create_phi_phung_staff()
    pp_headers, _ = _login(client, "phiphung_test", "123456")

    # Khi chưa bật allow_remote_checkin -> bị chặn 403
    r_blocked = client.post("/api/hrm/self-attendance/punch", headers=pp_headers, json={})
    assert r_blocked.status_code == 403

    # Chủ shop bật allow_remote_checkin = 1 cho nhân viên làm ở nhà
    r_enable = client.put(
        f"/api/hrm/employees/{sid}",
        headers=auth_headers,
        json={"allow_remote_checkin": 1},
    )
    assert r_enable.status_code == 200

    # Bấm chấm công vào ca thành công
    r_punch = client.post("/api/hrm/self-attendance/punch", headers=pp_headers, json={})
    assert r_punch.status_code == 200, r_punch.text
    pdata = r_punch.json()
    assert pdata["status"] == "ok"
    assert pdata["action_done"] == "check_in"
    assert pdata["attendance"]["allow_remote_checkin"] is True
    assert len(pdata["attendance"]["punches"]) == 1

    # Tính lương tháng này: nhân viên WFH không bị cảnh báo giả "Chưa có mã máy chấm công"
    ym = date.today().strftime("%Y-%m")
    r_calc = client.post(f"/api/hrm/payroll/{ym}/calculate", headers=auth_headers)
    assert r_calc.status_code == 200
    line = next(l for l in r_calc.json()["lines"] if l["staff_id"] == sid)
    assert "Chưa có mã máy chấm công" not in (line.get("anomalies") or [])
    for col in ("position", "total_days", "probation_salary", "fuel_other", "bonus_other", "gross", "deduction_other"):
        assert col in line


def test_payroll_columns_persistence_and_ui_contracts():
    auth_headers = _owner_headers()
    client = TestClient(app)
    r_put = client.put(
        "/api/hrm/payroll-columns",
        headers=auth_headers,
        json={"columns": {"insurance": False, "pit": False, "position": True}},
    )
    assert r_put.status_code == 200
    r_get = client.get("/api/hrm/payroll-columns", headers=auth_headers)
    assert r_get.status_code == 200
    assert r_get.json()["columns"]["insurance"] is False
    assert r_get.json()["columns"]["pit"] is False

    root = Path(__file__).resolve().parents[1]
    auth_js = (root / "static/js/auth.js").read_text(encoding="utf-8")
    hrm_js = (root / "static/js/modules/hrm.js").read_text(encoding="utf-8")
    html = (root / "templates/index.html").read_text(encoding="utf-8")

    # 1. Auth UI dùng data-perm độc lập với data-role và refreshUserProfile gọi lại applyRoleUI
    assert "else if (el.dataset.perm && hasPermList)" in auth_js
    assert "await applyRoleUI();" in auth_js

    # 2. Tab Tác Nhân AI cho phép cả role 'staff' và có vùng nút chấm công ở nhà
    assert 'data-tab="ai-agent" data-role="owner,cashier,accountant,warehouse,staff"' in html
    assert 'id="ai-wfh-checkin-wrap"' in html

    # 3. Bảng lương bỏ nút "Chi tiết công" và "Sửa số", click ô công/phạt mở viewHrmStaffDaysDetail
    render_slice = hrm_js[hrm_js.index("function renderPayrollUI"):hrm_js.index("window.calculateHrmPayroll")]
    assert "Chi tiết công" not in render_slice
    assert "editHrmLine(" not in render_slice
    assert "Sửa số" not in render_slice
    assert "viewHrmStaffDaysDetail(${l.staff_id})" in render_slice

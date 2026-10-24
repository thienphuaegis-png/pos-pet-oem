import pytest
from fastapi.testclient import TestClient
import database
from server import app
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())


def test_staff_dual_purpose_lifecycle():
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM staff WHERE name IN ('NV Thợ Spa 01', 'NV Phụ Kho 02') OR username IN ('thospa01', 'phukho02')")
    conn.commit()
    conn.close()

    # 1. Tạo nhân viên KHÔNG CÓ TÀI KHOẢN (chỉ dùng chấm công & lương)
    r_create1 = client.post("/api/auth/staff", json={
        "name": "NV Thợ Spa 01",
        "employee_code": "SPA01",
        "device_code": "901",
        "phone": "0901111111",
        "commission_rate": 5.0,
        "base_salary": 6000000.0
    })
    assert r_create1.status_code == 200, r_create1.text
    data1 = r_create1.json()
    assert data1["has_account"] is False
    staff_id_1 = data1["id"]

    # 2. Tạo nhân viên thứ hai CŨNG KHÔNG CÓ TÀI KHOẢN (kiểm tra SQLite unique index không bị vấp NULL)
    r_create2 = client.post("/api/auth/staff", json={
        "name": "NV Phụ Kho 02",
        "employee_code": "KHO02",
        "device_code": "902",
        "phone": "0902222222",
        "commission_rate": 0.0,
        "base_salary": 5500000.0
    })
    assert r_create2.status_code == 200, r_create2.text
    staff_id_2 = r_create2.json()["id"]

    # 3. Kiểm tra DB: username và password_hash phải là NULL
    conn = database.get_db()
    s1 = dict(conn.execute("SELECT id, name, username, password_hash, role, employee_code, device_code, base_salary FROM staff WHERE id=?", (staff_id_1,)).fetchone())
    assert s1["username"] is None
    assert s1["password_hash"] is None
    assert s1["role"] == "staff"
    assert s1["device_code"] == "901"
    assert s1["base_salary"] == 6000000.0
    conn.close()

    # 4. Thử đăng nhập bằng nhân viên chưa có tài khoản -> phải bị từ chối 401
    anon_client = TestClient(app)
    r_login_fail = anon_client.post("/api/auth/login", data={"username": "thospa01", "password": "password123"})
    assert r_login_fail.status_code == 401

    # 5. Kiểm tra danh sách /api/staff (dùng cho POS & chấm công)
    r_list = client.get("/api/staff")
    assert r_list.status_code == 200
    staff_items = {s["id"]: s for s in r_list.json()}
    assert staff_id_1 in staff_items
    assert staff_items[staff_id_1]["has_account"] == 0
    assert staff_items[staff_id_1]["name"] == "NV Thợ Spa 01"

    # 6. Reset password khi chưa có tài khoản -> phải báo lỗi 400
    r_reset = client.post(f"/api/auth/staff/{staff_id_1}/reset-password", json={"old_password": "", "new_password": "newpassword123"})
    assert r_reset.status_code == 400
    assert "chưa có tài khoản" in r_reset.json()["detail"]

    # 7. CẤP TÀI KHOẢN SAU NÀY (Promote) cho nhân viên 1
    r_promote = client.put(f"/api/auth/staff/{staff_id_1}", json={
        "username": "thospa01",
        "password": "password123",
        "role": "cashier"
    })
    assert r_promote.status_code == 200, r_promote.text

    # Kiểm tra login thành công với tài khoản vừa cấp
    r_login_ok = anon_client.post("/api/auth/login", data={"username": "thospa01", "password": "password123"})
    assert r_login_ok.status_code == 200, r_login_ok.text
    token_data = r_login_ok.json()
    assert "access_token" in token_data
    assert token_data["user"]["role"] == "cashier"

    # 8. THU HỒI TÀI KHOẢN (Demote về hồ sơ nội bộ)
    r_revoke = client.put(f"/api/auth/staff/{staff_id_1}", json={"revoke_account": True})
    assert r_revoke.status_code == 200, r_revoke.text

    # Kiểm tra DB: bản ghi vẫn tồn tại, nhưng username và password_hash đã về NULL
    conn = database.get_db()
    s1_revoked = dict(conn.execute("SELECT id, name, username, password_hash, role FROM staff WHERE id=?", (staff_id_1,)).fetchone())
    assert s1_revoked["username"] is None
    assert s1_revoked["password_hash"] is None
    assert s1_revoked["role"] == "staff"
    conn.close()

    # Thử đăng nhập lại với token cũ -> phải bị chặn 401 do token_version tăng
    old_token = token_data["access_token"]
    r_me = anon_client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_token}"})
    assert r_me.status_code == 401

    # Cleanup
    conn = database.get_db()
    conn.execute("DELETE FROM staff WHERE id IN (?, ?)", (staff_id_1, staff_id_2))
    conn.commit()
    conn.close()

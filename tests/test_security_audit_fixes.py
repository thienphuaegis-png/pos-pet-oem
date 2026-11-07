import os
import pytest
from fastapi.testclient import TestClient
from database import init_db, get_db
from server import app
from dependencies import get_current_user

init_db()


def test_hrm_quick_account_blocks_owner_role_and_staff_id_1():
    client = TestClient(app)
    # Giả lập user có quyền payroll.manage
    app.dependency_overrides[get_current_user] = lambda: {
        "id": 999,
        "name": "HR Manager",
        "role": "accountant",
        "is_active": 1
    }

    # Đảm bảo có permission payroll.manage
    db = get_db()
    cur = db.cursor()
    cur.execute("INSERT OR REPLACE INTO staff (id, name, username, role, is_active) VALUES (999, 'HR Manager', 'hr_mgr_test', 'accountant', 1)")
    cur.execute("INSERT OR REPLACE INTO staff_permissions (staff_id, perm_key, allowed) VALUES (999, 'payroll.manage', 1)")
    cur.execute("INSERT OR REPLACE INTO staff (id, name, username, role, is_active) VALUES (888, 'Staff Regular', 'staff_reg_test', 'staff', 1)")
    db.commit()
    db.close()

    try:
        # 1. Thử gán role='owner' cho nhân viên thường -> 403
        r1 = client.post("/api/hrm/employees/888/quick-account", json={
            "username": "staff_reg_promoted",
            "password": "password123",
            "role": "owner"
        })
        assert r1.status_code == 403
        assert "Chủ tiệm" in r1.json()["detail"]

        # 2. Thử sửa tài khoản staff_id=1 (Owner tiệm) -> 403
        r2 = client.post("/api/hrm/employees/1/quick-account", json={
            "username": "pwn_owner",
            "password": "password123",
            "role": "cashier"
        })
        assert r2.status_code == 403
        assert "Chủ tiệm" in r2.json()["detail"]

        # 3. Cấp role hợp lệ (cashier) cho nhân viên thường -> 200 OK
        r3 = client.post("/api/hrm/employees/888/quick-account", json={
            "username": "staff_reg_ok",
            "password": "password123",
            "role": "cashier"
        })
        assert r3.status_code == 200
        assert r3.json()["status"] == "ok"
    finally:
        app.dependency_overrides.clear()


def test_hrm_batch_accounts_blocks_owner_role_and_staff_id_1():
    client = TestClient(app)
    app.dependency_overrides[get_current_user] = lambda: {
        "id": 999,
        "name": "HR Manager",
        "role": "accountant",
        "is_active": 1
    }

    try:
        res = client.post("/api/hrm/employees/batch-accounts", json={
            "accounts": [
                {"staff_id": 1, "username": "batch_owner", "password": "password123", "role": "staff"},
                {"staff_id": 888, "username": "batch_888", "password": "password123", "role": "owner"}
            ]
        })
        assert res.status_code == 200
        data = res.json()
        assert len(data["errors"]) >= 2
        assert any("không thể sửa tài khoản Chủ tiệm" in e for e in data["errors"])
        assert any("không thể cấp vai trò Chủ tiệm" in e for e in data["errors"])
        assert data["created_count"] == 0
    finally:
        app.dependency_overrides.clear()


def test_tunnel_register_requires_secret_when_configured(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("BRIDGE_SECRET", "super_secret_test_key_123")

    # 1. Gọi không kèm secret -> 401
    r_unauth = client.post("/api/tunnel/register", json={"tunnel_url": "https://valid.ts.net"})
    assert r_unauth.status_code == 401
    assert "secret" in r_unauth.json()["detail"].lower()

    # 2. Gọi kèm sai secret -> 401
    r_wrong = client.post(
        "/api/tunnel/register",
        json={"tunnel_url": "https://valid.ts.net"},
        headers={"X-Bridge-Secret": "wrong_secret"}
    )
    assert r_wrong.status_code == 401

    # 3. Gọi kèm đúng secret qua header X-Bridge-Secret -> 200
    r_ok1 = client.post(
        "/api/tunnel/register",
        json={"tunnel_url": "https://valid.ts.net"},
        headers={"X-Bridge-Secret": "super_secret_test_key_123"}
    )
    assert r_ok1.status_code == 200
    assert r_ok1.json()["ok"] is True

    # 4. Gọi kèm đúng secret qua Bearer token -> 200
    r_ok2 = client.post(
        "/api/tunnel/register",
        json={"tunnel_url": "https://valid2.ts.net"},
        headers={"Authorization": "Bearer super_secret_test_key_123"}
    )
    assert r_ok2.status_code == 200
    assert r_ok2.json()["ok"] is True


def test_cf_d1_worker_fail_closed_logic_present():
    worker_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cf_d1_worker", "worker.js")
    with open(worker_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Kiểm tra Worker buộc có secret và fail-closed
    assert "CF_D1_WORKER_SECRET is not configured on Worker" in content
    assert "Unauthorized D1 Bridge" in content

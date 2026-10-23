import pytest
from fastapi.testclient import TestClient
from server import app
from database import get_db
from tests.auth_helpers import staff_auth_headers

client = TestClient(app)

@pytest.fixture
def target_staff():
    db = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM staff WHERE username = 'staff_assign_test'")
    cur.execute("""
        INSERT INTO staff (name, username, password_hash, role, is_active, ai_api_key, ai_model)
        VALUES ('Nhân Viên Gán Key', 'staff_assign_test', 'hash123', 'cashier', 1, '', 'gemini-2.5-flash')
    """)
    db.commit()
    staff_id = cur.lastrowid
    db.close()
    yield staff_id
    db = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM staff WHERE username = 'staff_assign_test'")
    db.commit()
    db.close()

def test_owner_assign_staff_ai_config(target_staff):
    owner_headers = staff_auth_headers("owner")
    
    # 1. Ban đầu chưa có key riêng
    res = client.get(f"/api/auth/staff/{target_staff}/ai-config", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["has_ai_key"] is False
    assert data["masked_key"] == ""

    # 2. Gán key cá nhân cho nhân viên
    res = client.post(
        f"/api/auth/staff/{target_staff}/ai-config",
        json={"ai_api_key": "AIzaSyCustomKeyAssign12345", "ai_model": "gemini-2.5-flash"},
        headers=owner_headers
    )
    assert res.status_code == 200
    assert res.json()["has_ai_key"] is True

    # 3. Kiểm tra lại sau khi gán
    res = client.get(f"/api/auth/staff/{target_staff}/ai-config", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["has_ai_key"] is True
    assert "AIza" in data["masked_key"]

    # 4. Danh sách staff trả về has_ai_key = 1
    res = client.get("/api/auth/staff", headers=owner_headers)
    assert res.status_code == 200
    staff_row = next(s for s in res.json() if s["id"] == target_staff)
    assert staff_row["has_ai_key"] == 1

    # 5. Xóa key để nhân viên dùng lại key shop
    res = client.post(
        f"/api/auth/staff/{target_staff}/ai-config",
        json={"ai_api_key": "", "ai_model": "gemini-2.5-flash"},
        headers=owner_headers
    )
    assert res.status_code == 200
    assert res.json()["has_ai_key"] is False

import pytest
from fastapi.testclient import TestClient
from server import app
from database import get_db

client = TestClient(app)

def _auth_token(role="owner"):
    from routers.auth import _make_token
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, token_version FROM staff WHERE role=? AND is_active=1 LIMIT 1", (role,))
    r = c.fetchone()
    conn.close()
    if not r:
        return ""
    return _make_token(r["id"], r["token_version"] or 0)

def test_contact_creator_and_phone_dedup():
    token = _auth_token("owner")
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Tạo khách hàng A
    name_a = "Khách Hàng Test Dedup A"
    phone_a = "0981 123 456"
    res1 = client.post("/api/contacts", json={
        "name": name_a,
        "phone": phone_a,
        "type": "customer"
    }, headers=headers)
    assert res1.status_code == 200, res1.text
    cid1 = res1.json()["id"]

    try:
        # Kiểm tra creator_name và created_by trong get_contact
        detail = client.get(f"/api/contacts/{cid1}", headers=headers).json()
        assert detail["created_by"] is not None
        assert "creator_name" in detail
        assert detail["phone"] == "0981123456"

        # 2. Tạo khách hàng B có cùng SĐT (khác định dạng +84) -> phải bị chặn 400
        res2 = client.post("/api/contacts", json={
            "name": "Khách B Khác Tên",
            "phone": "+84981123456",
            "type": "customer"
        }, headers=headers)
        assert res2.status_code == 400
        assert "đã được đăng ký cho" in res2.json()["detail"]

        # 3. Tạo khách hàng C có cùng tên nhưng SĐT khác -> cảnh báo 409
        res3 = client.post("/api/contacts", json={
            "name": name_a,
            "phone": "0989999888",
            "type": "customer"
        }, headers=headers)
        assert res3.status_code == 409
        assert "Trùng tên" in res3.json()["detail"]

        # 4. Tạo lại khách hàng C với allow_duplicate_name: true -> thành công
        res4 = client.post("/api/contacts", json={
            "name": name_a,
            "phone": "0989999888",
            "type": "customer",
            "allow_duplicate_name": True
        }, headers=headers)
        assert res4.status_code == 200
        cid4 = res4.json()["id"]

        # 5. Cập nhật khách C sang SĐT của khách A -> phải bị chặn 400
        res5 = client.put(f"/api/contacts/{cid4}", json={
            "name": name_a,
            "phone": "0981123456"
        }, headers=headers)
        assert res5.status_code == 400
        assert "đã thuộc về" in res5.json()["detail"]

        # Dọn dẹp khách C
        client.delete(f"/api/contacts/{cid4}", headers=headers)

    finally:
        # Dọn dẹp khách A
        client.delete(f"/api/contacts/{cid1}", headers=headers)

import pytest
from fastapi.testclient import TestClient
from database import init_db, get_db
from server import app
from dependencies import get_current_user

init_db()


def test_customer_compact_includes_pets_count_and_names():
    client = TestClient(app)
    app.dependency_overrides[get_current_user] = lambda: {
        "id": 1,
        "name": "Admin Test",
        "role": "owner",
        "is_active": 1,
    }

    conn = get_db()
    cur = conn.cursor()
    # 1. Tạo 2 khách hàng test
    cur.execute("INSERT OR REPLACE INTO contacts (id, name, phone, type) VALUES (88801, 'Khách Có 2 Bé Test', '0988011222', 'customer')")
    cur.execute("INSERT OR REPLACE INTO contacts (id, name, phone, type) VALUES (88802, 'Khách Không Bé Test', '0988022333', 'customer')")

    # 2. Tạo 2 thú cưng cho khách 88801
    cur.execute("INSERT OR REPLACE INTO pets (id, customer_id, name, species, breed) VALUES (77701, 88801, 'Misa Test', 'Chó', 'Poodle')")
    cur.execute("INSERT OR REPLACE INTO pets (id, customer_id, name, species, breed) VALUES (77702, 88801, 'Phóc Test', 'Chó', 'Phốc Sóc')")
    # Đảm bảo khách 88802 không có thú cưng test
    cur.execute("DELETE FROM pets WHERE customer_id = 88802")
    conn.commit()
    conn.close()

    try:
        # Gọi API với compact=1 (API dùng cho ô tìm kiếm Spa/Hotel)
        res = client.get("/api/contacts?type=customer&compact=1&limit=50&search=0988011222")
        assert res.status_code == 200, res.text
        data = res.json()
        assert len(data) >= 1
        c1 = next((c for c in data if c["id"] == 88801), None)
        assert c1 is not None
        assert c1["pets_count"] == 2
        assert "Misa Test" in c1["pet_names"]
        assert "Phóc Test" in c1["pet_names"]

        # Kiểm tra khách không có bé
        res2 = client.get("/api/contacts?type=customer&compact=1&limit=50&search=0988022333")
        assert res2.status_code == 200
        data2 = res2.json()
        c2 = next((c for c in data2 if c["id"] == 88802), None)
        assert c2 is not None
        assert c2["pets_count"] == 0
        assert c2["pet_names"] == ""

    finally:
        app.dependency_overrides.clear()
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM pets WHERE id IN (77701, 77702)")
        cur.execute("DELETE FROM contacts WHERE id IN (88801, 88802)")
        conn.commit()
        conn.close()

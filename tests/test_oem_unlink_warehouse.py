import pytest
from database import get_db, init_db
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)

def test_link_and_unlink_factory_warehouse():
    init_db()
    conn = get_db()
    cur = conn.cursor()

    # Tạo nhà cung cấp và kho mẫu
    cur.execute("INSERT OR REPLACE INTO contacts (id, type, name, phone) VALUES (77701, 'supplier', 'Nhà Máy Test Gỡ Kho', '0999888777')")
    cur.execute("INSERT OR REPLACE INTO warehouses (id, code, name, is_oem, supplier_id) VALUES (77702, 'WH-TEST-UNLINK', 'Kho Xưởng Test Gỡ', 0, NULL)")
    conn.commit()
    conn.close()

    login_res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Gán kho cho nhà máy
    res_link = client.post("/api/oem/factories/link-warehouse", json={"supplier_id": 77701, "warehouse_id": 77702}, headers=headers)
    assert res_link.status_code == 200
    assert res_link.json()["success"] is True

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT supplier_id, is_oem FROM warehouses WHERE id = 77702")
    row = cur.fetchone()
    assert row["supplier_id"] == 77701
    assert row["is_oem"] == 1
    conn.close()

    # 2. Gỡ liên kết kho khỏi nhà máy
    res_unlink = client.post("/api/oem/factories/unlink-warehouse", json={"warehouse_id": 77702}, headers=headers)
    assert res_unlink.status_code == 200
    assert res_unlink.json()["success"] is True

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT supplier_id, is_oem FROM warehouses WHERE id = 77702")
    row = cur.fetchone()
    assert row["supplier_id"] is None
    assert row["is_oem"] == 0

    # Dọn dẹp
    cur.execute("DELETE FROM warehouses WHERE id = 77702")
    cur.execute("DELETE FROM contacts WHERE id = 77701")
    conn.commit()
    conn.close()

import pytest
from database import get_db, init_db
from fastapi.testclient import TestClient
from server import app
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())

def test_oem_order_discount_vnd_and_percent():
    init_db()
    conn = get_db()
    cur = conn.cursor()

    # 1. Tạo đối tác nhà máy & kho xưởng
    cur.execute("INSERT OR REPLACE INTO contacts (id, type, name, phone) VALUES (66601, 'supplier', 'Nhà Máy Test Chiết Khấu', '0911999888')")
    cur.execute("INSERT OR REPLACE INTO warehouses (id, code, name, is_oem, supplier_id) VALUES (66602, 'WH-TEST-OEM-DC', 'Kho Xưởng Test DC', 1, 66601)")
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, is_active) VALUES (66603, 'TEST_SP_OEM', 'Sữa tắm gia công test', 'product', 100000, 20000, 1)")
    conn.commit()
    conn.close()

    login_res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Test tạo đơn OEM với chiết khấu bằng tiền cụ thể (VNĐ)
    # 1000 chai * 20.000 = 20.000.000đ thô. Giảm thẳng 1.000.000đ VNĐ. VAT 8% (+ 1.600.000đ)
    # Thành tiền = (20.000.000 - 1.000.000) + 1.600.000 = 20.600.000đ
    payload_vnd = {
        "partner_id": 66601,
        "oem_warehouse_id": 66602,
        "dest_warehouse_id": 1,
        "fund_source": "COMPANY",
        "vat_percent": 8.0,
        "discount_type": "amount",
        "discount_amount": 1000000,
        "deposit_amount": 10000000,
        "items": [
            {"product_id": 66603, "ordered_qty": 1000, "unit_price": 20000}
        ]
    }

    res = client.post("/api/oem/orders", json=payload_vnd, headers=headers)
    assert res.status_code == 200
    res_json = res.json()
    assert res_json["success"] is True
    order_id = res_json["id"]
    assert res_json["total_final"] == 20600000

    # Lấy thông tin đơn hàng vừa tạo để verify DB
    res_detail = client.get(f"/api/oem/orders/{order_id}")
    assert res_detail.status_code == 200
    order_data = res_detail.json()
    assert order_data["total_raw_amount"] == 20000000
    assert order_data["total_final_amount"] == 20600000
    assert order_data["remaining_payment"] == 10600000
    client.delete(f"/api/oem/orders/{order_id}", headers=headers)

    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM warehouses WHERE id = 66602")
    cur.execute("DELETE FROM contacts WHERE id = 66601")
    cur.execute("DELETE FROM products WHERE id = 66603")
    conn.commit()
    conn.close()

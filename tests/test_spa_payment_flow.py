import pytest
import json
import sqlite3
from fastapi.testclient import TestClient
from server import app
from database import get_db, init_db
from tests.auth_helpers import owner_auth_headers

client = TestClient(app)

def setup_module():
    init_db()

def test_spa_payment_flow_and_inventory_and_wallet():
    headers = owner_auth_headers()

    # 1. Tạo khách hàng có số dư ví Spa 200.000 đ
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO contacts (name, phone, type, spa_wallet_balance) VALUES ('Khách Test Spa Flow', '0912345678', 'customer', 200000)")
    cust_id = cur.lastrowid

    # 2. Tạo 1 sản phẩm bán lẻ trong kho để test trừ kho
    cur.execute("INSERT INTO products (code, name, type, stock, sell_price, cost_price) VALUES ('SP-TEST-KHO', 'Sữa tắm test 500ml', 'product', 10, 50000, 30000)")
    prod_id = cur.lastrowid
    conn.commit()
    conn.close()

    # 3. Tạo phiếu Spa: Dịch vụ 150k + Hàng bán kèm 50k + Tip 20k = 220k. Cọc 50k. Chưa thanh toán.
    services_json = json.dumps([
        {"name": "Combo Tắm Vệ Sinh", "quantity": 1, "price": 150000, "is_retail": False},
        {"product_id": prod_id, "name": "Sữa tắm test 500ml", "quantity": 1, "price": 50000, "is_retail": True},
        {"name": "Tiền tip thợ", "quantity": 1, "price": 20000, "is_tip": True}
    ])

    create_payload = {
        "customer_id": cust_id,
        "pet_name": "Cún Miu",
        "service_type": "Combo Tắm Vệ Sinh",
        "price": 220000,
        "tip_amount": 20000,
        "deposit_amount": 50000,
        "payment_status": "unpaid",
        "payment_method": "wallet",
        "services_json": services_json
    }

    res = client.post("/api/pet-services", json=create_payload, headers=headers)
    assert res.status_code == 200, res.text
    ticket_data = res.json()
    ticket_id = ticket_data["id"]

    # Kiểm tra tồn kho sản phẩm đã bị trừ 1: 10 -> 9
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT stock FROM products WHERE id = ?", (prod_id,))
    assert cur.fetchone()["stock"] == 9

    # Kiểm tra sổ quỹ đã ghi nhận phiếu thu tiền cọc 50k
    cur.execute("SELECT * FROM cashbook WHERE ref_type = 'pet_service_deposit' AND ref_id = ?", (ticket_id,))
    dep_cb = cur.fetchone()
    assert dep_cb is not None
    assert dep_cb["amount"] == 50000
    assert dep_cb["type"] == "in"

    # 4. Thanh toán phiếu bằng ví:
    # Tổng bill 220k - Cọc 50k = Còn 170k cần thanh toán.
    # Phần dịch vụ thuần = 150k. Ví có 200k -> Ví trừ tối đa 150k.
    # Số dư ví còn lại = 200k - 150k = 50k.
    # Tiền mặt ngoài cần thu = 170k - 150k = 20k (tiền hàng kèm hoặc tip vượt ví).
    pay_res = client.post(f"/api/pet-services/{ticket_id}/pay", json={"payment_method": "wallet"}, headers=headers)
    assert pay_res.status_code == 200, pay_res.text
    pay_data = pay_res.json()
    assert pay_data["wallet_deduction"] == 150000
    assert pay_data["cash_collected"] == 20000

    # Kiểm tra số dư ví trong DB
    cur.execute("SELECT spa_wallet_balance FROM contacts WHERE id = ?", (cust_id,))
    assert cur.fetchone()["spa_wallet_balance"] == 50000

    # Kiểm tra sổ quỹ ghi nhận thu ngoài 20k
    cur.execute("SELECT * FROM cashbook WHERE ref_type = 'pet_service' AND ref_id = ?", (ticket_id,))
    pay_cb = cur.fetchone()
    assert pay_cb is not None
    assert pay_cb["amount"] == 20000

    # 5. Xóa phiếu Spa: Phải hoàn ví 150k, hoàn kho sản phẩm từ 9 -> 10, xóa cả 2 phiếu thu trong sổ quỹ
    del_res = client.delete(f"/api/pet-services/{ticket_id}", headers=headers)
    assert del_res.status_code == 200, del_res.text

    # Kiểm tra ví được hoàn về 200k
    cur.execute("SELECT spa_wallet_balance FROM contacts WHERE id = ?", (cust_id,))
    assert cur.fetchone()["spa_wallet_balance"] == 200000

    # Kiểm tra kho hoàn về 10
    cur.execute("SELECT stock FROM products WHERE id = ?", (prod_id,))
    assert cur.fetchone()["stock"] == 10

    # Kiểm tra sạch sổ quỹ
    cur.execute("SELECT COUNT(id) as cnt FROM cashbook WHERE ref_id = ? AND ref_type IN ('pet_service', 'pet_service_deposit')", (ticket_id,))
    assert cur.fetchone()["cnt"] == 0

    conn.close()

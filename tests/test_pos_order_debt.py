import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from routers.auth import _make_token

client = TestClient(app)

def test_pos_debt_order_and_khach_le_validation():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()
        # Tạo staff admin
        cur.execute("INSERT OR REPLACE INTO staff (id, name, role, is_active, token_version) VALUES (9999, 'Admin POS', 'owner', 1, 0)")
        # Tạo khách hàng thật
        cur.execute("INSERT OR REPLACE INTO contacts (id, type, name, phone, debt) VALUES (5555, 'customer', 'Khách VIP Nợ', '0912345678', 0)")
        # Tạo 1 sản phẩm bán
        cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, stock, is_active) VALUES (999, 'SP-TEST-DEBT', 'Sản phẩm Test Nợ', 'product', 200000, 100000, 50, 1)")
        conn.commit()
        conn.close()

        token = _make_token(9999, token_version=0)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Thử tạo đơn khách lẻ (id=1) nhưng thiếu tiền (nợ) -> Bị chặn 400
        res_khach_le = client.post("/api/orders", headers=headers, json={
            "customer_id": 1,
            "staff_id": 9999,
            "paid_amount": 0,
            "discount": 0,
            "shipping_fee": 0,
            "items": [{"product_id": 999, "quantity": 1, "price": 200000, "unit": "cái", "unit_ratio": 1}]
        })
        assert res_khach_le.status_code == 400
        assert "Khách lẻ không thể ghi nợ" in res_khach_le.text

        # 2. Tạo đơn cho khách có tên (id=5555) trả 50k, nợ 150k -> Cho phép thành công
        res_debt = client.post("/api/orders", headers=headers, json={
            "customer_id": 5555,
            "staff_id": 9999,
            "paid_amount": 50000,
            "discount": 0,
            "shipping_fee": 0,
            "items": [{"product_id": 999, "quantity": 1, "price": 200000, "unit": "cái", "unit_ratio": 1}]
        })
        assert res_debt.status_code == 200
        order_code = res_debt.json()["order_code"]

        # Kiểm tra công nợ khách hàng tăng lên 150.000đ
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT debt FROM contacts WHERE id = 5555")
        c_row = cur.fetchone()
        assert c_row["debt"] == 150000

        # Kiểm tra hóa đơn ghi nhận debt_amount = 150.000đ
        cur.execute("SELECT debt_amount, paid_amount, final_amount FROM orders WHERE code = ?", (order_code,))
        ord_row = cur.fetchone()
        assert ord_row["debt_amount"] == 150000
        assert ord_row["paid_amount"] == 50000
        assert ord_row["final_amount"] == 200000
        conn.close()
    finally:
        app.dependency_overrides.update(saved_overrides)

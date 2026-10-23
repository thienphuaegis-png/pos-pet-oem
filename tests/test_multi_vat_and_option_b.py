import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from routers.auth import _make_token

client = TestClient(app)

def test_multi_vat_purchases_and_option_b():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()
        # Admin
        cur.execute("INSERT OR REPLACE INTO staff (id, name, role, is_active, token_version) VALUES (9991, 'Admin PO', 'owner', 1, 0)")
        # Supplier
        cur.execute("INSERT OR REPLACE INTO contacts (id, type, name, phone, debt) VALUES (8881, 'supplier', 'NCC Đa Thuế', '0988888881', 0)")
        # Products
        cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, stock, is_active, vat_rate) VALUES (771, 'SP-VAT-0', 'Sản phẩm 0% VAT', 'product', 100000, 50000, 10, 1, 0.0)")
        cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, stock, is_active, vat_rate) VALUES (772, 'SP-VAT-10', 'Sản phẩm 10% VAT', 'product', 200000, 100000, 10, 1, 10.0)")
        # Ingredient
        cur.execute("INSERT OR REPLACE INTO ingredients (id, code, name, type, unit, vat_rate) VALUES (661, 'NL-VAT-8', 'Nguyên liệu 8% VAT', 'IS_PHYSICAL', 'kg', 8.0)")
        conn.commit()
        conn.close()

        token = _make_token(9991, token_version=0)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Tạo đơn nhập hàng gồm SP1 (0% VAT), SP2 (10% VAT), NL1 (8% VAT)
        # SP1: qty=2, cost=50.000 -> sub=100.000, vat=0
        # SP2: qty=1, cost=100.000 -> sub=100.000, vat=10.000
        # NL1: qty=5, cost=20.000 -> sub=100.000, vat=8.000
        # Subtotal = 300.000, Total VAT = 18.000, Total = 318.000
        res = client.post("/api/purchases", headers=headers, json={
            "supplier_id": 8881,
            "warehouse_id": 1,
            "discount": 0,
            "shipping_fee": 0,
            "other_fee": 0,
            "vat_rate": 0,
            "paid_amount": 0,
            "items": [
                {"item_type": "product", "product_id": 771, "quantity": 2, "cost_price": 50000, "vat_rate": 0.0},
                {"item_type": "product", "product_id": 772, "quantity": 1, "cost_price": 100000, "vat_rate": 10.0},
                {"item_type": "ingredient", "ingredient_id": 661, "quantity": 5, "cost_price": 20000, "vat_rate": 8.0}
            ]
        })
        assert res.status_code == 200, res.text
        code = res.json()["purchase_code"]

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT total_amount, vat_amount, debt_amount FROM purchases WHERE code = ?", (code,))
        p_row = cur.fetchone()
        assert p_row["vat_amount"] == 18000
        assert p_row["total_amount"] == 318000
        assert p_row["debt_amount"] == 318000

        # Kiểm tra purchase_items lưu vat_rate và vat_amount
        cur.execute("SELECT vat_rate, vat_amount FROM purchase_items WHERE purchase_id = (SELECT id FROM purchases WHERE code = ?) ORDER BY id ASC", (code,))
        p_items = cur.fetchall()
        assert p_items[0]["vat_rate"] == 0.0 and p_items[0]["vat_amount"] == 0.0
        assert p_items[1]["vat_rate"] == 10.0 and p_items[1]["vat_amount"] == 10000.0
        assert p_items[2]["vat_rate"] == 8.0 and p_items[2]["vat_amount"] == 8000.0
        conn.close()

        # 2. Xác nhận nhận hàng thực tế (receive_purchase) -> Kiểm tra Phương án B
        # SP2: cost=100.000, vat=10% -> cost_with_vat = 100.000 * 1.10 = 110.000
        # NL1: cost=20.000, vat=8% -> cost_with_vat = 20.000 * 1.08 = 21.600
        res_rec = client.post(f"/api/purchases/{code}/receive", headers=headers, json={"items": []})
        assert res_rec.status_code == 200, res_rec.text

        conn = get_db()
        cur = conn.cursor()
        # Kiểm tra giá vốn kho SP2 được gộp thuế
        cur.execute("SELECT cost_price FROM products WHERE id = 772")
        assert cur.fetchone()["cost_price"] == 110000.0

        # Kiểm tra giá vốn kho NL1 trong price_history được gộp thuế
        cur.execute("SELECT purchase_price FROM price_history WHERE ingredient_id = 661 ORDER BY id DESC LIMIT 1")
        assert cur.fetchone()["purchase_price"] == 21600.0
        conn.close()

    finally:
        app.dependency_overrides.update(saved_overrides)


def test_multi_vat_oem_orders_and_option_b():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO staff (id, name, role, is_active, token_version) VALUES (9992, 'Admin OEM', 'owner', 1, 0)")
        cur.execute("INSERT OR REPLACE INTO contacts (id, type, name, phone, debt) VALUES (8882, 'partner', 'Xưởng OEM Đa Thuế', '0988888882', 0)")
        cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, stock, is_active, vat_rate) VALUES (773, 'SP-OEM-1', 'SP OEM 8%', 'product', 50000, 0, 0, 1, 8.0)")
        cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, stock, is_active, vat_rate) VALUES (774, 'SP-OEM-2', 'SP OEM 10%', 'product', 80000, 0, 0, 1, 10.0)")
        conn.commit()
        conn.close()

        token = _make_token(9992, token_version=0)
        headers = {"Authorization": f"Bearer {token}"}

        # Tạo đơn OEM: SP1 100 cái x 10.000đ (VAT 8% -> 80.000đ)
        # SP2 100 cái x 20.000đ (VAT 10% -> 200.000đ)
        # total_raw = 3.000.000đ, total_vat = 280.000đ, total_final = 3.280.000đ
        res = client.post("/api/oem/orders", headers=headers, json={
            "partner_id": 8882,
            "target_type": "product",
            "oem_warehouse_id": 1,
            "dest_warehouse_id": 1,
            "discount_percent": 0.0,
            "vat_percent": 8.0,
            "deposit_amount": 0,
            "items": [
                {"item_type": "product", "product_id": 773, "ordered_qty": 100, "unit_price": 10000, "vat_rate": 8.0},
                {"item_type": "product", "product_id": 774, "ordered_qty": 100, "unit_price": 20000, "vat_rate": 10.0}
            ]
        })
        assert res.status_code == 200, res.text
        order_id = res.json()["id"]

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT total_raw_amount, vat_amount, total_final_amount FROM oem_orders WHERE id = ?", (order_id,))
        o_row = cur.fetchone()
        assert o_row["total_raw_amount"] == 3000000.0
        assert o_row["vat_amount"] == 280000.0
        assert o_row["total_final_amount"] == 3280000.0

        # Lấy item ids để nhận hàng
        cur.execute("SELECT id, product_id FROM oem_order_items WHERE order_id = ? ORDER BY id ASC", (order_id,))
        items_db = cur.fetchall()
        conn.close()

        # Nhận hàng OEM: Nhận đủ 100 cái cho mỗi item
        # Phương án B: SP1 cost = 10.000 * 1.08 = 10.800
        # SP2 cost = 20.000 * 1.10 = 22.000
        res_rec = client.post(f"/api/oem/orders/{order_id}/receive", headers=headers, json={
            "items": [
                {"item_id": items_db[0]["id"], "received_qty": 100},
                {"item_id": items_db[1]["id"], "received_qty": 100}
            ],
            "pay_remaining_now": False
        })
        assert res_rec.status_code == 200, res_rec.text

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT cost_price FROM products WHERE id = 773")
        assert cur.fetchone()["cost_price"] == 10800.0
        cur.execute("SELECT cost_price FROM products WHERE id = 774")
        assert cur.fetchone()["cost_price"] == 22000.0
        conn.close()

    finally:
        app.dependency_overrides.update(saved_overrides)


def test_multi_vat_pos_retail_orders():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO staff (id, name, role, is_active, token_version) VALUES (9993, 'Admin POS Sell', 'owner', 1, 0)")
        cur.execute("INSERT OR REPLACE INTO contacts (id, type, name, phone, debt) VALUES (8883, 'customer', 'Khách Multi-VAT', '0988888883', 0)")
        cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, stock, is_active, vat_rate) VALUES (775, 'SP-POS-1', 'SP POS 5%', 'product', 100000, 50000, 50, 1, 5.0)")
        cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, stock, is_active, vat_rate) VALUES (776, 'SP-POS-2', 'SP POS 10%', 'product', 200000, 100000, 50, 1, 10.0)")
        conn.commit()
        conn.close()

        token = _make_token(9993, token_version=0)
        headers = {"Authorization": f"Bearer {token}"}

        # Bán 2 cái SP1 (100k, VAT 5% -> 10k VAT) và 1 cái SP2 (200k, VAT 10% -> 20k VAT)
        # Total = 400.000, Discount = 0, VAT = 30.000
        res = client.post("/api/orders", headers=headers, json={
            "customer_id": 8883,
            "staff_id": 9993,
            "paid_amount": 400000,
            "discount": 0,
            "shipping_fee": 0,
            "items": [
                {"product_id": 775, "quantity": 2, "price": 100000, "vat_rate": 5.0},
                {"product_id": 776, "quantity": 1, "price": 200000, "vat_rate": 10.0}
            ]
        })
        assert res.status_code == 200, res.text
        code = res.json()["order_code"]

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT total_amount, final_amount, vat_amount FROM orders WHERE code = ?", (code,))
        ord_row = cur.fetchone()
        assert ord_row["total_amount"] == 400000.0
        assert ord_row["final_amount"] == 400000.0
        assert ord_row["vat_amount"] == 30000.0

        cur.execute("SELECT vat_rate, vat_amount FROM order_items WHERE order_id = (SELECT id FROM orders WHERE code = ?) ORDER BY id ASC", (code,))
        items_db = cur.fetchall()
        assert items_db[0]["vat_rate"] == 5.0 and items_db[0]["vat_amount"] == 10000.0
        assert items_db[1]["vat_rate"] == 10.0 and items_db[1]["vat_amount"] == 20000.0
        conn.close()

    finally:
        app.dependency_overrides.update(saved_overrides)

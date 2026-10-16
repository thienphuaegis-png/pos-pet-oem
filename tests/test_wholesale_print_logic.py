import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from database import init_db, get_db
from fastapi.testclient import TestClient
from server import app
from tests.auth_helpers import owner_auth_headers

init_db()
client = TestClient(app, headers=owner_auth_headers())


def test_wholesale_order_original_price_and_gift():
    conn = get_db()
    cur = conn.cursor()

    # 1. Tạo bảng giá đại lý
    cur.execute("INSERT INTO price_lists (code, name, is_active) VALUES ('BG_DL_TEST', 'Bảng Giá Đại Lý Test', 1)")
    pl_id = cur.lastrowid

    # 2. Tạo phân khúc đại lý gắn bảng giá
    cur.execute("""
        INSERT INTO customer_segments (code, name, price_list_id, is_active)
        VALUES ('PK_DL_TEST', 'Đại Lý Cấp 1', ?, 1)
    """, (pl_id,))
    seg_id = cur.lastrowid

    # 3. Tạo khách hàng đại lý (tên không nhất thiết chứa chữ 'sỉ' hay 'đại lý')
    cur.execute("""
        INSERT INTO contacts (code, name, phone, type, segment_id)
        VALUES ('KH_HIBOSS_TEST', 'HiBoss Pet Shop Test', '0919999888', 'customer', ?)
    """, (seg_id,))
    dl_cust_id = cur.lastrowid

    # 4. Tạo sản phẩm: SP1 (lẻ 95k, sỉ 55k), SP2 (lẻ 150k, sỉ 90k), SP3 hàng tặng (lẻ 50k)
    cur.execute("""
        INSERT INTO products (code, name, type, sell_price, cost_price, stock, unit)
        VALUES ('SP_TEST_P1', 'Chai xịt khử mùi', 'product', 95000, 40000, 100, 'chai')
    """)
    p1_id = cur.lastrowid
    cur.execute("INSERT INTO product_price_list (product_id, price_list_id, price) VALUES (?, ?, 55000)", (p1_id, pl_id))

    cur.execute("""
        INSERT INTO products (code, name, type, sell_price, cost_price, stock, unit)
        VALUES ('SP_TEST_P2', 'Sữa tắm cao cấp', 'product', 150000, 70000, 100, 'chai')
    """)
    p2_id = cur.lastrowid
    cur.execute("INSERT INTO product_price_list (product_id, price_list_id, price) VALUES (?, ?, 90000)", (p2_id, pl_id))

    cur.execute("""
        INSERT INTO products (code, name, type, sell_price, cost_price, stock, unit)
        VALUES ('SP_TEST_P3', 'Khăn lau lông tặng', 'product', 50000, 15000, 100, 'cái')
    """)
    p3_id = cur.lastrowid

    # 5. Tạo đơn hàng Đại lý:
    # - Món 1: 10 chai x 55.000 = 550.000 (đúng giá đại lý)
    # - Món 2: 2 chai x 85.000 = 170.000 (giảm thêm 5k so với giá đại lý 90k)
    # - Món 3: 1 cái x 0đ = 0 (hàng tặng)
    # Tổng tiền hàng: 720.000đ, Giảm bill: 20.000đ, Phải trả: 700.000đ
    ord_code_dl = "TEST_ORD_WHOLESALE_01"
    cur.execute("""
        INSERT INTO orders (code, customer_id, total_amount, discount, final_amount, paid_amount, debt_amount)
        VALUES (?, ?, 720000, 20000, 700000, 700000, 0)
    """, (ord_code_dl, dl_cust_id))
    ord_id_dl = cur.lastrowid

    cur.execute("INSERT INTO order_items (order_id, product_id, quantity, price, subtotal) VALUES (?, ?, 10, 55000, 550000)", (ord_id_dl, p1_id))
    cur.execute("INSERT INTO order_items (order_id, product_id, quantity, price, subtotal) VALUES (?, ?, 2, 85000, 170000)", (ord_id_dl, p2_id))
    cur.execute("INSERT INTO order_items (order_id, product_id, quantity, price, subtotal) VALUES (?, ?, 1, 0, 0)", (ord_id_dl, p3_id))

    conn.commit()
    conn.close()

    try:
        # 6. Gọi GET /api/orders/{code}
        res = client.get(f"/api/orders/{ord_code_dl}")
        assert res.status_code == 200, res.text
        data = res.json()

        assert data["is_wholesale"] is True
        assert data.get("price_list_id") == pl_id
        assert data.get("customer_price_list_name") == "Bảng Giá Đại Lý Test"
        assert len(data["items"]) == 3

        item_map = {it["product_id"]: it for it in data["items"]}

        # Món 1 bán đúng giá đại lý -> original_price bằng đúng giá bán 55k (KHÔNG lấy giá lẻ 95k)
        it1 = item_map[p1_id]
        assert it1["price"] == 55000
        assert it1["original_price"] == 55000, f"Món 1 giá gốc phải là 55k, nhưng ra {it1['original_price']}"
        assert it1["is_gift"] is False

        # Món 2 giảm thêm 5k -> original_price là giá đại lý 90k (chứ không phải giá lẻ 150k)
        it2 = item_map[p2_id]
        assert it2["price"] == 85000
        assert it2["original_price"] == 90000, f"Món 2 giá gốc phải là 90k, nhưng ra {it2['original_price']}"
        assert it2["is_gift"] is False

        # Món 3 hàng tặng 0đ -> original_price là 0 và is_gift là True
        it3 = item_map[p3_id]
        assert it3["price"] == 0
        assert it3["original_price"] == 0
        assert it3["is_gift"] is True

    finally:
        # Cleanup
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM order_items WHERE order_id = ?", (ord_id_dl,))
        cur.execute("DELETE FROM orders WHERE id = ?", (ord_id_dl,))
        cur.execute("DELETE FROM product_price_list WHERE price_list_id = ?", (pl_id,))
        cur.execute("DELETE FROM contacts WHERE id = ?", (dl_cust_id,))
        cur.execute("DELETE FROM customer_segments WHERE id = ?", (seg_id,))
        cur.execute("DELETE FROM price_lists WHERE id = ?", (pl_id,))
        cur.execute("DELETE FROM products WHERE id IN (?, ?, ?)", (p1_id, p2_id, p3_id))
        conn.commit()
        conn.close()


def test_retail_order_keeps_retail_price_for_discount():
    conn = get_db()
    cur = conn.cursor()

    # 1. Tạo khách lẻ không thuộc bảng giá nào
    cur.execute("INSERT INTO contacts (code, name, phone, type, segment_id) VALUES ('KH_LE_TEST', 'Khách Lẻ Test', '0912345678', 'customer', NULL)")
    retail_cust_id = cur.lastrowid

    cur.execute("""
        INSERT INTO products (code, name, type, sell_price, cost_price, stock, unit)
        VALUES ('SP_RETAIL_01', 'Pate cho mèo', 'product', 35000, 18000, 50, 'lon')
    """)
    prod_id = cur.lastrowid

    # 2. Tạo đơn bán lẻ có giảm giá món (bán 30k so với giá lẻ niêm yết 35k)
    ord_code_ret = "TEST_ORD_RETAIL_01"
    cur.execute("""
        INSERT INTO orders (code, customer_id, total_amount, discount, final_amount, paid_amount, debt_amount)
        VALUES (?, ?, 60000, 0, 60000, 60000, 0)
    """, (ord_code_ret, retail_cust_id))
    ord_id_ret = cur.lastrowid

    cur.execute("INSERT INTO order_items (order_id, product_id, quantity, price, subtotal) VALUES (?, ?, 2, 30000, 60000)", (ord_id_ret, prod_id))
    conn.commit()
    conn.close()

    try:
        res = client.get(f"/api/orders/{ord_code_ret}")
        assert res.status_code == 200
        data = res.json()

        assert data["is_wholesale"] is False
        assert data.get("price_list_id") is None
        assert len(data["items"]) == 1

        it = data["items"][0]
        assert it["price"] == 30000
        # Khách lẻ: original_price vẫn là giá bán lẻ niêm yết 35.000 để hiển thị khuyến mãi
        assert it["original_price"] == 35000
    finally:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM order_items WHERE order_id = ?", (ord_id_ret,))
        cur.execute("DELETE FROM orders WHERE id = ?", (ord_id_ret,))
        cur.execute("DELETE FROM contacts WHERE id = ?", (retail_cust_id,))
        cur.execute("DELETE FROM products WHERE id = ?", (prod_id,))
        conn.commit()
        conn.close()


def test_pos_js_wholesale_logic_contract():
    base_dir = os.path.dirname(os.path.dirname(__file__))
    pos_js_path = os.path.join(base_dir, "static", "js", "pos.js")
    with open(pos_js_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Kiểm tra hàm isWholesaleOrder có nhận diện price_list_id
    assert "ord.price_list_id && Number(ord.price_list_id) > 0" in content
    assert "customer_price_list_name" in content

    # Kiểm tra quà tặng không bị tính vào itemDiscountTotal
    assert "const isGift = (Number(it.price) === 0 && Number(it.quantity || 0) > 0);" in content
    assert "!isGift && it.original_price && it.original_price > it.price" in content

import pytest
from fastapi.testclient import TestClient
from server import app
from database import init_db, get_db

client = TestClient(app)

def test_return_tables_exist():
    init_db()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('order_returns', 'order_return_items')")
    tables = {row[0] for row in cur.fetchall()}
    conn.close()
    assert "order_returns" in tables
    assert "order_return_items" in tables

def test_get_returnable_items():
    import time
    init_db()
    conn = get_db()
    cur = conn.cursor()

    ts = int(time.time() * 1000)

    # 1. Setup contact
    cur.execute("INSERT INTO contacts (name, phone, type) VALUES (?, '0901234567', 'customer')", (f"Khách Test Trả Hàng {ts}",))
    customer_id = cur.lastrowid

    # 2. Setup products
    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES (?, 'Thức ăn mèo A', 'product', 60000, 100000, 50)", (f"SP-RET-1-{ts}",))
    p1_id = cur.lastrowid
    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES (?, 'Cát vệ sinh B', 'product', 30000, 50000, 50)", (f"SP-RET-2-{ts}",))
    p2_id = cur.lastrowid

    # 3. Setup order (total 250k, discount 25k, final 225k)
    order_code = f"ORD-RET-{ts}"
    cur.execute("""
        INSERT INTO orders (code, customer_id, total_amount, discount, final_amount, paid_amount, status)
        VALUES (?, ?, 250000, 25000, 225000, 225000, 'completed')
    """, (order_code, customer_id))
    order_id = cur.lastrowid

    # Item 1: 2 * 100k = 200k
    cur.execute("""
        INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
        VALUES (?, ?, 2.0, 100000, 200000)
    """, (order_id, p1_id))
    oi1_id = cur.lastrowid

    # Item 2: 1 * 50k = 50k
    cur.execute("""
        INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
        VALUES (?, ?, 1.0, 50000, 50000)
    """, (order_id, p2_id))
    oi2_id = cur.lastrowid

    # 4. Giả lập Item 1 đã từng trả 0.5 món trước đó
    return_code = f"RET-PREV-{ts}"
    cur.execute("""
        INSERT INTO order_returns (code, original_order_id, customer_id, return_total, diff_amount)
        VALUES (?, ?, ?, 45000, -45000)
    """, (return_code, order_id, customer_id))
    return_id = cur.lastrowid

    cur.execute("""
        INSERT INTO order_return_items (return_id, product_id, original_item_id, quantity, return_price, subtotal)
        VALUES (?, ?, ?, 0.5, 90000, 45000)
    """, (return_id, p1_id, oi1_id))

    conn.commit()
    conn.close()

    # 5. Gọi API GET /api/pos/orders/{code}/returnable-items
    res = client.get(f"/api/pos/orders/{order_code}/returnable-items")
    assert res.status_code == 200
    data = res.json()

    assert data["order_id"] == order_id
    assert data["order_code"] == order_code
    assert data["customer_id"] == customer_id
    assert data["customer_name"] == f"Khách Test Trả Hàng {ts}"
    assert data["total_amount"] == 250000
    assert data["discount"] == 25000
    assert data["final_amount"] == 225000
    assert len(data["items"]) == 2

    # Item 1: mua 2, đã trả 0.5 -> còn 1.5, net price = (200k/250k * 225k) / 2 = 90k
    it1 = next(item for item in data["items"] if item["id"] == oi1_id)
    assert it1["product_name"] == "Thức ăn mèo A"
    assert it1["quantity"] == 2.0
    assert it1["quantity_returned"] == 0.5
    assert it1["quantity_available"] == 1.5
    assert it1["unit_price_net"] == 90000.0

    # Item 2: mua 1, chưa trả -> còn 1, net price = (50k/250k * 225k) / 1 = 45k
    it2 = next(item for item in data["items"] if item["id"] == oi2_id)
    assert it2["product_name"] == "Cát vệ sinh B"
    assert it2["quantity"] == 1.0
    assert it2["quantity_returned"] == 0.0
    assert it2["quantity_available"] == 1.0
    assert it2["unit_price_net"] == 45000.0

    # 6. Test 404 cho đơn không tồn tại
    res_404 = client.get("/api/pos/orders/ORD-NONEXISTENT/returnable-items")
    assert res_404.status_code == 404

    # 7. Test gọi bằng order_id (int dạng string)
    res_by_id = client.get(f"/api/pos/orders/{order_id}/returnable-items")
    assert res_by_id.status_code == 200
    assert res_by_id.json()["order_code"] == order_code

def test_get_returnable_items_no_discount_and_fully_returned():
    import time
    init_db()
    conn = get_db()
    cur = conn.cursor()

    ts = int(time.time() * 1000)
    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES (?, 'Bánh thưởng C', 'product', 20000, 40000, 10)", (f"SP-RET-3-{ts}",))
    p_id = cur.lastrowid

    order_code = f"ORD-NO-DISC-{ts}"
    cur.execute("""
        INSERT INTO orders (code, total_amount, discount, final_amount, paid_amount, status)
        VALUES (?, 80000, 0, 80000, 80000, 'completed')
    """, (order_code,))
    order_id = cur.lastrowid

    cur.execute("""
        INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
        VALUES (?, ?, 2.0, 40000, 80000)
    """, (order_id, p_id))
    oi_id = cur.lastrowid

    # Đã trả hết cả 2 cái
    cur.execute("""
        INSERT INTO order_returns (code, original_order_id, return_total, diff_amount)
        VALUES (?, ?, 80000, -80000)
    """, (f"RET-FULL-{ts}", order_id))
    return_id = cur.lastrowid

    cur.execute("""
        INSERT INTO order_return_items (return_id, product_id, original_item_id, quantity, return_price, subtotal)
        VALUES (?, ?, ?, 2.0, 40000, 80000)
    """, (return_id, p_id, oi_id))

    conn.commit()
    conn.close()

    res = client.get(f"/api/pos/orders/{order_code}/returnable-items")
    assert res.status_code == 200
    item = res.json()["items"][0]
    assert item["quantity"] == 2.0
    assert item["quantity_returned"] == 2.0
    assert item["quantity_available"] == 0.0
    assert item["unit_price_net"] == 40000.0


def test_create_return_only():
    import time
    init_db()
    conn = get_db()
    cur = conn.cursor()

    ts = int(time.time() * 1000)
    cur.execute("INSERT INTO contacts (name, phone, type) VALUES (?, '0909999001', 'customer')", (f"Khách Test Return Only {ts}",))
    customer_id = cur.lastrowid

    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES (?, 'Sữa tắm thú cưng', 'product', 50000, 100000, 10)", (f"SP-RET-ONLY-{ts}",))
    p_id = cur.lastrowid

    order_code = f"ORD-RET-ONLY-{ts}"
    cur.execute("""
        INSERT INTO orders (code, customer_id, total_amount, discount, final_amount, paid_amount, status)
        VALUES (?, ?, 200000, 0, 200000, 200000, 'completed')
    """, (order_code, customer_id))
    order_id = cur.lastrowid

    cur.execute("""
        INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
        VALUES (?, ?, 2.0, 100000, 200000)
    """, (order_id, p_id))
    oi_id = cur.lastrowid
    conn.commit()
    conn.close()

    # 1. Trả 1 sản phẩm: hoàn tiền mặt 100k, hoàn kho
    payload = {
        "original_order_id": order_id,
        "return_items": [
            {
                "product_id": p_id,
                "original_item_id": oi_id,
                "quantity": 1.0,
                "return_price": 100000,
                "return_to_stock": 1,
                "reason": "Khách không thích mùi"
            }
        ],
        "exchange_items": [],
        "refund_method": "cash",
        "note": "Trả hàng lần 1"
    }

    res = client.post("/api/pos/returns", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["success"] is True
    assert data["code"].startswith("RET-")
    assert data["return_total"] == 100000
    assert data["diff_amount"] == -100000

    # Kiểm tra tồn kho đã tăng lại 10 + 1 = 11
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT stock FROM products WHERE id = ?", (p_id,))
    assert cur.fetchone()[0] == 11.0

    # Kiểm tra sinh phiếu chi cashbook 100k
    cur.execute("SELECT type, amount, ref_id FROM cashbook WHERE ref_id = ? AND ref_type = 'order_return' AND type = 'out'", (data["return_id"],))
    cb_row = cur.fetchone()
    assert cb_row is not None
    assert cb_row["amount"] == 100000

    conn.close()

    # 2. Thử trả tiếp 2 cái nữa (vượt quá 1 cái còn khả dụng) -> Chặn 400
    payload_invalid = {
        "original_order_id": order_id,
        "return_items": [
            {
                "product_id": p_id,
                "original_item_id": oi_id,
                "quantity": 2.0,
                "return_price": 100000,
                "return_to_stock": 1
            }
        ],
        "refund_method": "cash"
    }
    res_err = client.post("/api/pos/returns", json=payload_invalid)
    assert res_err.status_code == 400


def test_create_exchange_order():
    import time
    init_db()
    conn = get_db()
    cur = conn.cursor()

    ts = int(time.time() * 1000)
    cur.execute("INSERT INTO contacts (name, phone, type) VALUES (?, '0909999002', 'customer')", (f"Khách Test Exchange {ts}",))
    customer_id = cur.lastrowid

    # Món cũ: giá 100k, kho 10
    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES (?, 'Món Cũ 100k', 'product', 50000, 100000, 10)", (f"SP-OLD-{ts}",))
    p_old_id = cur.lastrowid

    # Món mới: giá 150k, kho 20
    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES (?, 'Món Mới 150k', 'product', 80000, 150000, 20)", (f"SP-NEW-{ts}",))
    p_new_id = cur.lastrowid

    order_code = f"ORD-EXC-{ts}"
    cur.execute("""
        INSERT INTO orders (code, customer_id, total_amount, discount, final_amount, paid_amount, status)
        VALUES (?, ?, 100000, 0, 100000, 100000, 'completed')
    """, (order_code, customer_id))
    order_id = cur.lastrowid

    cur.execute("""
        INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
        VALUES (?, ?, 1.0, 100000, 100000)
    """, (order_id, p_old_id))
    oi_id = cur.lastrowid
    conn.commit()
    conn.close()

    # Đổi: Trả món cũ 100k, lấy món mới 150k -> Thu thêm 50k
    payload = {
        "original_order_id": order_id,
        "return_items": [
            {
                "product_id": p_old_id,
                "original_item_id": oi_id,
                "quantity": 1.0,
                "return_price": 100000,
                "return_to_stock": 1,
                "reason": "Đổi kích cỡ"
            }
        ],
        "exchange_items": [
            {
                "product_id": p_new_id,
                "quantity": 1.0,
                "price": 150000
            }
        ],
        "refund_method": "cash",
        "note": "Khách đổi sang mẫu mới"
    }

    res = client.post("/api/pos/returns", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["success"] is True
    assert data["code"].startswith("RET-")
    assert data["return_total"] == 100000
    assert data["exchange_total"] == 150000
    assert data["diff_amount"] == 50000
    assert data["exchange_order_id"] is not None

    conn = get_db()
    cur = conn.cursor()

    # Kiểm tra kho món cũ tăng (+1 -> 11), món mới giảm (-1 -> 19)
    cur.execute("SELECT stock FROM products WHERE id = ?", (p_old_id,))
    assert cur.fetchone()[0] == 11.0

    cur.execute("SELECT stock FROM products WHERE id = ?", (p_new_id,))
    assert cur.fetchone()[0] == 19.0

    # Kiểm tra tạo đơn hàng mới exchange_order_id
    cur.execute("SELECT code, final_amount, status FROM orders WHERE id = ?", (data["exchange_order_id"],))
    exc_order = cur.fetchone()
    assert exc_order is not None
    assert exc_order["final_amount"] == 150000

    # Kiểm tra phiếu thu cashbook 50k
    cur.execute("SELECT type, amount, ref_id FROM cashbook WHERE ref_id = ? AND ref_type = 'order_return' AND type = 'in'", (data["return_id"],))
    cb_row = cur.fetchone()
    assert cb_row is not None
    assert cb_row["amount"] == 50000

    conn.close()


def test_create_return_edge_cases():
    import time
    init_db()
    conn = get_db()
    cur = conn.cursor()

    ts = int(time.time() * 1000)
    cur.execute("INSERT INTO contacts (name, phone, type, debt, spa_wallet_balance) VALUES (?, '0908888777', 'customer', 200000, 50000)", (f"Khách Edge Case {ts}",))
    customer_id = cur.lastrowid

    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES (?, 'Sản phẩm lỗi', 'product', 30000, 60000, 15)", (f"SP-EDGE-{ts}",))
    p_id = cur.lastrowid

    order_code = f"ORD-EDGE-{ts}"
    cur.execute("""
        INSERT INTO orders (code, customer_id, total_amount, discount, final_amount, paid_amount, status)
        VALUES (?, ?, 120000, 0, 120000, 120000, 'completed')
    """, (order_code, customer_id))
    order_id = cur.lastrowid

    cur.execute("""
        INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
        VALUES (?, ?, 2.0, 60000, 120000)
    """, (order_id, p_id))
    oi_id = cur.lastrowid
    conn.commit()
    conn.close()

    # 1. Trả hàng không hoàn kho (return_to_stock=0), hoàn tiền vào ví (refund_method='wallet')
    payload_wallet = {
        "original_order_id": order_id,
        "return_items": [
            {
                "product_id": p_id,
                "original_item_id": oi_id,
                "quantity": 1.0,
                "return_price": 60000,
                "return_to_stock": 0,
                "reason": "Hàng hỏng vỡ bao bì"
            }
        ],
        "refund_method": "wallet"
    }
    res = client.post("/api/pos/returns", json=payload_wallet)
    assert res.status_code == 200
    data = res.json()
    assert data["diff_amount"] == -60000

    conn = get_db()
    cur = conn.cursor()
    # Tồn kho không đổi: vẫn là 15
    cur.execute("SELECT stock FROM products WHERE id = ?", (p_id,))
    assert cur.fetchone()[0] == 15.0

    # Ví tăng: 50k + 60k = 110k
    cur.execute("SELECT spa_wallet_balance FROM contacts WHERE id = ?", (customer_id,))
    assert cur.fetchone()[0] == 110000.0
    conn.close()

    # 2. Đơn hàng không tồn tại -> 404
    res_404 = client.post("/api/pos/returns", json={"original_order_id": 9999999, "return_items": [{"product_id": p_id, "quantity": 1, "return_price": 60000}]})
    assert res_404.status_code == 404

    # 3. Danh sách rỗng -> 400
    res_empty = client.post("/api/pos/returns", json={"original_order_id": order_id, "return_items": []})
    assert res_empty.status_code == 400


def test_list_returns():
    import time
    from datetime import date
    init_db()
    conn = get_db()
    cur = conn.cursor()

    ts = int(time.time() * 1000)
    cur.execute("INSERT INTO contacts (name, phone, type) VALUES (?, '0911223344', 'customer')", (f"Khách Danh Sách {ts}",))
    customer_id = cur.lastrowid

    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES (?, 'Sản phẩm List 1', 'product', 10000, 20000, 50)", (f"SP-L1-{ts}",))
    p1_id = cur.lastrowid
    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES (?, 'Sản phẩm List 2', 'product', 15000, 30000, 50)", (f"SP-L2-{ts}",))
    p2_id = cur.lastrowid

    order_code_1 = f"ORD-L1-{ts}"
    cur.execute("""
        INSERT INTO orders (code, customer_id, total_amount, discount, final_amount, paid_amount, status)
        VALUES (?, ?, 100000, 0, 100000, 100000, 'completed')
    """, (order_code_1, customer_id))
    order_id_1 = cur.lastrowid

    cur.execute("INSERT INTO order_items (order_id, product_id, quantity, price, subtotal) VALUES (?, ?, 5.0, 20000, 100000)", (order_id_1, p1_id))
    oi1_id = cur.lastrowid

    order_code_2 = f"ORD-L2-{ts}"
    cur.execute("""
        INSERT INTO orders (code, customer_id, total_amount, discount, final_amount, paid_amount, status)
        VALUES (?, ?, 150000, 0, 150000, 150000, 'completed')
    """, (order_code_2, customer_id))
    order_id_2 = cur.lastrowid

    cur.execute("INSERT INTO order_items (order_id, product_id, quantity, price, subtotal) VALUES (?, ?, 5.0, 30000, 150000)", (order_id_2, p2_id))
    oi2_id = cur.lastrowid
    conn.commit()
    conn.close()

    # Tạo 2 phiếu trả
    res1 = client.post("/api/pos/returns", json={
        "original_order_id": order_id_1,
        "return_items": [{"product_id": p1_id, "original_item_id": oi1_id, "quantity": 1.0, "return_price": 20000}],
        "refund_method": "cash",
        "note": f"Phiếu trả 1 {ts}"
    })
    assert res1.status_code == 200
    ret1_code = res1.json()["code"]

    res2 = client.post("/api/pos/returns", json={
        "original_order_id": order_id_2,
        "return_items": [{"product_id": p2_id, "original_item_id": oi2_id, "quantity": 2.0, "return_price": 30000}],
        "refund_method": "cash",
        "note": f"Phiếu trả 2 {ts}"
    })
    assert res2.status_code == 200
    ret2_code = res2.json()["code"]

    # 1. Gọi GET /api/pos/returns không filter
    res_list = client.get("/api/pos/returns")
    assert res_list.status_code == 200
    data = res_list.json()
    assert "total" in data
    assert "returns" in data
    assert data["total"] >= 2
    codes = [r["code"] for r in data["returns"]]
    assert ret1_code in codes
    assert ret2_code in codes

    # Kiểm tra các trường cơ bản của item
    row1 = next(r for r in data["returns"] if r["code"] == ret1_code)
    assert row1["original_order_code"] == order_code_1
    assert row1["customer_name"] == f"Khách Danh Sách {ts}"
    assert row1["return_total"] == 20000
    assert row1["diff_amount"] == -20000

    # 2. Bộ lọc search theo ret1_code
    res_search_code = client.get(f"/api/pos/returns?search={ret1_code}")
    assert res_search_code.status_code == 200
    data_search = res_search_code.json()
    assert data_search["total"] == 1
    assert data_search["returns"][0]["code"] == ret1_code

    # 3. Bộ lọc search theo original_order_code_2
    res_search_order = client.get(f"/api/pos/returns?search={order_code_2}")
    assert res_search_order.status_code == 200
    assert res_search_order.json()["returns"][0]["code"] == ret2_code

    # 4. Bộ lọc ngày
    today_str = date.today().isoformat()
    res_date = client.get(f"/api/pos/returns?from_date={today_str}&to_date={today_str}")
    assert res_date.status_code == 200
    codes_date = [r["code"] for r in res_date.json()["returns"]]
    assert ret1_code in codes_date
    assert ret2_code in codes_date


def test_get_return_detail():
    import time
    init_db()
    conn = get_db()
    cur = conn.cursor()

    ts = int(time.time() * 1000)
    cur.execute("INSERT INTO contacts (name, phone, address, type) VALUES (?, '0988776655', '123 Test Street', 'customer')", (f"Khách Detail {ts}",))
    customer_id = cur.lastrowid

    cur.execute("INSERT INTO products (code, name, unit, type, cost_price, sell_price, stock) VALUES (?, 'Sản phẩm Cũ', 'hộp', 'product', 20000, 50000, 20)", (f"SP-DET-OLD-{ts}",))
    p_old_id = cur.lastrowid
    cur.execute("INSERT INTO products (code, name, unit, type, cost_price, sell_price, stock) VALUES (?, 'Sản phẩm Mới', 'gói', 'product', 30000, 80000, 20)", (f"SP-DET-NEW-{ts}",))
    p_new_id = cur.lastrowid

    order_code = f"ORD-DET-{ts}"
    cur.execute("""
        INSERT INTO orders (code, customer_id, total_amount, discount, final_amount, paid_amount, status)
        VALUES (?, ?, 100000, 0, 100000, 100000, 'completed')
    """, (order_code, customer_id))
    order_id = cur.lastrowid

    cur.execute("INSERT INTO order_items (order_id, product_id, quantity, price, subtotal) VALUES (?, ?, 2.0, 50000, 100000)", (order_id, p_old_id))
    oi_id = cur.lastrowid
    conn.commit()
    conn.close()

    # Tạo phiếu đổi hàng (trả 1 cũ 50k, lấy 1 mới 80k -> bù 30k)
    res_create = client.post("/api/pos/returns", json={
        "original_order_id": order_id,
        "return_items": [{"product_id": p_old_id, "original_item_id": oi_id, "quantity": 1.0, "return_price": 50000, "reason": "Đổi vị khác"}],
        "exchange_items": [{"product_id": p_new_id, "quantity": 1.0, "price": 80000}],
        "refund_method": "cash",
        "note": "Khách đổi vị thức ăn"
    })
    assert res_create.status_code == 200
    create_data = res_create.json()
    ret_code = create_data["code"]
    ret_id = create_data["return_id"]

    # 1. Gọi GET /api/pos/returns/{code}
    res_detail = client.get(f"/api/pos/returns/{ret_code}")
    assert res_detail.status_code == 200
    detail = res_detail.json()

    assert detail["id"] == ret_id
    assert detail["code"] == ret_code
    assert detail["original_order_code"] == order_code
    assert detail["customer_name"] == f"Khách Detail {ts}"
    assert detail["customer_phone"] == "0988776655"
    assert detail["customer_address"] == "123 Test Street"
    assert detail["return_total"] == 50000
    assert detail["exchange_total"] == 80000
    assert detail["diff_amount"] == 30000

    # Kiểm tra return_items
    assert len(detail["return_items"]) == 1
    r_item = detail["return_items"][0]
    assert r_item["product_id"] == p_old_id
    assert r_item["product_name"] == "Sản phẩm Cũ"
    assert r_item["product_code"] == f"SP-DET-OLD-{ts}"
    assert r_item["unit"] == "hộp"
    assert r_item["quantity"] == 1.0
    assert r_item["return_price"] == 50000
    assert r_item["subtotal"] == 50000
    assert r_item["reason"] == "Đổi vị khác"

    # Kiểm tra exchange_items
    assert len(detail["exchange_items"]) == 1
    e_item = detail["exchange_items"][0]
    assert e_item["product_id"] == p_new_id
    assert e_item["product_name"] == "Sản phẩm Mới"
    assert e_item["product_code"] == f"SP-DET-NEW-{ts}"
    assert e_item["unit"] == "gói"
    assert e_item["quantity"] == 1.0
    assert e_item["price"] == 80000
    assert e_item["subtotal"] == 80000

    # 2. Gọi bằng return_id
    res_by_id = client.get(f"/api/pos/returns/{ret_id}")
    assert res_by_id.status_code == 200
    assert res_by_id.json()["code"] == ret_code

    # 3. Mã không tồn tại -> 404
    res_404 = client.get("/api/pos/returns/RET-NONEXISTENT")
    assert res_404.status_code == 404


def test_order_return_frontend_assets():
    with open("templates/index.html", encoding="utf-8") as f:
        html = f.read()

    # Modal markup exists
    assert 'id="modal-order-return-exchange"' in html
    assert 'id="return-modal-order-code"' in html
    assert 'id="return-items-tbody"' in html
    assert 'id="return-modal-refund-total"' in html
    assert 'id="return-search-prod"' in html
    assert 'id="exchange-items-tbody"' in html
    assert 'id="return-modal-exchange-total"' in html
    assert 'id="return-modal-diff-amount"' in html
    assert 'id="return-modal-payment-method"' in html
    assert 'id="btn-submit-order-return"' in html
    assert 'openModalOrderReturnFromView()' in html

    with open("static/js/modules/productions.js", encoding="utf-8") as f:
        js = f.read()

    # Core JS functions exist
    assert "openModalOrderReturn" in js
    assert "openModalOrderReturnFromView" in js
    assert "closeModalOrderReturn" in js
    assert "renderReturnItems" in js
    assert "renderExchangeItems" in js
    assert "updateReturnSummary" in js
    assert "submitOrderReturn" in js
    assert "/api/pos/orders/" in js
    assert "/returnable-items" in js
    assert "/api/pos/returns" in js







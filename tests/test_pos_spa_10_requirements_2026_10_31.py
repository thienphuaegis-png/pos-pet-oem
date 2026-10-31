import json
import time
from fastapi.testclient import TestClient
from database import get_db, init_db
from server import app

client = TestClient(app)


def _owner_headers():
    res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_1_and_2_products_warehouse_stocks_and_exclude_ingredients():
    init_db()
    headers = _owner_headers()
    ts = int(time.time() * 1000)

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO products (code, name, type, stock, sell_price, cost_price, category) VALUES (?, ?, 'product', 15, 90000, 50000, 'Thức ăn')",
        (f"SP-WH-{ts}", f"Hạt Royal Test Kho {ts}"),
    )
    prod_id = cur.lastrowid
    cur.execute(
        "INSERT INTO product_inventory (warehouse_id, product_id, quantity) VALUES (1, ?, 15) ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = 15",
        (prod_id,),
    )
    cur.execute(
        "INSERT INTO products (code, name, type, stock, sell_price, cost_price, category) VALUES (?, ?, 'product', 50, 10000, 5000, 'Nguyên liệu sản xuất')",
        (f"NL-TEST-{ts}", f"Nguyên liệu Can Nhựa {ts}"),
    )
    ing_prod_id = cur.lastrowid
    conn.commit()
    conn.close()

    try:
        res = client.get("/api/products", headers=headers)
        assert res.status_code == 200
        prods = res.json()
        p_match = next((p for p in prods if p["id"] == prod_id), None)
        assert p_match is not None, "Sản phẩm hàng hóa phải có trong /api/products"
        assert "warehouse_stocks" in p_match
        assert isinstance(p_match["warehouse_stocks"], list)
        assert any(w["quantity"] == 15 for w in p_match["warehouse_stocks"])

        ing_match = next((p for p in prods if p["id"] == ing_prod_id), None)
        assert ing_match is None, "Nguyên liệu (NL- / category Nguyên liệu) không được lọt vào /api/products"
    finally:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM product_inventory WHERE product_id IN (?, ?)", (prod_id, ing_prod_id))
        cur.execute("DELETE FROM products WHERE id IN (?, ?)", (prod_id, ing_prod_id))
        conn.commit()
        conn.close()


def test_block_negative_stock_on_pos_order_and_exchange():
    init_db()
    headers = _owner_headers()
    ts = int(time.time() * 1000)

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO products (code, name, type, stock, sell_price, cost_price, category) VALUES (?, ?, 'product', 2, 50000, 30000, 'Phụ kiện')",
        (f"SP-NEG-{ts}", f"Vòng cổ chống bán âm {ts}"),
    )
    prod_id = cur.lastrowid
    conn.commit()
    conn.close()

    try:
        # Bật tùy chọn chặn bán âm
        r_mod = client.post(
            "/api/settings/modules",
            json={"key": "block_negative_stock", "enabled": True},
            headers=headers,
        )
        assert r_mod.status_code == 200

        # Cố tình bán 5 cái khi tồn = 2 -> Phải bị chặn 400
        r_fail = client.post(
            "/api/orders",
            json={
                "customer_id": 1,
                "staff_id": 1,
                "discount": 0,
                "paid_amount": 250000,
                "payment_method": "cash",
                "items": [{"product_id": prod_id, "quantity": 5, "price": 50000}],
            },
            headers=headers,
        )
        assert r_fail.status_code == 400
        assert "chặn bán âm" in r_fail.json()["detail"].lower()

        # Bán đúng 2 cái (tồn = 2) -> Thành công, tồn về 0
        r_ok = client.post(
            "/api/orders",
            json={
                "customer_id": 1,
                "staff_id": 1,
                "discount": 0,
                "paid_amount": 100000,
                "payment_method": "cash",
                "items": [{"product_id": prod_id, "quantity": 2, "price": 50000}],
            },
            headers=headers,
        )
        assert r_ok.status_code == 200, r_ok.text
        order_code = r_ok.json()["order_code"]

        # Kiểm tra /api/products ngay lập tức: tồn phải về 0
        r_prods = client.get("/api/products", headers=headers)
        p_after = next((p for p in r_prods.json() if p["id"] == prod_id), None)
        assert p_after is not None and float(p_after["stock"]) == 0.0

        # Tắt lại chặn bán âm để không ảnh hưởng các test khác
        client.post(
            "/api/settings/modules",
            json={"key": "block_negative_stock", "enabled": False},
            headers=headers,
        )
        client.delete(f"/api/orders/{order_code}", headers=headers)
    finally:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("UPDATE settings SET value = '0' WHERE key = 'block_negative_stock'")
        cur.execute("DELETE FROM products WHERE id = ?", (prod_id,))
        conn.commit()
        conn.close()


def test_spa_wallet_only_applies_to_vip_combos_not_surcharge_not_dye():
    init_db()
    headers = _owner_headers()
    ts = int(time.time() * 1000)

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO contacts (name, phone, type, spa_wallet_balance) VALUES (?, ?, 'customer', 500000)",
        (f"Khách Ví VIP {ts}", f"0919{ts % 1000000:06d}"),
    )
    cid = cur.lastrowid
    conn.commit()
    conn.close()

    try:
        # Bill gồm: Combo Vip 2 (200k) + Nhuộm 1 Màu (250k) + Phụ thu Đánh răng (20k) = 470k
        # Ví có 500k nhưng chỉ được trừ đúng 200k của Combo Vip 2; 270k (Nhuộm + Phụ thu) phải thu ngoài!
        services_list = [
            {"name": "Combo Vip 2", "quantity": 1, "price": 200000, "original_price": 200000},
            {"name": "Nhuộm: 1 Màu (2 Tai + Đuôi)", "quantity": 1, "price": 250000, "original_price": 250000, "is_dye": True},
            {"name": "Đánh răng", "quantity": 1, "price": 20000, "original_price": 20000, "is_surcharge": True},
        ]
        res_create = client.post(
            "/api/pet-services",
            json={
                "customer_id": cid,
                "pet_name": f"Bé Poodle {ts}",
                "service_type": "Combo Vip 2 + Nhuộm: 1 Màu (2 Tai + Đuôi)",
                "dye_package": "Nhuộm: 1 Màu (2 Tai + Đuôi)",
                "price": 470000,
                "surcharge": 20000,
                "payment_status": "unpaid",
                "services_json": json.dumps(services_list, ensure_ascii=False),
            },
            headers=headers,
        )
        assert res_create.status_code == 200, res_create.text
        tid = res_create.json()["id"]

        res_pay = client.post(
            f"/api/pet-services/{tid}/pay",
            json={"payment_method": "wallet", "remainder_method": "cash"},
            headers=headers,
        )
        assert res_pay.status_code == 200, res_pay.text
        pay_body = res_pay.json()
        assert pay_body["wallet_deduction"] == 200000.0, "Chỉ trừ ví 200k gói Combo Vip 2, không trừ nhuộm (250k) và phụ thu đánh răng (20k)"
        assert pay_body["cash_collected"] == 270000.0

        client.delete(f"/api/pet-services/{tid}", headers=headers)
    finally:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM spa_wallet_transactions WHERE contact_id = ?", (cid,))
        cur.execute("DELETE FROM contacts WHERE id = ?", (cid,))
        conn.commit()
        conn.close()


def test_combo_names_and_ui_contracts():
    init_db()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT service_name FROM pet_service_pricing WHERE category = 'Gói Combo Chó'")
    combo_names = {r[0] for r in cur.fetchall()}
    conn.close()
    assert {"Combo Vip 2", "Combo Vip 3", "Combo Super Vip"}.issubset(combo_names)

    with open("templates/index.html", encoding="utf-8") as f:
        html = f.read()
    assert 'input[type="password"]::-ms-reveal' in html
    assert 'onclick="openPOSQuickReturnModal()"' in html
    assert 'id="comp-block-negative-stock"' in html
    assert 'id="comp-code-mode-order"' in html
    assert '>Thanh Toán</th>' in html

    # Kiểm tra sinh mã chứng từ theo quy tắc cài đặt (seq / date_seq / datetime)
    from database import generate_document_code
    conn = get_db()
    cur = conn.cursor()
    c_order = generate_document_code(cur, "order")
    assert c_order.startswith("HD")
    c_spa = generate_document_code(cur, "spa")
    assert c_spa.startswith("GS-")
    conn.close()


def test_spa_category_allow_wallet_toggle_and_defaults():
    init_db()
    headers = _owner_headers()
    ts = int(time.time() * 1000)

    res_cats = client.get("/api/pet-services/categories", headers=headers)
    assert res_cats.status_code == 200
    cats = {c["name"]: c for c in res_cats.json()}
    assert cats["Gói Combo Chó"]["allow_spa_wallet"] == 1
    assert cats["Spa Mèo"]["allow_spa_wallet"] == 1
    assert cats["Dịch Vụ Lẻ Chó"]["allow_spa_wallet"] == 0
    assert cats["Nhuộm Lông"]["allow_spa_wallet"] == 0
    assert cats["Trị Liệu & Phụ Thu"]["allow_spa_wallet"] == 0

    dye_cat_id = cats["Nhuộm Lông"]["id"]

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO contacts (name, phone, type, spa_wallet_balance) VALUES (?, ?, 'customer', 600000)",
        (f"Khách Toggle Nhóm Ví {ts}", f"0929{ts % 1000000:06d}"),
    )
    cid = cur.lastrowid
    conn.commit()
    conn.close()

    try:
        # Bật cho phép trừ Ví Spa cho nhóm 'Nhuộm Lông'
        r_on = client.put(
            f"/api/pet-services/categories/{dye_cat_id}/wallet-toggle",
            json={"allow_spa_wallet": True},
            headers=headers,
        )
        assert r_on.status_code == 200
        assert r_on.json()["allow_spa_wallet"] == 1

        # Khi 'Nhuộm Lông' được bật allow_spa_wallet = 1 -> cả Combo Vip 2 (200k) + Nhuộm 1 Màu (250k) = 450k đều được trừ ví, chỉ Đánh răng (20k) thu ngoài!
        services_list = [
            {"name": "Combo Vip 2", "quantity": 1, "price": 200000, "original_price": 200000},
            {"name": "Nhuộm: 1 Màu (2 Tai + Đuôi)", "quantity": 1, "price": 250000, "original_price": 250000, "is_dye": True},
            {"name": "Đánh răng", "quantity": 1, "price": 20000, "original_price": 20000, "is_surcharge": True},
        ]
        res_create = client.post(
            "/api/pet-services",
            json={
                "customer_id": cid,
                "pet_name": f"Bé Nhuộm {ts}",
                "service_type": "Combo Vip 2 + Nhuộm: 1 Màu (2 Tai + Đuôi)",
                "dye_package": "Nhuộm: 1 Màu (2 Tai + Đuôi)",
                "price": 470000,
                "surcharge": 20000,
                "payment_status": "unpaid",
                "services_json": json.dumps(services_list, ensure_ascii=False),
            },
            headers=headers,
        )
        assert res_create.status_code == 200
        tid = res_create.json()["id"]

        res_pay = client.post(
            f"/api/pet-services/{tid}/pay",
            json={"payment_method": "wallet", "remainder_method": "cash"},
            headers=headers,
        )
        assert res_pay.status_code == 200
        pay_body = res_pay.json()
        assert pay_body["wallet_deduction"] == 450000.0
        assert pay_body["cash_collected"] == 20000.0

        client.delete(f"/api/pet-services/{tid}", headers=headers)
    finally:
        # Trả lại mặc định allow_spa_wallet = 0 cho 'Nhuộm Lông'
        client.put(
            f"/api/pet-services/categories/{dye_cat_id}/wallet-toggle",
            json={"allow_spa_wallet": False},
            headers=headers,
        )
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM spa_wallet_transactions WHERE contact_id = ?", (cid,))
        cur.execute("DELETE FROM contacts WHERE id = ?", (cid,))
        conn.commit()
        conn.close()


def test_cashbook_export_excel_by_date_range():
    init_db()
    headers = _owner_headers()
    res = client.get(
        "/api/cashbook/export-excel?from_date=2026-01-01&to_date=2026-12-31",
        headers=headers,
    )
    assert res.status_code == 200
    assert "spreadsheetml.sheet" in res.headers.get("content-type", "")
    assert len(res.content) > 100


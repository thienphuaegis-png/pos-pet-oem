import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tests"))

from fastapi.testclient import TestClient
from server import app
from database import get_db, init_db
from auth_helpers import owner_auth_headers


def test_product_default_vat_rate_create_and_partial_update():
    init_db()
    client = TestClient(app, headers=owner_auth_headers())

    r_create = client.post("/api/products", json={
        "code": "SP-B2B-VAT8",
        "name": "Nước lau sàn thú cưng 1L",
        "type": "product",
        "cost_price": 60000,
        "sell_price": 150000,
        "unit": "Chai",
        "stock": 50,
        "category": "Vệ sinh",
        "vat_rate": 8.0,
    })
    assert r_create.status_code == 200, r_create.text
    pid = r_create.json()["id"]

    # Partial update không truyền vat_rate phải giữ nguyên 8.0%
    r_upd = client.put(f"/api/products/{pid}", json={"category": "Hóa mỹ phẩm"})
    assert r_upd.status_code == 200, r_upd.text

    r_uni = client.get("/api/inventory/unified")
    assert r_uni.status_code == 200
    uni_payload = r_uni.json()
    uni_items = uni_payload["items"] if isinstance(uni_payload, dict) else uni_payload
    found = [x for x in uni_items if x.get("item_type") == "product" and x.get("id") == pid]
    assert len(found) == 1
    assert float(found[0]["vat_rate"]) == 8.0


def test_b2b_partial_vat_order_cashbook_debt_and_return():
    init_db()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT OR REPLACE INTO contacts (id, type, name, phone, debt) VALUES (8891, 'customer', 'Đại lý Minh Phát', '0909111222', 0)")
    cur.execute("INSERT OR REPLACE INTO payment_accounts (id, code, name, account_type, bank_name, account_number, account_holder, is_active, is_default) VALUES (7791, 'BANK-CTY-VAT', 'TK Cty MB', 'bank', 'MB', '88889999', 'CONG TY MASTERCARE', 1, 1)")
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, stock, is_active, vat_rate) VALUES (781, 'SP-TAX-8', 'Nước lau sàn 1L', 'product', 150000, 60000, 100, 1, 8.0)")
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, stock, is_active, vat_rate) VALUES (782, 'SP-TAX-0', 'Lược chải lông', 'product', 120000, 50000, 100, 1, 0.0)")
    conn.commit()
    conn.close()

    client = TestClient(app, headers=owner_auth_headers())

    # 1. Tick checkbox Tính thuế VAT (add_vat=True): 1 món 8%, 1 món 0%, khách CK đủ 1.580.000đ
    res = client.post("/api/orders", json={
        "customer_id": 8891,
        "staff_id": 1,
        "discount": 0,
        "shipping_fee": 0,
        "paid_amount": 1580000,
        "payment_method": "transfer",
        "account_id": 7791,
        "add_vat": True,
        "items": [
            {"product_id": 781, "quantity": 10, "price": 100000, "vat_rate": 8.0},
            {"product_id": 782, "quantity": 5, "price": 100000, "vat_rate": 0.0},
        ],
    })
    assert res.status_code == 200, res.text
    code = res.json()["order_code"]

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, total_amount, vat_amount, final_amount, paid_amount, debt_amount FROM orders WHERE code = ?", (code,))
    ord_row = cur.fetchone()
    assert ord_row["total_amount"] == 1500000.0
    assert ord_row["vat_amount"] == 80000.0
    assert ord_row["final_amount"] == 1580000.0
    assert ord_row["paid_amount"] == 1580000.0
    assert ord_row["debt_amount"] == 0.0

    # Sổ quỹ thu đủ 1.580.000đ, không cắt cụt mất 80.000đ tiền thuế
    cur.execute("SELECT amount FROM cashbook WHERE ref_type = 'order' AND ref_id = ?", (ord_row["id"],))
    cb_row = cur.fetchone()
    assert cb_row is not None and cb_row["amount"] == 1580000.0
    conn.close()

    # 2. Kiểm tra trả hàng: món chịu thuế 8% được phép hoàn tối đa 108.000đ/chai, món 0% tối đa 100.000đ/cái
    r_ret_info = client.get(f"/api/pos/orders/{code}/returnable-items")
    assert r_ret_info.status_code == 200, r_ret_info.text
    ret_items = {it["product_id"]: it for it in r_ret_info.json()["items"]}
    assert ret_items[781]["unit_price_net"] == 108000.0
    assert ret_items[782]["unit_price_net"] == 100000.0

    r_do_return = client.post("/api/pos/returns", json={
        "original_order_id": ord_row["id"],
        "return_items": [
            {
                "product_id": 781,
                "original_item_id": ret_items[781]["id"],
                "quantity": 2,
                "return_price": 108000,
                "return_to_stock": 1,
                "reason": "Đại lý trả bớt 2 chai",
            }
        ],
        "exchange_items": [],
        "refund_method": "cash",
    })
    assert r_do_return.status_code == 200, r_do_return.text

    # 3. Đơn có giảm giá toàn đơn 10% (150.000đ) + ghi nợ (paid=0)
    res_disc = client.post("/api/orders", json={
        "customer_id": 8891,
        "staff_id": 1,
        "discount": 150000,
        "shipping_fee": 0,
        "paid_amount": 0,
        "add_vat": True,
        "items": [
            {"product_id": 781, "quantity": 10, "price": 100000, "vat_rate": 8.0},
            {"product_id": 782, "quantity": 5, "price": 100000, "vat_rate": 0.0},
        ],
    })
    assert res_disc.status_code == 200, res_disc.text
    code_disc = res_disc.json()["order_code"]
    r_detail = client.get(f"/api/orders/{code_disc}").json()
    assert r_detail["vat_amount"] == 72000.0
    assert r_detail["final_amount"] == 1422000.0
    assert r_detail["debt_amount"] == 1422000.0

    # 4. Kiểm tra GET /api/orders CTE item_count & GET /api/contacts limit
    r_orders = client.get(f"/api/orders?query={code_disc}")
    assert r_orders.status_code == 200
    matched = [o for o in r_orders.json() if o["code"] == code_disc]
    assert len(matched) == 1 and matched[0]["item_count"] == 2

    r_contacts = client.get("/api/contacts?type=customer&compact=1&limit=1")
    assert r_contacts.status_code == 200
    assert len(r_contacts.json()) <= 1


def test_ui_vat_checkbox_and_column_markup():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, "templates", "index.html"), "r", encoding="utf-8") as f:
        idx_html = f.read()
    with open(os.path.join(root, "templates", "pos.html"), "r", encoding="utf-8") as f:
        pos_html = f.read()
    with open(os.path.join(root, "static", "js", "pos.js"), "r", encoding="utf-8") as f:
        pos_js = f.read()

    assert 'id="chk-pos-enable-vat"' in idx_html
    assert 'id="chk-pos-enable-vat"' in pos_html
    assert 'vat-col' in idx_html and 'vat-col' in pos_html
    assert 'function togglePosVatMode(' in pos_js
    assert 'function updateCartItemVatRate(' in pos_js
    assert 'Thuế GTGT (VAT):' in pos_js

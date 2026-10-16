import pytest
import shutil
import os
from fastapi.testclient import TestClient
from server import app
from database import get_db
from tests.auth_helpers import owner_auth_headers, staff_auth_headers
from routers.auth import _make_token

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_dependency_overrides():
    """Đảm bảo không bị ảnh hưởng bởi dependency_overrides của các file test khác."""
    saved = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(saved)


def test_settings_post_requires_owner():
    """Bug 1.1: Các endpoint POST cài đặt nhạy cảm phải yêu cầu quyền owner."""
    cashier_headers = staff_auth_headers("cashier")
    owner_headers = owner_auth_headers()

    # Cashier thử đổi thông tin công ty -> 403
    res = client.post("/api/settings/company", json={"shop_name": "Hack Shop"}, headers=cashier_headers)
    assert res.status_code == 403

    # Cashier thử đổi mẫu in -> 403
    res = client.post("/api/settings/template", json={"print_blocks_config": "{}"}, headers=cashier_headers)
    assert res.status_code == 403

    # Owner đổi thông tin công ty -> 200
    res = client.post("/api/settings/company", json={"shop_name": "MasterCare POS", "shop_phone": "0901234567"}, headers=owner_headers)
    assert res.status_code == 200


def test_pos_return_price_cap():
    """Bug 1.3: Giá trả hàng không được vượt quá đơn giá thực mua của món hàng."""
    owner_headers = owner_auth_headers()
    db = get_db()
    cur = db.cursor()

    cur.execute("INSERT INTO products (code, name, sell_price, cost_price, stock, type) VALUES ('TEST_RET_P1', 'Test Return P1', 100000, 50000, 10, 'product')")
    db.commit()
    prod_id = cur.lastrowid

    # Tạo đơn hàng giá 100k, giảm giá 20k -> final 80k
    cur.execute("""
        INSERT INTO orders (code, total_amount, discount, final_amount, paid_amount, status, warehouse_id)
        VALUES ('ORD-TEST-RET-01', 100000, 20000, 80000, 80000, 'completed', 1)
    """)
    db.commit()
    order_id = cur.lastrowid

    cur.execute("""
        INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
        VALUES (?, ?, 1, 100000, 100000)
    """, (order_id, prod_id))
    db.commit()
    oi_id = cur.lastrowid
    db.close()

    # Thử trả với giá 90k (vượt quá 80k thực trả) -> 400
    req_bad = {
        "original_order_id": order_id,
        "return_items": [{
            "original_item_id": oi_id,
            "product_id": prod_id,
            "quantity": 1,
            "return_price": 90000
        }],
        "refund_method": "cash"
    }
    res = client.post("/api/pos/returns", json=req_bad, headers=owner_headers)
    assert res.status_code == 400
    assert "vượt quá đơn giá thực mua" in res.json()["detail"]

    # Trả với đúng giá 80k -> 200
    req_ok = {
        "original_order_id": order_id,
        "return_items": [{
            "original_item_id": oi_id,
            "product_id": prod_id,
            "quantity": 1,
            "return_price": 80000
        }],
        "refund_method": "cash"
    }
    res = client.post("/api/pos/returns", json=req_ok, headers=owner_headers)
    assert res.status_code == 200


def test_bom_get_cost_not_zeroed():
    """Bug 1.6: GET /api/products/{id}/bom không được reset cost_price về 0 nếu SP không có BOM."""
    owner_headers = owner_auth_headers()
    db = get_db()
    cur = db.cursor()

    cur.execute("INSERT INTO products (code, name, sell_price, cost_price, stock, type) VALUES ('TEST_BOM_P2', 'Test BOM P2', 120000, 65000, 5, 'product')")
    db.commit()
    prod_id = cur.lastrowid
    db.close()

    # Gọi GET BOM
    res = client.get(f"/api/products/{prod_id}/bom", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["cost_price"] == 65000

    # Kiểm tra DB xem cost_price có bị đè về 0 không
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT cost_price FROM products WHERE id = ?", (prod_id,))
    row = cur.fetchone()
    db.close()
    assert row["cost_price"] == 65000


def test_inventory_adjust_schema_and_cur_inv():
    """Bug 1.7: Điều chỉnh tồn kho hỗ trợ cả mode add và mode set, không lỗi schema."""
    owner_headers = owner_auth_headers()
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute("INSERT INTO ingredients (code, name, unit, type) VALUES ('ING_TEST_1', 'Ing Test 1', 'cái', 'IS_PHYSICAL')")
        db.commit()
        ing_id = cur.lastrowid
    finally:
        db.close()

    # 1. Mode add (frontend productions.js)
    res = client.post("/api/inventory/adjust", json={
        "warehouse_id": 1,
        "ingredient_id": ing_id,
        "quantity": 15,
        "mode": "add",
        "purchase_price": 30000,
        "note": "Test nhập tay"
    }, headers=owner_headers)
    assert res.status_code == 200

    db = get_db()
    cur = db.cursor()
    try:
        cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = 1 AND ingredient_id = ?", (ing_id,))
        row = cur.fetchone()
        assert row["quantity"] == 15
    finally:
        db.close()

    # 2. Mode set (legacy schema)
    res = client.post("/api/inventory/adjust", json={
        "warehouse_id": 1,
        "ingredient_id": ing_id,
        "new_quantity": 40,
        "reason": "Kiểm kê set số lượng"
    }, headers=owner_headers)
    assert res.status_code == 200

    db = get_db()
    cur = db.cursor()
    try:
        cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = 1 AND ingredient_id = ?", (ing_id,))
        row = cur.fetchone()
        assert row["quantity"] == 40
    finally:
        db.close()


def test_topup_delete_transaction_safeguard():
    """Bug 2.14: Xóa giao dịch topup phải kiểm tra type='topup' và số dư ví khách hàng."""
    owner_headers = owner_auth_headers()
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute("INSERT INTO contacts (name, phone, type, spa_wallet_balance) VALUES ('Khách Topup Test', '0999888777', 'customer', 200000)")
        cid = cur.lastrowid
        # Tạo giao dịch topup 200k
        cur.execute("""
            INSERT INTO spa_wallet_transactions (contact_id, amount, balance_before, balance_after, type, note)
            VALUES (?, 200000, 0, 200000, 'topup', 'Test topup')
        """, (cid,))
        tx_topup_id = cur.lastrowid

        # Tạo giao dịch spend (tiêu ví)
        cur.execute("""
            INSERT INTO spa_wallet_transactions (contact_id, amount, balance_before, balance_after, type, note)
            VALUES (?, 50000, 200000, 150000, 'spend', 'Test spend')
        """, (cid,))
        tx_spend_id = cur.lastrowid
        db.commit()
    finally:
        db.close()

    # 1. Thử xóa giao dịch spend -> 400 (chỉ cho phép xóa topup)
    res = client.delete(f"/api/topup/transactions/{tx_spend_id}", headers=owner_headers)
    assert res.status_code == 400
    assert "loại nạp ví" in res.json()["detail"]

    # 2. Khách tiêu hết tiền, ví còn 50k
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute("UPDATE contacts SET spa_wallet_balance = 50000 WHERE id = ?", (cid,))
        db.commit()
    finally:
        db.close()

    # Thử xóa giao dịch nạp 200k khi ví chỉ còn 50k -> 400
    res = client.delete(f"/api/topup/transactions/{tx_topup_id}", headers=owner_headers)
    assert res.status_code == 400
    assert "không đủ để hoàn tác" in res.json()["detail"]


def test_delete_warehouse_safeguard():
    """Bug 3.8: Không được xóa kho 1 và kho đang còn hàng tồn."""
    owner_headers = owner_auth_headers()

    # 1. Thử xóa kho 1 -> 400
    res = client.delete("/api/warehouses/1", headers=owner_headers)
    assert res.status_code == 400
    assert "mặc định" in res.json()["detail"]

    # 2. Tạo kho mới và thêm tồn kho
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute("INSERT INTO warehouses (name, is_active) VALUES ('Kho Phụ Test', 1)")
        db.commit()
        wh_id = cur.lastrowid

        cur.execute("INSERT INTO product_inventory (warehouse_id, product_id, quantity) VALUES (?, 1, 5)", (wh_id,))
        db.commit()
    finally:
        db.close()

    # Thử xóa kho có tồn kho -> 400
    res = client.delete(f"/api/warehouses/{wh_id}", headers=owner_headers)
    assert res.status_code == 400
    assert "còn hàng tồn kho" in res.json()["detail"]

    # Xóa hết tồn kho và xóa lại -> 200
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute("DELETE FROM product_inventory WHERE warehouse_id = ?", (wh_id,))
        db.commit()
    finally:
        db.close()

    res = client.delete(f"/api/warehouses/{wh_id}", headers=owner_headers)
    assert res.status_code == 200


def test_reset_data_customers_lowercase():
    """Bug 4.4: Reset dữ liệu phải xóa được contacts có type = 'customer' chữ thường."""
    owner_headers = owner_auth_headers()
    db_path = os.environ.get("POS_DB_PATH")
    backup_path = db_path + ".bak_test_reset"
    if db_path and os.path.exists(db_path):
        shutil.copy2(db_path, backup_path)

    try:
        db = get_db()
        cur = db.cursor()
        try:
            cur.execute("INSERT INTO contacts (name, type) VALUES ('Khách Thử Reset', 'customer')")
            cur.execute("INSERT INTO contacts (name, type) VALUES ('Nhà Cung Cấp Giữ Lại', 'supplier')")
            db.commit()
        finally:
            db.close()

        # Gọi reset dữ liệu mode transactions_and_customers
        res = client.post("/api/settings/reset-data", json={
            "mode": "transactions_and_customers",
            "confirm_text": "XOA HET DU LIEU"
        }, headers=owner_headers)
        assert res.status_code == 200

        db = get_db()
        cur = db.cursor()
        try:
            cur.execute("SELECT count(*) FROM contacts WHERE LOWER(type) = 'customer'")
            cust_count = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM contacts WHERE LOWER(type) = 'supplier'")
            supp_count = cur.fetchone()[0]
        finally:
            db.close()

        assert cust_count == 0
        assert supp_count >= 1
    finally:
        if db_path and os.path.exists(backup_path):
            shutil.copy2(backup_path, db_path)
            try:
                os.remove(backup_path)
            except OSError:
                pass


def test_jwt_typ_claim_and_password_validation():
    """Bug 4.5: Refresh token không được dùng thay access token; Mật khẩu mới < 6 ký tự bị từ chối."""
    owner_headers = owner_auth_headers()
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id, token_version FROM staff WHERE role = 'owner' AND is_active = 1 LIMIT 1")
    owner = cur.fetchone()
    db.close()

    # 1. Tạo refresh token và thử gọi API business -> 401
    refresh_tok = _make_token(owner["id"], owner["token_version"] or 0, hours=24*7, typ="refresh")
    bad_headers = {"Authorization": f"Bearer {refresh_tok}"}
    res = client.get("/api/products", headers=bad_headers)
    assert res.status_code == 401
    assert "yêu cầu access token" in res.json()["detail"]

    # 2. Dùng refresh token để đổi access token tại /api/auth/refresh -> 200
    res = client.post("/api/auth/refresh", headers=bad_headers)
    assert res.status_code == 200
    assert "access_token" in res.json()

    # 3. Tạo nhân viên với password < 6 ký tự -> 400
    res = client.post("/api/auth/staff", json={
        "name": "Nhân viên test pass ngắn",
        "username": "test_short_pw",
        "password": "123",
        "role": "cashier"
    }, headers=owner_headers)
    assert res.status_code == 400
    assert "ít nhất 6 ký tự" in res.json()["detail"]

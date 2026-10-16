import pytest
from database import get_db, init_db
from fastapi.testclient import TestClient
from server import app
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())

def test_bulk_product_status_and_delete():
    init_db()
    conn = get_db()
    cur = conn.cursor()

    # 1. Tạo 2 sản phẩm mẫu
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, is_active) VALUES (88801, 'TEST_P1', 'Sản phẩm Test 1', 'product', 100000, 50000, 1)")
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, is_active) VALUES (88802, 'TEST_P2', 'Sản phẩm Test 2', 'product', 120000, 60000, 1)")
    conn.commit()
    conn.close()

    # 2. Test Bulk Status (chuyển sang ngừng kinh doanh)
    res = client.post("/api/products/bulk-status", json={"product_ids": [88801, 88802], "is_active": 0})
    assert res.status_code == 200
    assert res.json()["updated_count"] == 2

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT is_active FROM products WHERE id = 88801")
    assert cur.fetchone()["is_active"] == 0
    conn.close()

    # 3. Test Bulk Delete khi chưa có đơn hàng: Xóa vĩnh viễn
    res_del = client.post("/api/products/bulk-delete", json={"product_ids": [88801, 88802], "force": False})
    assert res_del.status_code == 200
    data = res_del.json()
    assert data["deleted_count"] == 2
    assert data["skipped_has_stock"] == 0

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM products WHERE id IN (88801, 88802)")
    assert cur.fetchone()[0] == 0
    conn.close()

def test_bulk_delete_protects_orders_and_stock():
    init_db()
    conn = get_db()
    cur = conn.cursor()

    # Tạo đơn hàng cha để thỏa mãn Foreign Key
    cur.execute("INSERT OR IGNORE INTO staff (id, name, role) VALUES (999, 'Test Staff', 'owner')")
    cur.execute("INSERT OR REPLACE INTO orders (id, code, staff_id, total_amount, final_amount, paid_amount) VALUES (88800, 'HD_TEST_BULK', 999, 100000, 100000, 100000)")

    # Tạo sản phẩm có hóa đơn cũ
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, is_active, stock) VALUES (88803, 'TEST_P3', 'Sản phẩm Có Đơn', 'product', 100000, 50000, 1, 0)")
    cur.execute("INSERT OR REPLACE INTO order_items (id, order_id, product_id, quantity, price, subtotal) VALUES (88803, 88800, 88803, 1, 100000, 100000)")

    # Tạo sản phẩm còn tồn kho > 0
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, is_active, stock) VALUES (88804, 'TEST_P4', 'Sản phẩm Còn Tồn', 'product', 150000, 80000, 1, 10)")
    conn.commit()
    conn.close()

    res = client.post("/api/products/bulk-delete", json={"product_ids": [88803, 88804], "force": False})
    assert res.status_code == 200
    data = res.json()
    assert data["skipped_has_stock"] == 1  # Sản phẩm 88804 bị bỏ qua vì còn tồn kho
    assert data["inactivated_count"] == 1  # Sản phẩm 88803 chỉ chuyển sang ngừng kinh doanh
    assert data["deleted_count"] == 0

    # Dọn dẹp
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM order_items WHERE id = 88803")
    cur.execute("DELETE FROM orders WHERE id = 88800")
    cur.execute("DELETE FROM products WHERE id IN (88803, 88804)")
    conn.commit()
    conn.close()

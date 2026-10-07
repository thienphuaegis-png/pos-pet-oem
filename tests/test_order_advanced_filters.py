import pytest
from fastapi.testclient import TestClient
from database import init_db, get_db
from server import app
from dependencies import get_current_user

init_db()
app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner", "is_active": 1}
client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_filter_test_data():
    conn = get_db()
    cur = conn.cursor()

    # 1. Tạo 2 sản phẩm test
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, is_active) VALUES (99901, 'FILTER_P1', 'Hạt Cho Chó FilterTest', 'product', 100000, 50000, 1)")
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, is_active) VALUES (99902, 'FILTER_P2', 'Dịch Vụ Tắm Spa FilterTest', 'service', 200000, 0, 1)")

    # 2. Tạo 2 khách hàng test
    cur.execute("INSERT OR REPLACE INTO contacts (id, name, phone, type) VALUES (99911, 'Khách Lọc Đơn A', '0911000111', 'customer')")
    cur.execute("INSERT OR REPLACE INTO contacts (id, name, phone, type) VALUES (99912, 'Khách Lọc Đơn B', '0922000222', 'customer')")

    # 3. Tạo nhân viên test
    cur.execute("INSERT OR REPLACE INTO staff (id, name, username, role, is_active) VALUES (99921, 'Nhân Viên Lọc Đơn 1', 'nv_filter_1', 'cashier', 1)")
    cur.execute("INSERT OR REPLACE INTO staff (id, name, username, role, is_active) VALUES (99922, 'Nhân Viên Lọc Đơn 2', 'nv_filter_2', 'cashier', 1)")

    # 4. Tạo đơn 1: Khách A, Staff 1, chứa P1, trả đủ tiền mặt (debt=0), ngày 2026-10-05
    cur.execute("""
    INSERT OR REPLACE INTO orders (id, code, customer_id, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, created_at)
    VALUES (99931, 'HD_FILTER_01', 99911, 99921, 100000, 0, 100000, 100000, 0, '2026-10-05 10:00:00')
    """)
    cur.execute("INSERT OR REPLACE INTO order_items (order_id, product_id, quantity, price, subtotal) VALUES (99931, 99901, 1, 100000, 100000)")
    cur.execute("INSERT OR REPLACE INTO order_payments (order_id, method, amount) VALUES (99931, 'cash', 100000)")

    # 5. Tạo đơn 2: Khách B, Staff 2, chứa P2, nợ (debt=200000), thanh toán chuyển khoản 0, ngày 2026-10-07
    cur.execute("""
    INSERT OR REPLACE INTO orders (id, code, customer_id, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, created_at)
    VALUES (99932, 'HD_FILTER_02', 99912, 99922, 200000, 0, 200000, 0, 200000, '2026-10-07 14:00:00')
    """)
    cur.execute("INSERT OR REPLACE INTO order_items (order_id, product_id, quantity, price, subtotal) VALUES (99932, 99902, 1, 200000, 200000)")

    conn.commit()
    conn.close()
    yield

    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM order_payments WHERE order_id IN (99931, 99932)")
    cur.execute("DELETE FROM order_items WHERE order_id IN (99931, 99932)")
    cur.execute("DELETE FROM orders WHERE id IN (99931, 99932)")
    cur.execute("DELETE FROM contacts WHERE id IN (99911, 99912)")
    cur.execute("DELETE FROM staff WHERE id IN (99921, 99922)")
    cur.execute("DELETE FROM products WHERE id IN (99901, 99902)")
    conn.commit()
    conn.close()

def test_filter_by_staff():
    # Lọc theo nhân viên 1
    res = client.get("/api/orders?staff_id=99921")
    assert res.status_code == 200
    codes = [o["code"] for o in res.json()]
    assert "HD_FILTER_01" in codes
    assert "HD_FILTER_02" not in codes

def test_filter_by_customer():
    # Lọc theo khách B
    res = client.get("/api/orders?customer_id=99912")
    assert res.status_code == 200
    codes = [o["code"] for o in res.json()]
    assert "HD_FILTER_02" in codes
    assert "HD_FILTER_01" not in codes

def test_filter_by_product_keyword():
    # Lọc theo sản phẩm có chữ 'Hạt Cho Chó'
    res = client.get("/api/orders?product_keyword=H%E1%BA%A1t%20Cho%20Ch%C3%B3")
    assert res.status_code == 200
    codes = [o["code"] for o in res.json()]
    assert "HD_FILTER_01" in codes
    assert "HD_FILTER_02" not in codes

def test_filter_by_payment_method_and_debt():
    # Lọc đơn có nợ
    res_debt = client.get("/api/orders?debt_status=has_debt")
    assert res_debt.status_code == 200
    codes = [o["code"] for o in res_debt.json()]
    assert "HD_FILTER_02" in codes

    # Lọc đơn tiền mặt
    res_cash = client.get("/api/orders?payment_method=cash")
    assert res_cash.status_code == 200
    codes_cash = [o["code"] for o in res_cash.json()]
    assert "HD_FILTER_01" in codes_cash

def test_filter_by_date_range():
    # Lọc ngày 2026-10-07
    res = client.get("/api/orders?from_date=2026-10-07&to_date=2026-10-07")
    assert res.status_code == 200
    codes = [o["code"] for o in res.json()]
    assert "HD_FILTER_02" in codes
    assert "HD_FILTER_01" not in codes

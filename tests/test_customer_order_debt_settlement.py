import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from routers.auth import _make_token

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    init_db()
    conn = get_db()
    cur = conn.cursor()
    # Tạo staff owner test
    cur.execute("INSERT OR REPLACE INTO staff (id, name, role, is_active, token_version) VALUES (9998, 'Owner Test Debt', 'owner', 1, 0)")
    # Dọn dẹp khách hàng test
    cur.execute("DELETE FROM order_payments WHERE order_id IN (SELECT id FROM orders WHERE code LIKE 'TEST_DEBT_%')")
    cur.execute("DELETE FROM cashbook WHERE note LIKE '%TEST_DEBT_%' OR note LIKE '%Khách Test%'")
    cur.execute("DELETE FROM orders WHERE code LIKE 'TEST_DEBT_%'")
    cur.execute("DELETE FROM contacts WHERE phone = '0999888777'")
    conn.commit()
    conn.close()
    yield
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM order_payments WHERE order_id IN (SELECT id FROM orders WHERE code LIKE 'TEST_DEBT_%')")
    cur.execute("DELETE FROM cashbook WHERE note LIKE '%TEST_DEBT_%' OR note LIKE '%Khách Test%'")
    cur.execute("DELETE FROM orders WHERE code LIKE 'TEST_DEBT_%'")
    cur.execute("DELETE FROM contacts WHERE phone = '0999888777'")
    conn.commit()
    conn.close()

def get_auth_headers():
    token = _make_token(9998, token_version=0)
    return {"Authorization": f"Bearer {token}"}

def test_pay_debt_specific_order():
    """Thu nợ chỉ định đúng một hóa đơn: giảm debt_amount, tăng paid_amount, ghi order_payments"""
    conn = get_db()
    cur = conn.cursor()
    # Tạo khách hàng test
    cur.execute("INSERT INTO contacts (type, name, phone, debt) VALUES ('customer', 'Khách Test Đích Danh', '0999888777', 300000)")
    cust_id = cur.lastrowid
    
    # Tạo 2 đơn nợ
    cur.execute("""
        INSERT INTO orders (code, customer_id, total_amount, final_amount, paid_amount, debt_amount, status)
        VALUES ('TEST_DEBT_01', ?, 200000, 200000, 50000, 150000, 'completed')
    """, (cust_id,))
    ord1_id = cur.lastrowid
    
    cur.execute("""
        INSERT INTO orders (code, customer_id, total_amount, final_amount, paid_amount, debt_amount, status)
        VALUES ('TEST_DEBT_02', ?, 150000, 150000, 0, 150000, 'completed')
    """, (cust_id,))
    ord2_id = cur.lastrowid
    conn.commit()
    
    # Lấy tài khoản ngân hàng hoặc tiền mặt
    cur.execute("SELECT id FROM payment_accounts WHERE is_active = 1 LIMIT 1")
    acc_id = cur.fetchone()[0]
    conn.commit()
    conn.close()
    
    # Thu nợ 150.000 đ chỉ định riêng cho đơn 1
    res = client.post(f"/api/contacts/{cust_id}/pay-debt", headers=get_auth_headers(), json={
        "amount": 150000,
        "account_id": acc_id,
        "note": "Thu nợ đơn 1",
        "order_id": ord1_id
    })
    assert res.status_code == 200, res.text
    
    conn = get_db()
    cur = conn.cursor()
    
    # Kiểm tra đơn 1: debt_amount phải về 0, paid_amount tăng lên 200000
    cur.execute("SELECT debt_amount, paid_amount FROM orders WHERE id = ?", (ord1_id,))
    row1 = cur.fetchone()
    assert row1["debt_amount"] == 0, f"Đơn 1 phải hết nợ, thực tế còn: {row1['debt_amount']}"
    assert row1["paid_amount"] == 200000
    
    # Kiểm tra đơn 2: không bị ảnh hưởng, vẫn nợ 150000
    cur.execute("SELECT debt_amount, paid_amount FROM orders WHERE id = ?", (ord2_id,))
    row2 = cur.fetchone()
    assert row2["debt_amount"] == 150000
    
    # Kiểm tra nợ của khách hàng: giảm từ 300k xuống 150k
    cur.execute("SELECT debt FROM contacts WHERE id = ?", (cust_id,))
    assert cur.fetchone()["debt"] == 150000
    
    # Kiểm tra order_payments có ghi nhận khoản thanh toán cho ord1_id
    cur.execute("SELECT amount FROM order_payments WHERE order_id = ?", (ord1_id,))
    pmts = cur.fetchall()
    assert any(p["amount"] == 150000 for p in pmts)
    conn.close()

def test_pay_debt_fifo_multiple_orders():
    """Thu nợ tổng không truyền order_id: tự động cấn trừ theo thứ tự FIFO (đơn cũ trước)"""
    conn = get_db()
    cur = conn.cursor()
    # Tạo khách hàng test
    cur.execute("INSERT INTO contacts (type, name, phone, debt) VALUES ('customer', 'Khách Test FIFO', '0999888777', 300000)")
    cust_id = cur.lastrowid
    
    # Tạo 2 đơn nợ: Đơn 1 nợ 100k, Đơn 2 nợ 200k
    cur.execute("""
        INSERT INTO orders (code, customer_id, total_amount, final_amount, paid_amount, debt_amount, status)
        VALUES ('TEST_DEBT_01', ?, 100000, 100000, 0, 100000, 'completed')
    """, (cust_id,))
    ord1_id = cur.lastrowid
    
    cur.execute("""
        INSERT INTO orders (code, customer_id, total_amount, final_amount, paid_amount, debt_amount, status)
        VALUES ('TEST_DEBT_02', ?, 200000, 200000, 0, 200000, 'completed')
    """, (cust_id,))
    ord2_id = cur.lastrowid
    conn.commit()
    conn.close()
    
    # Thu nợ 150.000 đ không truyền order_id
    res = client.post(f"/api/contacts/{cust_id}/pay-debt", headers=get_auth_headers(), json={
        "amount": 150000,
        "note": "Thu nợ FIFO"
    })
    assert res.status_code == 200, res.text
    
    conn = get_db()
    cur = conn.cursor()
    
    # Đơn 1 (cũ hơn): cấn trừ hết 100k -> debt_amount = 0, paid_amount = 100k
    cur.execute("SELECT debt_amount, paid_amount FROM orders WHERE id = ?", (ord1_id,))
    row1 = cur.fetchone()
    assert row1["debt_amount"] == 0
    assert row1["paid_amount"] == 100000
    
    # Đơn 2 (mới hơn): nhận 50k còn lại -> debt_amount = 150k, paid_amount = 50k
    cur.execute("SELECT debt_amount, paid_amount FROM orders WHERE id = ?", (ord2_id,))
    row2 = cur.fetchone()
    assert row2["debt_amount"] == 150000
    assert row2["paid_amount"] == 50000
    
    # Khách còn nợ 150k
    cur.execute("SELECT debt FROM contacts WHERE id = ?", (cust_id,))
    assert cur.fetchone()["debt"] == 150000
    conn.close()

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from database import init_db, get_db
from routers.shifts import _calc_shift_summary, CloseShiftIn, close_shift

init_db()

def test_calc_shift_summary_and_close():
    db = get_db()
    cur = db.cursor()

    # Tạo ca test
    cur.execute("SELECT id FROM staff LIMIT 1")
    staff_row = cur.fetchone()
    staff_id = staff_row["id"] if staff_row else 1

    cur.execute("""
        INSERT INTO shifts (cashier_id, opening_cash, status)
        VALUES (?, ?, 'open')
    """, (staff_id, 1000000.0))
    shift_id = cur.lastrowid

    # Thêm 1 đơn hàng test gắn shift_id
    cur.execute("""
        INSERT INTO orders (code, customer_id, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, shift_id)
        VALUES ('TEST_ORDER_01', 1, ?, 500000, 50000, 450000, 450000, 0, ?)
    """, (staff_id, shift_id))
    order_id = cur.lastrowid

    # Thêm 1 dòng thu tiền mặt bán hàng
    cur.execute("""
        INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, shift_id)
        VALUES ('TEST_CB_01', 'in', 'Thu tien ban hang', 450000, 1, 'order', ?, 'Thu tiền test', 1, ?)
    """, (order_id, shift_id))

    db.commit()

    # Test summary calculation
    summary = _calc_shift_summary(cur, shift_id)
    assert summary is not None, "Summary không được rỗng"
    assert summary["shift"]["id"] == shift_id
    assert summary["order_stats"]["order_count"] == 1
    assert summary["order_stats"]["total_sales"] == 450000.0
    assert summary["cash_stats"]["cash_sales"] == 450000.0
    # Expected cash: 1.000.000 (đầu ca) + 450.000 (thu bán hàng) = 1.450.000
    assert summary["expected_cash"] == 1450000.0, f"Expected cash sai: {summary['expected_cash']}"

    db.close()

    # Test close shift
    user = {"id": staff_id, "username": "test_cashier", "role": "owner"}
    body = CloseShiftIn(closing_cash=1470000.0, note="Thừa 20k khách cho")
    res = close_shift(shift_id, body, user)

    assert res["expected_cash"] == 1450000.0
    assert res["closing_cash"] == 1470000.0
    assert res["difference"] == 20000.0
    assert res["summary"]["shift"]["status"] == "closed"
    assert res["summary"]["shift"]["note"] == "Thừa 20k khách cho"

    # Cleanup test shift & order
    db = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM cashbook WHERE code='TEST_CB_01'")
    cur.execute("DELETE FROM orders WHERE code='TEST_ORDER_01'")
    cur.execute("DELETE FROM shifts WHERE id=?", (shift_id,))
    db.commit()
    db.close()
    print("✓ Test shift summary & close passed successfully!")

if __name__ == "__main__":
    test_calc_shift_summary_and_close()

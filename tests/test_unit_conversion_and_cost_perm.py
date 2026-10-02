"""Kiểm tra quy đổi đơn vị (1 Thùng = 16 Chai) và quyền ẩn giá vốn.

Chạy: python -m pytest tests/test_unit_conversion_and_cost_perm.py -v
"""
import sys
import os
import sqlite3
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import get_db, init_db
from dependencies import can_view_cost

TEST_PREFIX = "TEST_UNIT_"


def _cleanup():
    conn = get_db()
    cur = conn.cursor()
    cur.execute(f"SELECT id FROM products WHERE code LIKE '{TEST_PREFIX}%'")
    for row in cur.fetchall():
        cur.execute("DELETE FROM item_units WHERE item_type='product' AND item_id=?", (row[0],))
    cur.execute(f"DELETE FROM products WHERE code LIKE '{TEST_PREFIX}%'")
    cur.execute(f"SELECT id FROM staff WHERE name LIKE '{TEST_PREFIX}%'")
    for row in cur.fetchall():
        cur.execute("DELETE FROM staff_permissions WHERE staff_id=?", (row[0],))
    cur.execute(f"DELETE FROM staff WHERE name LIKE '{TEST_PREFIX}%'")
    conn.commit()
    conn.close()


@pytest.fixture(autouse=True)
def setup_test_data():
    init_db()
    _cleanup()
    yield
    _cleanup()


def test_ratio_is_per_item_and_unique_per_unit_name():
    """Mỗi mặt hàng một hệ số riêng; không cho khai trùng tên đơn vị trên cùng mặt hàng."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute(f"INSERT INTO products (code, name, type, cost_price, sell_price, unit) VALUES ('{TEST_PREFIX}A','Dầu cá hồi 100ml','product',30000,45000,'Chai')")
    pid_a = cur.lastrowid
    cur.execute(f"INSERT INTO products (code, name, type, unit) VALUES ('{TEST_PREFIX}B','Dầu cá hồi 50ml','product','Chai')")
    pid_b = cur.lastrowid
    cur.execute("INSERT INTO item_units (item_type, item_id, unit_name, ratio, sell_price) VALUES ('product', ?, 'Thùng', 16, 700000)", (pid_a,))
    cur.execute("INSERT INTO item_units (item_type, item_id, unit_name, ratio) VALUES ('product', ?, 'Thùng', 12)", (pid_b,))
    conn.commit()

    cur.execute("SELECT ratio, sell_price FROM item_units WHERE item_id = ?", (pid_a,))
    row = cur.fetchone()
    assert row["ratio"] == 16
    assert row["sell_price"] == 700000

    cur.execute("SELECT ratio FROM item_units WHERE item_id = ?", (pid_b,))
    assert cur.fetchone()["ratio"] == 12  # Thùng của mặt hàng B khác A

    with pytest.raises(sqlite3.IntegrityError):
        cur.execute("INSERT INTO item_units (item_type, item_id, unit_name, ratio) VALUES ('product', ?, 'Thùng', 24)", (pid_a,))
        conn.commit()
    conn.rollback()
    conn.close()


def test_transaction_tables_have_unit_ratio():
    """purchase_items / order_items phải chốt được hệ số lúc giao dịch."""
    conn = get_db()
    cur = conn.cursor()
    for tbl in ("purchase_items", "order_items"):
        cur.execute(f"PRAGMA table_info({tbl})")
        cols = [c[1] for c in cur.fetchall()]
        assert "unit_ratio" in cols, f"{tbl} thiếu cột unit_ratio"
        assert "unit" in cols, f"{tbl} thiếu cột unit"
    conn.close()


def test_view_cost_permission_defaults():
    """cashier không xem được giá vốn; owner/accountant/warehouse xem được."""
    conn = get_db()
    cur = conn.cursor()
    users = {}
    for role in ("owner", "cashier", "accountant", "warehouse"):
        cur.execute("INSERT INTO staff (name, role, is_active) VALUES (?, ?, 1)", (f"{TEST_PREFIX}{role}", role))
        users[role] = {"id": cur.lastrowid, "role": role}
    conn.commit()
    conn.close()

    assert can_view_cost(users["owner"]) is True
    assert can_view_cost(users["accountant"]) is True
    assert can_view_cost(users["warehouse"]) is True
    assert can_view_cost(users["cashier"]) is False
    assert can_view_cost(None) is False


def test_staff_permission_overrides_role():
    """Override riêng từng nhân viên thắng quyền mặc định của role."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO staff (name, role, is_active) VALUES (?, 'cashier', 1)", (f"{TEST_PREFIX}special",))
    sid = cur.lastrowid
    cur.execute("INSERT INTO staff_permissions (staff_id, perm_key, allowed) VALUES (?, 'inventory.view_cost', 1)", (sid,))
    conn.commit()
    conn.close()

    assert can_view_cost({"id": sid, "role": "cashier"}) is True

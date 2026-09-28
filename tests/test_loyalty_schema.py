import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import sqlite3
import pytest
import os
import database

DB_PATH = database.get_db_path()

@pytest.fixture(scope="module", autouse=True)
def ensure_db():
    database.init_db()

def test_contacts_columns():
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(contacts)")
    cols = {r["name"]: r for r in cur.fetchall()}
    conn.close()

    assert "points" in cols, "Thiếu cột points trong contacts"
    assert "spa_wallet_balance" in cols, "Thiếu cột spa_wallet_balance trong contacts"

def test_customer_segments_columns():
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(customer_segments)")
    cols = {r["name"]: r for r in cur.fetchall()}
    conn.close()

    assert "min_points" in cols, "Thiếu cột min_points trong customer_segments"
    assert "allow_points" in cols, "Thiếu cột allow_points trong customer_segments"
    assert "price_list_id" in cols, "Thiếu cột price_list_id trong customer_segments"

def test_topup_packages_table():
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='topup_packages'")
    assert cur.fetchone() is not None, "Bảng topup_packages chưa tồn tại"

    cur.execute("PRAGMA table_info(topup_packages)")
    cols = [r["name"] for r in cur.fetchall()]
    for col in ["id", "name", "pay_amount", "receive_amount", "is_active", "created_at"]:
        assert col in cols, f"Thiếu cột {col} trong topup_packages"

    cur.execute("SELECT COUNT(*) FROM topup_packages")
    count = cur.fetchone()[0]
    assert count >= 2, f"Cần ít nhất 2 gói topup mẫu, hiện có {count}"
    conn.close()

def test_spa_wallet_transactions_table():
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='spa_wallet_transactions'")
    assert cur.fetchone() is not None, "Bảng spa_wallet_transactions chưa tồn tại"

    cur.execute("PRAGMA table_info(spa_wallet_transactions)")
    cols = [r["name"] for r in cur.fetchall()]
    for col in ["id", "contact_id", "order_id", "package_id", "type", "amount", "balance_before", "balance_after", "note", "created_at"]:
        assert col in cols, f"Thiếu cột {col} trong spa_wallet_transactions"

    # Verify check constraint on type
    with pytest.raises(sqlite3.IntegrityError):
        cur.execute("""
            INSERT INTO spa_wallet_transactions (contact_id, type, amount, balance_before, balance_after)
            VALUES (1, 'invalid_type', 100, 0, 100)
        """)
    conn.rollback()
    conn.close()

def test_promotions_and_items_tables():
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='promotions'")
    assert cur.fetchone() is not None, "Bảng promotions chưa tồn tại"

    cur.execute("PRAGMA table_info(promotions)")
    cols = [r["name"] for r in cur.fetchall()]
    for col in ["id", "code", "name", "start_date", "end_date", "is_active", "created_at"]:
        assert col in cols, f"Thiếu cột {col} trong promotions"

    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='promotion_items'")
    assert cur.fetchone() is not None, "Bảng promotion_items chưa tồn tại"

    cur.execute("PRAGMA table_info(promotion_items)")
    item_cols = [r["name"] for r in cur.fetchall()]
    for col in ["id", "promotion_id", "product_id", "discount_type", "discount_val", "created_at"]:
        assert col in item_cols, f"Thiếu cột {col} trong promotion_items"

    # Verify discount_type CHECK constraint
    with pytest.raises(sqlite3.IntegrityError):
        cur.execute("""
            INSERT INTO promotion_items (promotion_id, product_id, discount_type, discount_val)
            VALUES (1, 1, 'invalid', 10)
        """)
    conn.rollback()
    conn.close()

def test_settings_points_exchange_rate():
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key='points_exchange_rate'")
    row = cur.fetchone()
    assert row is not None, "Thiếu setting points_exchange_rate"
    assert row["value"] == "1000", f"Tỷ lệ điểm phải là 1000, hiện là {row['value']}"
    conn.close()

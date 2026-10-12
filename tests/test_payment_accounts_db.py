import os
import sqlite3

from database import get_db_path

DB_PATH = get_db_path()

def test_payment_accounts_table_and_cashbook_column():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # 1. Check table payment_accounts exists
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='payment_accounts'")
    table = cur.fetchone()
    assert table is not None, "Bảng payment_accounts chưa tồn tại!"
    
    # 2. Check columns in payment_accounts
    cur.execute("PRAGMA table_info(payment_accounts)")
    cols = [r[1] for r in cur.fetchall()]
    for expected_col in ["id", "code", "name", "account_type", "owner_type", "initial_balance", "is_default"]:
        assert expected_col in cols, f"Thiếu cột {expected_col} trong payment_accounts!"
        
    # 3. Check column account_id in cashbook
    cur.execute("PRAGMA table_info(cashbook)")
    cb_cols = [r[1] for r in cur.fetchall()]
    assert "account_id" in cb_cols, "Thiếu cột account_id trong bảng cashbook!"
    
    # 4. Check seed data
    cur.execute("SELECT COUNT(*) FROM payment_accounts")
    count = cur.fetchone()[0]
    assert count >= 3, f"Cần có ít nhất 3 tài khoản mẫu, hiện có {count}"
    
    conn.close()

if __name__ == "__main__":
    test_payment_accounts_table_and_cashbook_column()
    print("ALL TESTS PASSED!")

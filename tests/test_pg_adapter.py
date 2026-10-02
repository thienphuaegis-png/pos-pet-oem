import os
import re
import pytest
from collections.abc import Mapping

# Chỉ test các hàm/lớp adapter thuần (RowWrapper, translate_query) - không kết nối DB thật.
# KHÔNG set DATABASE_URL ở đây: biến môi trường sống suốt process pytest và sẽ
# đẩy mọi test SQLite khác sang Postgres (lỗi relation "sqlite_master" does not exist).
import database

def test_row_wrapper():
    cols = ["id", "Name", "sell_price"]
    vals = (1, "Sữa tắm mèo", 120000.0)
    row = database.RowWrapper(cols, vals)

    # Index access
    assert row[0] == 1
    assert row[1] == "Sữa tắm mèo"
    assert row[2] == 120000.0

    # Name access (case-insensitive)
    assert row["id"] == 1
    assert row["name"] == "Sữa tắm mèo"
    assert row["Name"] == "Sữa tắm mèo"
    assert row["SELL_PRICE"] == 120000.0

    # Dict conversion
    d = dict(row)
    assert d["id"] == 1
    assert d["Name"] == "Sữa tắm mèo"

    # Mapping methods
    assert row.get("name") == "Sữa tắm mèo"
    assert row.get("not_exist", "default") == "default"
    assert "name" in row
    assert len(row) == 3

def test_query_translation():
    # 1. ? to %s
    sql1 = "SELECT * FROM contacts WHERE id = ? AND type = ?"
    t1 = database.translate_query(sql1)
    assert t1 == "SELECT * FROM contacts WHERE id = %s AND type = %s"

    # 2. INSERT OR IGNORE
    sql2 = "INSERT OR IGNORE INTO product_categories (name) VALUES (?)"
    t2 = database.translate_query(sql2)
    assert "ON CONFLICT DO NOTHING" in t2
    assert "INSERT INTO" in t2

    # 3. INSERT OR REPLACE settings
    sql3 = "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
    t3 = database.translate_query(sql3)
    assert "ON CONFLICT" in t3

    # 4. datetime('now', ...)
    sql4 = "SELECT * FROM activity_log WHERE created_at >= datetime('now', '-30 days')"
    t4 = database.translate_query(sql4)
    assert "INTERVAL '30 days'" in t4

def test_live_supabase_db():
    conn = database.get_db()
    cur = conn.cursor()

    # Test basic select with ? param
    cur.execute("SELECT count(*) as cnt FROM products WHERE is_active = ?", (1,))
    row = cur.fetchone()
    assert row is not None
    assert row["cnt"] >= 0
    assert row[0] >= 0

    # Test insert with lastrowid
    cur.execute(
        "INSERT INTO activity_log (staff_name, action, path) VALUES (?, ?, ?)",
        ("Test Worker", "TEST_PING", "/api/test")
    )
    new_id = cur.lastrowid
    assert new_id is not None
    assert new_id > 0
    conn.commit()

    # Verify inserted row
    cur.execute("SELECT staff_name, action FROM activity_log WHERE id = ?", (new_id,))
    item = cur.fetchone()
    assert item["staff_name"] == "Test Worker"
    assert item["action"] == "TEST_PING"

    # Clean up test row
    cur.execute("DELETE FROM activity_log WHERE id = ?", (new_id,))
    conn.commit()
    conn.close()

if __name__ == "__main__":
    test_row_wrapper()
    test_query_translation()
    test_live_supabase_db()
    print("ALL TESTS PASSED!")

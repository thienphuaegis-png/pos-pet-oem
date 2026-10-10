import pytest
import sqlite3
from database import get_db, init_db

def test_promotions_schema_has_buy_x_get_y_columns():
    init_db()
    conn = get_db()
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(promotions)")
    promo_cols = [r["name"] for r in cur.fetchall()]
    assert "type" in promo_cols, "promotions thiếu cột type"

    cur.execute("PRAGMA table_info(promotion_items)")
    item_cols = [r["name"] for r in cur.fetchall()]
    assert "buy_qty" in item_cols, "promotion_items thiếu cột buy_qty"
    assert "gift_product_id" in item_cols, "promotion_items thiếu cột gift_product_id"
    assert "gift_qty" in item_cols, "promotion_items thiếu cột gift_qty"
    assert "is_multiply" in item_cols, "promotion_items thiếu cột is_multiply"
    conn.close()

def test_buy_x_get_y_active_rules_api():
    from routers.promotions import get_active_promotion_rules
    init_db()
    conn = get_db()
    cur = conn.cursor()

    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, stock) VALUES (9991, 'SP-BUY-A', 'Bánh Thưởng A', 'product', 30000, 15000, 100)")
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, stock) VALUES (9992, 'SP-GIFT-B', 'Cây Xúc Xích B', 'product', 5000, 2000, 100)")

    cur.execute("INSERT INTO promotions (code, name, type, is_active) VALUES ('KM-TEST-ACTIVE', 'Mua 10 A Tang 1 B', 'buy_x_get_y', 1)")
    promo_id = cur.lastrowid

    cur.execute("""
        INSERT INTO promotion_items (promotion_id, product_id, discount_type, discount_val, buy_qty, gift_product_id, gift_qty, is_multiply)
        VALUES (?, 9991, 'fixed', 0, 10, 9992, 1, 1)
    """, (promo_id,))
    conn.commit()

    try:
        rules = get_active_promotion_rules()
        match = next((r for r in rules if r["promo_id"] == promo_id), None)
        assert match is not None
        assert match["promo_type"] == "buy_x_get_y"
        assert match["product_id"] == 9991
        assert match["buy_qty"] == 10
        assert match["gift_product_id"] == 9992
        assert match["gift_qty"] == 1
    finally:
        cur.execute("DELETE FROM promotion_items WHERE promotion_id = ?", (promo_id,))
        cur.execute("DELETE FROM promotions WHERE id = ?", (promo_id,))
        cur.execute("DELETE FROM products WHERE id IN (9991, 9992)")
        conn.commit()
        conn.close()
    init_db()
    conn = get_db()
    cur = conn.cursor()

    # Tạo 2 sản phẩm test
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, stock) VALUES (8881, 'SP-BUY-10', 'Pate Gà 85g', 'product', 20000, 12000, 100)")
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, stock) VALUES (8882, 'SP-GIFT-1', 'Cây Xúc Xích Thưởng', 'product', 5000, 2000, 50)")
    conn.commit()

    # Tạo chương trình Mua 10 tặng 1 khác loại
    cur.execute("INSERT INTO promotions (code, name, type, is_active) VALUES ('KM-BUY10-GET1', 'Mua 10 Pate Tặng 1 Xúc Xích', 'buy_x_get_y', 1)")
    promo_id = cur.lastrowid

    cur.execute("""
        INSERT INTO promotion_items (promotion_id, product_id, discount_type, discount_val, buy_qty, gift_product_id, gift_qty, is_multiply)
        VALUES (?, 8881, 'fixed', 0, 10, 8882, 1, 1)
    """, (promo_id,))
    conn.commit()

    # Query kiểm tra
    cur.execute("""
        SELECT p.type, pi.product_id, pi.buy_qty, pi.gift_product_id, pi.gift_qty
        FROM promotions p
        JOIN promotion_items pi ON p.id = pi.promotion_id
        WHERE p.id = ?
    """, (promo_id,))
    row = cur.fetchone()

    assert row is not None
    assert row["type"] == "buy_x_get_y"
    assert row["product_id"] == 8881
    assert row["buy_qty"] == 10
    assert row["gift_product_id"] == 8882
    assert row["gift_qty"] == 1

    # Cleanup
    cur.execute("DELETE FROM promotion_items WHERE promotion_id = ?", (promo_id,))
    cur.execute("DELETE FROM promotions WHERE id = ?", (promo_id,))
    cur.execute("DELETE FROM products WHERE id IN (8881, 8882)")
    conn.commit()
    conn.close()

import os
import json
import pytest

def test_pos_html_has_dynamic_paper_tabs():
    base_dir = os.path.dirname(os.path.dirname(__file__))
    pos_html = os.path.join(base_dir, "templates", "pos.html")
    index_html = os.path.join(base_dir, "templates", "index.html")

    with open(pos_html, "r", encoding="utf-8") as f:
        assert 'id="print-modal-paper-tabs"' in f.read()
    with open(index_html, "r", encoding="utf-8") as f:
        assert 'id="print-modal-paper-tabs"' in f.read()

def test_pos_js_has_two_tier_filter_logic():
    base_dir = os.path.dirname(os.path.dirname(__file__))
    pos_js = os.path.join(base_dir, "static", "js", "pos.js")
    with open(pos_js, "r", encoding="utf-8") as f:
        content = f.read()
    assert "function renderModalPaperFilterTabs" in content
    assert "function selectModalPaperFilter" in content
    assert "p.is_active === false" in content

def test_pos_api_returns_bank_account_info():
    from routers.pos import get_order_detail
    from database import get_db

    # Tạo 1 order test có payment bank
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT OR IGNORE INTO payment_accounts (id, code, name, account_type, bank_name, account_number, account_holder) VALUES (999, 'MB-TEST-BANK', 'MB Pet Care', 'bank', 'MB', '0999888777', 'CHU SHOP TEST')")
    cur.execute("INSERT INTO orders (code, total_amount, final_amount, paid_amount) VALUES ('TEST-ORDER-BANK-1', 100000, 100000, 100000)")
    order_id = cur.lastrowid
    cur.execute("INSERT INTO order_payments (order_id, method, amount, account_id) VALUES (?, 'transfer', 100000, 999)", (order_id,))
    conn.commit()
    conn.close()

    try:
        res = get_order_detail('TEST-ORDER-BANK-1')
        assert res.get("bank_account") is not None
        assert res["bank_account"]["account_number"] == "0999888777"
        assert res["bank_account"]["bank_name"] == "MB"
    finally:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM order_payments WHERE order_id = ?", (order_id,))
        cur.execute("DELETE FROM orders WHERE id = ?", (order_id,))
        conn.commit()
        conn.close()

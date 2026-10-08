import os
import sys
import pytest

BASE_DIR = os.path.dirname(os.path.dirname(__file__))

def test_templates_contain_print_mode_selector():
    index_path = os.path.join(BASE_DIR, "templates", "index.html")
    pos_path = os.path.join(BASE_DIR, "templates", "pos.html")

    with open(index_path, "r", encoding="utf-8") as f:
        index_html = f.read()

    with open(pos_path, "r", encoding="utf-8") as f:
        pos_html = f.read()

    # templates/index.html checks
    assert 'id="print-modal"' in index_html, "index.html must have #print-modal"
    assert 'id="btn-print-modal-k80"' in index_html, "index.html must have #btn-print-modal-k80"
    assert 'id="btn-print-modal-a4"' in index_html, "index.html must have #btn-print-modal-a4"
    assert "switchModalPrintSize('K80')" in index_html, "index.html must call switchModalPrintSize('K80')"
    assert "switchModalPrintSize('A4')" in index_html, "index.html must call switchModalPrintSize('A4')"
    assert "print-mode-selector" in index_html, "index.html must have print-mode-selector container"

    # templates/pos.html checks
    assert 'id="print-modal"' in pos_html, "pos.html must have #print-modal"
    assert 'id="btn-print-modal-k80"' in pos_html, "pos.html must have #btn-print-modal-k80"
    assert 'id="btn-print-modal-a4"' in pos_html, "pos.html must have #btn-print-modal-a4"
    assert "switchModalPrintSize('K80')" in pos_html, "pos.html must call switchModalPrintSize('K80')"
    assert "switchModalPrintSize('A4')" in pos_html, "pos.html must call switchModalPrintSize('A4')"
    assert "print-mode-selector" in pos_html, "pos.html must have print-mode-selector container"


def test_pos_js_print_mode_logic():
    pos_js_path = os.path.join(BASE_DIR, "static", "js", "pos.js")
    with open(pos_js_path, "r", encoding="utf-8") as f:
        pos_js = f.read()

    assert "switchModalPrintSize" in pos_js, "pos.js must define switchModalPrintSize"
    assert "window.switchModalPrintSize" in pos_js, "pos.js must export window.switchModalPrintSize"
    assert "window.currentLoadedPrintOrder" in pos_js, "pos.js must store currentLoadedPrintOrder"
    assert "k80_default" in pos_js or "k80_standard" in pos_js, "pos.js must handle K80 preset"
    assert "a4_b2b" in pos_js, "pos.js must handle A4 preset"
    assert "isWholesaleOrder" in pos_js, "pos.js must define or use isWholesaleOrder"
    assert "bg-sky-600 text-white shadow-xs" in pos_js, "pos.js must set K80 active button style"
    assert "bg-purple-600 text-white shadow-xs" in pos_js, "pos.js must set A4 active button style"


def test_productions_js_print_mode_logic():
    prod_js_path = os.path.join(BASE_DIR, "static", "js", "modules", "productions.js")
    with open(prod_js_path, "r", encoding="utf-8") as f:
        prod_js = f.read()

    assert "currentLoadedPrintOrder" in prod_js, "productions.js must track currentLoadedPrintOrder"
    assert "switchModalPrintSize" in prod_js, "productions.js must support switchModalPrintSize"
    assert "a4_b2b" in prod_js, "productions.js must handle a4_b2b preset"
    assert "k80_default" in prod_js or "k80_standard" in prod_js, "productions.js must handle K80 preset"


def test_orders_api_and_wholesale_recognition():
    sys.path.insert(0, BASE_DIR)
    from database import init_db, get_db
    from fastapi.testclient import TestClient
    from server import app

    init_db()
    client = TestClient(app)

    db = get_db()
    cur = db.cursor()

    cur.execute("SELECT id FROM contacts WHERE phone = '0999888777' LIMIT 1")
    c = cur.fetchone()
    if c:
        contact_id = c["id"]
        cur.execute("UPDATE contacts SET name = 'Đại Lý Pet Shop Ánh Mai' WHERE id = ?", (contact_id,))
    else:
        cur.execute("""
            INSERT INTO contacts (name, phone, type)
            VALUES ('Đại Lý Pet Shop Ánh Mai', '0999888777', 'customer')
        """)
        contact_id = cur.lastrowid

    cur.execute("SELECT id FROM orders WHERE code = 'TEST_ORD_WHOLESALE' LIMIT 1")
    old = cur.fetchone()
    if old:
        cur.execute("DELETE FROM order_items WHERE order_id = ?", (old["id"],))
        cur.execute("DELETE FROM orders WHERE id = ?", (old["id"],))

    cur.execute("""
        INSERT INTO orders (code, customer_id, total_amount, discount, final_amount, paid_amount, debt_amount)
        VALUES ('TEST_ORD_WHOLESALE', ?, 5000000, 200000, 4800000, 4800000, 0)
    """, (contact_id,))
    db.commit()
    db.close()

    res = client.get("/api/orders/TEST_ORD_WHOLESALE")
    assert res.status_code == 200
    ord_data = res.json()
    assert ord_data["code"] == "TEST_ORD_WHOLESALE"
    assert "đại lý" in ord_data["customer_name"].lower()

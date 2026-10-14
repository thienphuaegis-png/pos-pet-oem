import pytest
import re
from bs4 import BeautifulSoup

def test_telegram_subtab_inside_tab_settings():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        html = f.read()

    soup = BeautifulSoup(html, "html.parser")
    tab_settings = soup.find(id="tab-settings")
    assert tab_settings is not None, "Không tìm thấy #tab-settings"

    # Kiểm tra settings-sub-telegram phải nằm BÊN TRONG tab-settings
    tg_sub = tab_settings.find(id="settings-sub-telegram")
    assert tg_sub is not None, "#settings-sub-telegram phải nằm bên trong #tab-settings"

    # Kiểm tra settings-sub-reset-data phải nằm BÊN TRONG tab-settings
    reset_sub = tab_settings.find(id="settings-sub-reset-data")
    assert reset_sub is not None, "#settings-sub-reset-data phải nằm bên trong #tab-settings"

def test_migration_sync_cashbook_for_purchases_and_orders():
    import sqlite3
    from scripts.migrate_cashbook_sync import sync_missing_cashbook_entries

    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Tạo bảng giả lập
    cur.execute("""
    CREATE TABLE purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT,
        supplier_id INTEGER,
        total_amount REAL,
        paid_amount REAL,
        debt_amount REAL,
        fund_source TEXT,
        status TEXT,
        created_at TEXT
    )
    """)
    cur.execute("""
    CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT,
        customer_id INTEGER,
        total_amount REAL,
        paid_amount REAL,
        debt_amount REAL,
        status TEXT,
        created_at TEXT
    )
    """)
    cur.execute("""
    CREATE TABLE cashbook (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        type TEXT,
        category TEXT,
        amount REAL,
        contact_id INTEGER,
        ref_type TEXT,
        ref_id INTEGER,
        fund_source TEXT,
        note TEXT,
        account_id INTEGER,
        created_at TEXT
    )
    """)
    cur.execute("""
    CREATE TABLE payment_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        owner_type TEXT,
        is_default INTEGER,
        is_active INTEGER
    )
    """)
    cur.execute("INSERT INTO payment_accounts (name, owner_type, is_default, is_active) VALUES ('Tiền mặt cá nhân', 'PERSONAL', 1, 1)")
    cur.execute("INSERT INTO payment_accounts (name, owner_type, is_default, is_active) VALUES ('Tiền mặt công ty', 'COMPANY', 1, 1)")

    # Insert test data: 2 purchases (1 có cashbook, 1 chưa), 2 orders (1 có cashbook, 1 chưa)
    cur.execute("INSERT INTO purchases (code, supplier_id, total_amount, paid_amount, debt_amount, fund_source, status, created_at) VALUES ('PN001', 10, 5000000, 3000000, 2000000, 'PERSONAL', 'received', '2026-10-01 10:00:00')")
    p1_id = cur.lastrowid
    cur.execute("INSERT INTO purchases (code, supplier_id, total_amount, paid_amount, debt_amount, fund_source, status, created_at) VALUES ('PN002', 11, 4000000, 4000000, 0, 'COMPANY', 'received', '2026-10-02 11:00:00')")
    p2_id = cur.lastrowid
    # Đã có cashbook cho p1
    cur.execute("INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, fund_source, created_at) VALUES ('PC-TEST-001', 'out', 'Chi tiền nhập hàng', 3000000, 10, 'purchase', ?, 'PERSONAL', '2026-10-01 10:00:00')", (p1_id,))

    # Orders
    cur.execute("INSERT INTO orders (code, customer_id, total_amount, paid_amount, debt_amount, status, created_at) VALUES ('HD001', 20, 200000, 200000, 0, 'completed', '2026-10-03 14:00:00')")
    o1_id = cur.lastrowid
    cur.execute("INSERT INTO orders (code, customer_id, total_amount, paid_amount, debt_amount, status, created_at) VALUES ('HD002', 21, 500000, 500000, 0, 'completed', '2026-10-04 15:00:00')")
    o2_id = cur.lastrowid
    # Đã có cashbook cho o1
    cur.execute("INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, fund_source, created_at) VALUES ('PT-TEST-001', 'in', 'Thu tien ban hang', 200000, 20, 'order', ?, 'COMPANY', '2026-10-03 14:00:00')", (o1_id,))

    conn.commit()

    # Chạy migration lần 1
    stats = sync_missing_cashbook_entries(conn)
    assert stats["purchases_synced"] == 1, f"Expected 1 purchase synced, got {stats['purchases_synced']}"
    assert stats["orders_synced"] == 1, f"Expected 1 order synced, got {stats['orders_synced']}"

    # Kiểm tra cashbook cho p2
    cur.execute("SELECT * FROM cashbook WHERE ref_type = 'purchase' AND ref_id = ?", (p2_id,))
    cb_p2 = cur.fetchone()
    assert cb_p2 is not None
    assert cb_p2["amount"] == 4000000
    assert cb_p2["type"] == "out"
    assert cb_p2["fund_source"] == "COMPANY"

    # Kiểm tra cashbook cho o2
    cur.execute("SELECT * FROM cashbook WHERE ref_type = 'order' AND ref_id = ?", (o2_id,))
    cb_o2 = cur.fetchone()
    assert cb_o2 is not None
    assert cb_o2["amount"] == 500000
    assert cb_o2["type"] == "in"

    # Chạy lần 2 (idempotent)
    stats2 = sync_missing_cashbook_entries(conn)
    assert stats2["purchases_synced"] == 0
    assert stats2["orders_synced"] == 0

def test_create_purchase_generates_cashbook_and_pay_api():
    from fastapi.testclient import TestClient
    from server import app
    from database import get_db
    from dependencies import get_current_user

    mock_user = {"id": 1, "name": "Admin Test", "role": "owner", "is_active": 1}
    app.dependency_overrides[get_current_user] = lambda: mock_user

    client = TestClient(app)

    # Lấy thông tin 1 supplier và 1 product hoặc warehouse
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM contacts WHERE type = 'supplier' LIMIT 1")
    s_row = cur.fetchone()
    supplier_id = s_row[0] if s_row else 1

    cur.execute("SELECT id FROM products LIMIT 1")
    p_row = cur.fetchone()
    product_id = p_row[0] if p_row else 1
    conn.close()

    # 1. Tạo phiếu nhập có trả trước 1 phần
    payload = {
        "supplier_id": supplier_id,
        "warehouse_id": 1,
        "fund_source": "PERSONAL",
        "paid_amount": 100000,
        "discount": 0,
        "shipping_fee": 0,
        "other_fee": 0,
        "vat_rate": 0,
        "note": "Test cashbook auto generate",
        "items": [
            {
                "item_type": "product",
                "product_id": product_id,
                "item_name": "Sản phẩm test",
                "unit": "cái",
                "quantity": 2,
                "cost_price": 100000
            }
        ]
    }
    # Tổng tiền = 200,000, trả trước 100,000, nợ 100,000
    res = client.post("/api/purchases", json=payload)
    assert res.status_code == 200, res.text
    po_code = res.json()["purchase_code"]

    # Kiểm tra cashbook đã có phiếu chi ref_type='purchase'
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM purchases WHERE code = ?", (po_code,))
    po_id = cur.fetchone()[0]

    cur.execute("SELECT * FROM cashbook WHERE ref_type = 'purchase' AND ref_id = ?", (po_id,))
    cbs = [dict(r) for r in cur.fetchall()]
    assert len(cbs) == 1
    assert cbs[0]["amount"] == 100000
    assert cbs[0]["type"] == "out"
    conn.close()

    # 2. Gọi API thanh toán nốt phần nợ 100,000
    pay_res = client.post(f"/api/purchases/{po_code}/pay", json={
        "amount": 100000,
        "fund_source": "PERSONAL",
        "note": "Thanh toán nốt"
    })
    assert pay_res.status_code == 200, pay_res.text

    # Kiểm tra lại phiếu nhập và cashbook
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT paid_amount, debt_amount FROM purchases WHERE code = ?", (po_code,))
    po_after = cur.fetchone()
    assert po_after[0] == 200000
    assert po_after[1] == 0

    cur.execute("SELECT * FROM cashbook WHERE ref_type = 'purchase' AND ref_id = ?", (po_id,))
    cbs_after = [dict(r) for r in cur.fetchall()]
    assert len(cbs_after) == 2
    conn.close()


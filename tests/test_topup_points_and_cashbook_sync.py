import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient
from database import init_db, get_db
from server import app
from dependencies import get_current_user

init_db()
client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def auth_and_clean():
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner", "is_active": 1}
    def clean():
        db = get_db()
        cur = db.cursor()
        cur.execute("DELETE FROM cashbook WHERE contact_id IN (SELECT id FROM contacts WHERE phone LIKE 'TEST_SYNC_%')")
        cur.execute("DELETE FROM spa_wallet_transactions WHERE contact_id IN (SELECT id FROM contacts WHERE phone LIKE 'TEST_SYNC_%')")
        cur.execute("DELETE FROM contacts WHERE phone LIKE 'TEST_SYNC_%'")
        cur.execute("DELETE FROM topup_packages WHERE name LIKE 'TEST_SYNC_%'")
        db.commit()
        db.close()

    clean()
    yield
    app.dependency_overrides.pop(get_current_user, None)
    clean()

def test_topup_accumulates_points():
    db = get_db()
    cur = db.cursor()
    # Ensure points exchange rate is 1000
    cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('points_exchange_rate', '1000')")
    
    # Create customer with 0 points, 0 wallet balance
    cur.execute("INSERT INTO contacts (name, phone, type, points, spa_wallet_balance) VALUES ('Khách Tích Điểm', 'TEST_SYNC_001', 'customer', 0, 0)")
    cust_id = cur.lastrowid

    # Create topup package: nộp 500k nhận 700k
    cur.execute("INSERT INTO topup_packages (name, pay_amount, receive_amount, is_active) VALUES ('TEST_SYNC_500K', 500000, 700000, 1)")
    pkg_id = cur.lastrowid
    db.commit()
    db.close()

    res = client.post("/api/topup/recharge", json={
        "contact_id": cust_id,
        "package_id": pkg_id,
        "payment_method": "cash",
        "note": "Nạp ví tích điểm"
    })
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["balance_after"] == 700000
    assert data.get("points_earned") == 500 # 500,000 / 1000 = 500 điểm
    assert data.get("current_points") == 500

    # Verify database
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT points, spa_wallet_balance FROM contacts WHERE id = ?", (cust_id,))
    c_row = cur.fetchone()
    assert c_row["points"] == 500
    assert c_row["spa_wallet_balance"] == 700000

    cur.execute("SELECT points_earned FROM spa_wallet_transactions WHERE id = ?", (data["transaction_id"],))
    tx_row = cur.fetchone()
    assert tx_row is not None
    assert tx_row["points_earned"] == 500
    db.close()


def test_delete_topup_receipt_and_rollback_wallet():
    db = get_db()
    cur = db.cursor()
    cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('points_exchange_rate', '1000')")
    cur.execute("INSERT INTO contacts (name, phone, type, points, spa_wallet_balance) VALUES ('Khách Xóa Phiếu', 'TEST_SYNC_002', 'customer', 100, 0)")
    cust_id = cur.lastrowid

    cur.execute("INSERT INTO topup_packages (name, pay_amount, receive_amount, is_active) VALUES ('TEST_SYNC_PKG_ROLLBACK', 500000, 700000, 1)")
    pkg_id = cur.lastrowid
    db.commit()
    db.close()

    res_rec = client.post("/api/topup/recharge", json={
        "contact_id": cust_id,
        "package_id": pkg_id,
        "payment_method": "cash",
        "note": "Nạp ví test rollback"
    })
    assert res_rec.status_code == 200
    rec_data = res_rec.json()
    tx_id = rec_data["transaction_id"]

    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id, code FROM cashbook WHERE ref_type = 'topup' AND ref_id = ?", (tx_id,))
    cb_row = cur.fetchone()
    assert cb_row is not None, "Phải có phiếu thu nạp ví trong cashbook"
    voucher_id = cb_row["id"]
    db.close()

    # Now delete the cashbook voucher
    res_del = client.delete(f"/api/cashbook/{voucher_id}")
    assert res_del.status_code == 200, res_del.text
    del_data = res_del.json()
    assert del_data.get("success") is True

    # Verify database rollback
    db = get_db()
    cur = db.cursor()
    # 1. Cashbook voucher deleted
    cur.execute("SELECT * FROM cashbook WHERE id = ?", (voucher_id,))
    assert cur.fetchone() is None

    # 2. Transaction deleted
    cur.execute("SELECT * FROM spa_wallet_transactions WHERE id = ?", (tx_id,))
    assert cur.fetchone() is None

    # 3. Customer wallet balance and points rolled back
    cur.execute("SELECT spa_wallet_balance, points FROM contacts WHERE id = ?", (cust_id,))
    cust_after = cur.fetchone()
    assert cust_after["spa_wallet_balance"] == 0
    assert cust_after["points"] == 100
    db.close()


def test_cannot_delete_order_receipt_directly():
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        INSERT INTO cashbook (code, type, category, amount, ref_type, ref_id, note)
        VALUES ('PT-ORDER-TEST-001', 'in', 'Thu tiền bán hàng', 300000, 'order', 9999, 'Thu bán lẻ')
    """)
    order_voucher_id = cur.lastrowid
    db.commit()
    db.close()

    res = client.delete(f"/api/cashbook/{order_voucher_id}")
    assert res.status_code == 400
    assert "chỉ được phép xóa phiếu chi hoặc phiếu thu nạp ví spa" in res.json().get("detail", "").lower()

    # Clean up
    db = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM cashbook WHERE id = ?", (order_voucher_id,))
    db.commit()
    db.close()


def test_edit_topup_receipt_notes_and_category():
    db = get_db()
    cur = db.cursor()
    cur.execute("INSERT INTO contacts (name, phone, type, points, spa_wallet_balance) VALUES ('Khách Sửa Phiếu', 'TEST_SYNC_003', 'customer', 0, 0)")
    cust_id = cur.lastrowid
    cur.execute("INSERT INTO topup_packages (name, pay_amount, receive_amount, is_active) VALUES ('TEST_SYNC_PKG_EDIT', 500000, 700000, 1)")
    pkg_id = cur.lastrowid
    db.commit()
    db.close()

    res_rec = client.post("/api/topup/recharge", json={
        "contact_id": cust_id,
        "package_id": pkg_id,
        "payment_method": "cash",
        "note": "Nạp ví gốc"
    })
    assert res_rec.status_code == 200
    tx_id = res_rec.json()["transaction_id"]

    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id FROM cashbook WHERE ref_type = 'topup' AND ref_id = ?", (tx_id,))
    cb_id = cur.fetchone()["id"]
    db.close()

    # Edit cashbook note and category
    res_edit = client.put(f"/api/cashbook/{cb_id}", json={
        "category": "Thu tiền nạp ví VIP",
        "note": "Đã sửa ghi chú thành công"
    })
    assert res_edit.status_code == 200, res_edit.text
    data_edit = res_edit.json()
    assert data_edit["category"] == "Thu tiền nạp ví VIP"
    assert data_edit["note"] == "Đã sửa ghi chú thành công"



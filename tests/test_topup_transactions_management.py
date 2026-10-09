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
def setup_and_teardown():
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner", "is_active": 1}
    def clean():
        db = get_db()
        cur = db.cursor()
        cur.execute("DELETE FROM cashbook WHERE contact_id IN (SELECT id FROM contacts WHERE phone LIKE 'TEST_TX_MGMT_%')")
        cur.execute("DELETE FROM spa_wallet_transactions WHERE contact_id IN (SELECT id FROM contacts WHERE phone LIKE 'TEST_TX_MGMT_%')")
        cur.execute("DELETE FROM contacts WHERE phone LIKE 'TEST_TX_MGMT_%'")
        cur.execute("DELETE FROM topup_packages WHERE name LIKE 'TEST_TX_MGMT_%'")
        db.commit()
        db.close()

    clean()
    yield
    app.dependency_overrides.pop(get_current_user, None)
    clean()

def test_topup_transactions_crud_and_rollback():
    db = get_db()
    cur = db.cursor()
    cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('points_exchange_rate', '1000')")
    cur.execute("INSERT INTO contacts (name, phone, type, points, spa_wallet_balance) VALUES ('Khách Test TX', 'TEST_TX_MGMT_001', 'customer', 50, 0)")
    cust_id = cur.lastrowid
    cur.execute("INSERT INTO topup_packages (name, pay_amount, receive_amount, is_active) VALUES ('TEST_TX_MGMT_500K', 500000, 700000, 1)")
    pkg_id = cur.lastrowid
    db.commit()
    db.close()

    # 1. Recharge
    res_rec = client.post("/api/topup/recharge", json={
        "contact_id": cust_id,
        "package_id": pkg_id,
        "payment_method": "cash",
        "note": "Nạp gói thử nghiệm"
    })
    assert res_rec.status_code == 200, res_rec.text
    tx_id = res_rec.json()["transaction_id"]

    # 2. GET /api/topup/transactions
    res_list = client.get("/api/topup/transactions?search=TEST_TX_MGMT_001")
    assert res_list.status_code == 200, res_list.text
    items = res_list.json()
    assert len(items) >= 1
    found = next((i for i in items if i["id"] == tx_id), None)
    assert found is not None
    assert found["contact_name"] == "Khách Test TX"
    assert found["pay_amount"] == 500000
    assert found["amount"] == 700000
    assert found["points_earned"] == 500
    assert found["cashbook_code"] is not None

    # 3. PUT /api/topup/transactions/{tx_id}
    res_edit = client.put(f"/api/topup/transactions/{tx_id}", json={
        "note": "Đã đổi ghi chú thành công",
        "payment_method": "transfer"
    })
    assert res_edit.status_code == 200, res_edit.text
    data_edit = res_edit.json()
    assert data_edit["note"] == "Đã đổi ghi chú thành công"

    # Verify cashbook synchronized note
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT note FROM cashbook WHERE ref_type = 'topup' AND ref_id = ?", (tx_id,))
    cb_row = cur.fetchone()
    assert cb_row is not None
    assert "Đã đổi ghi chú thành công" in cb_row["note"]
    db.close()

    # 4. DELETE /api/topup/transactions/{tx_id}
    res_del = client.delete(f"/api/topup/transactions/{tx_id}")
    assert res_del.status_code == 200, res_del.text
    assert res_del.json().get("success") is True

    # 5. Verify database rollback: wallet balance=0, points=50, transactions deleted, cashbook deleted
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT spa_wallet_balance, points FROM contacts WHERE id = ?", (cust_id,))
    cust_after = cur.fetchone()
    assert cust_after["spa_wallet_balance"] == 0
    assert cust_after["points"] == 50

    cur.execute("SELECT * FROM spa_wallet_transactions WHERE id = ?", (tx_id,))
    assert cur.fetchone() is None

    cur.execute("SELECT * FROM cashbook WHERE ref_type = 'topup' AND ref_id = ?", (tx_id,))
    assert cur.fetchone() is None
    db.close()


def test_topup_orders_ui_elements():
    """Kiểm tra DOM sub-tab Hóa Đơn Nạp Ví và các hàm JS xử lý"""
    html_content = Path("templates/index.html").read_text(encoding="utf-8")
    assert 'id="btn-subtab-order-topup"' in html_content
    assert 'id="orders-subview-topup"' in html_content
    assert 'id="topup-orders-table-body"' in html_content
    assert 'id="modal-edit-topup-tx"' in html_content

    spa_js = Path("static/js/modules/spa.js").read_text(encoding="utf-8")
    assert "btnTopup" in spa_js
    assert "loadTopupOrdersList" in spa_js

    pos_js = Path("static/js/pos.js").read_text(encoding="utf-8")
    assert "openEditTopupTxModal" in pos_js
    assert "submitEditTopupTx" in pos_js
    assert "confirmDeleteTopupTx" in pos_js
    assert "loadTopupOrdersList" in pos_js
    assert "renderTopupOrdersTable" in pos_js


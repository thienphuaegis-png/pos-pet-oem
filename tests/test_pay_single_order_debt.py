import pytest
from fastapi.testclient import TestClient
import database
from server import app
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())

@pytest.fixture
def setup_order_and_account():
    database.init_db()
    conn = database.get_db()
    cur = conn.cursor()

    # 1. Tạo tài khoản thanh toán mẫu
    cur.execute("DELETE FROM payment_accounts WHERE code = 'TK-TEST-CFD'")
    cur.execute("""
        INSERT INTO payment_accounts (code, name, account_type, owner_type, is_active, is_default)
        VALUES ('TK-TEST-CFD', 'Tài Khoản Test CFD', 'bank', 'PERSONAL', 1, 0)
    """)
    acc_id = cur.lastrowid

    # 2. Tạo nhà cung cấp mẫu
    cur.execute("DELETE FROM contacts WHERE phone = '0998877665'")
    cur.execute("""
        INSERT INTO contacts (name, phone, type, debt, initial_debt_personal, initial_debt_company)
        VALUES ('NCC Test Trả Đơn', '0998877665', 'supplier', 15000000, 15000000, 0)
    """)
    supp_id = cur.lastrowid

    # 3. Tạo đơn mua hàng (PO) mẫu không VAT (quỹ cá nhân)
    cur.execute("DELETE FROM purchases WHERE code = 'PO-TEST-PAY-01'")
    cur.execute("""
        INSERT INTO purchases (code, supplier_id, total_amount, paid_amount, debt_amount, vat_rate, vat_amount, created_at)
        VALUES ('PO-TEST-PAY-01', ?, 15000000, 0, 15000000, 0, 0, '2026-10-20 10:00:00')
    """, (supp_id,))
    po_id = cur.lastrowid

    conn.commit()
    conn.close()

    yield {
        "acc_id": acc_id,
        "supp_id": supp_id,
        "po_id": po_id
    }

def test_pay_single_order_debt_with_account_and_date(setup_order_and_account):
    acc_id = setup_order_and_account["acc_id"]
    po_id = setup_order_and_account["po_id"]
    supp_id = setup_order_and_account["supp_id"]

    payment_payload = {
        "order_type": "PO",
        "order_id": po_id,
        "amount": 5000000,
        "fund_source": "PERSONAL",
        "note": "Trả đợt 1 test",
        "account_id": acc_id,
        "payment_date": "2026-10-21"
    }

    res = client.post("/api/cashflow-debts/pay-order", json=payment_payload)
    assert res.status_code == 200, f"Error: {res.text}"
    data = res.json()
    assert data["success"] is True
    assert data["allocated_amount"] == 5000000
    assert data["remaining_order_debt"] == 10000000

    # Kiểm tra bản ghi cashbook
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM cashbook 
        WHERE ref_type = 'order_po' AND ref_id = ? 
        ORDER BY id DESC LIMIT 1
    """, (po_id,))
    cb = cur.fetchone()
    assert cb is not None
    assert cb["account_id"] == acc_id
    assert cb["fund_source"] == "PERSONAL"
    assert cb["amount"] == 5000000
    assert "2026-10-21" in str(cb["created_at"])
    assert cb["created_by"] is not None

    conn.close()

def test_ui_modal_cfd_pay_order_has_account_and_date_inputs():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        html = f.read()

    assert 'id="modal-cfd-pay-order"' in html
    assert 'id="cfd-pay-order-account"' in html
    assert 'id="cfd-pay-order-date"' in html
    assert 'onCFDPayOrderFundChange()' in html

def test_js_modules_cashflow_handles_order_accounts():
    with open("static/js/modules/cashflow.js", "r", encoding="utf-8") as f:
        js = f.read()

    assert "loadCFDPayOrderAccounts" in js
    assert "onCFDPayOrderFundChange" in js
    assert "cfd-pay-order-account" in js
    assert "cfd-pay-order-date" in js
    assert "account_id: accountId" in js
    assert "payment_date: paymentDate" in js

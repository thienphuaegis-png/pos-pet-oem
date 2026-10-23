# tests/test_pay_order_debt_account_check.py
from fastapi.testclient import TestClient
import database
from server import app
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())


def _setup(acc_owner, acc_active=1, tag="A"):
    conn = database.get_db()
    cur = conn.cursor()
    code = f"TK-T4-{tag}"
    cur.execute("""INSERT INTO payment_accounts (code, name, account_type, owner_type, is_active, is_default)
                   VALUES (?, ?, 'bank', ?, ?, 0)""", (code, f"TK test {tag}", acc_owner, acc_active))
    acc_id = cur.lastrowid
    cur.execute("""INSERT INTO contacts (name, phone, type, debt, initial_debt_personal, initial_debt_company)
                   VALUES ('NCC T4', '0911000444', 'supplier', 1000000, 1000000, 0)""")
    supp_id = cur.lastrowid
    cur.execute("""INSERT INTO purchases (code, supplier_id, total_amount, paid_amount, debt_amount, vat_rate, vat_amount, created_at)
                   VALUES (?, ?, 1000000, 0, 1000000, 0, 0, '2026-10-20 10:00:00')""", (f"PO-T4-{tag}", supp_id))
    po_id = cur.lastrowid
    conn.commit()
    conn.close()
    return acc_id, po_id


def _debt(po_id):
    conn = database.get_db()
    d = conn.execute("SELECT debt_amount FROM purchases WHERE id = ?", (po_id,)).fetchone()["debt_amount"]
    conn.close()
    return d


def test_reject_account_of_other_fund():
    acc_id, po_id = _setup("COMPANY", tag="WRONGFUND")
    r = client.post("/api/cashflow-debts/pay-order", json={
        "order_type": "PO", "order_id": po_id, "amount": 100000,
        "fund_source": "PERSONAL", "account_id": acc_id})  # PO không VAT -> bắt buộc Quỹ Cá Nhân
    assert r.status_code == 400, r.text
    assert _debt(po_id) == 1000000


def test_reject_inactive_account():
    acc_id, po_id = _setup("PERSONAL", acc_active=0, tag="INACTIVE")
    r = client.post("/api/cashflow-debts/pay-order", json={
        "order_type": "PO", "order_id": po_id, "amount": 100000,
        "fund_source": "PERSONAL", "account_id": acc_id})
    assert r.status_code == 400, r.text
    assert _debt(po_id) == 1000000


def test_cashflow_ui_filters_accounts_by_fund():
    js = open("static/js/modules/cashflow.js", encoding="utf-8").read()
    assert "(a.owner_type || 'COMPANY') === targetFund" in js

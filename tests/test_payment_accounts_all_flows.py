"""Hợp đồng tài khoản nhận tiền cho các luồng ngoài Spa: POS bán hàng, nạp ví, trả phòng khách sạn, đổi/trả hàng, phiếu nhập.

Quy tắc chung: chuyển khoản -> bank/ví điện tử, thẻ -> pos_card, tiền mặt -> két.
Thiếu tài khoản hoặc sai loại -> 400, TUYỆT ĐỐI không tự ghi vào tài khoản mặc định.
"""
from fastapi.testclient import TestClient

from database import get_db, init_db
from server import app
from tests.auth_helpers import owner_auth_headers

init_db()
client = TestClient(app, headers=owner_auth_headers())


def _acc(account_type):
    db = get_db()
    row = db.execute("SELECT id FROM payment_accounts WHERE account_type = ? AND is_active = 1 ORDER BY id LIMIT 1", (account_type,)).fetchone()
    db.close()
    assert row, f"cần ít nhất 1 tài khoản loại {account_type}"
    return row["id"]


def _product():
    db = get_db()
    r = db.execute("SELECT id, sell_price FROM products WHERE type = 'product' AND is_active = 1 LIMIT 1").fetchone()
    if not r:
        db.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock, unit, is_active) VALUES ('PAYACC-T1','SP thử TK','product',1000,10000,100,'cái',1)")
        db.commit()
        r = db.execute("SELECT id, sell_price FROM products WHERE code = 'PAYACC-T1'").fetchone()
    db.close()
    return r["id"], float(r["sell_price"] or 10000)


def _order(method, account_id=None):
    pid, price = _product()
    body = {"customer_id": 1, "staff_id": 1, "paid_amount": price, "payment_method": method,
            "items": [{"product_id": pid, "quantity": 1, "price": price, "unit": "cái", "item_type": "product"}]}
    if account_id is not None:
        body["account_id"] = account_id
    return client.post("/api/orders", json=body)


def _cashbook_account(order_id):
    db = get_db()
    row = db.execute("SELECT account_id FROM cashbook WHERE ref_type = 'order' AND ref_id = ? ORDER BY id DESC LIMIT 1", (order_id,)).fetchone()
    db.close()
    return row["account_id"] if row else None


def test_pos_transfer_without_account_rejected():
    assert _order("transfer").status_code == 400


def test_pos_card_without_account_rejected():
    assert _order("card").status_code == 400


def test_pos_card_into_bank_account_rejected():
    res = _order("card", _acc("bank"))
    assert res.status_code == 400, res.text


def test_pos_transfer_into_cash_drawer_rejected():
    assert _order("transfer", _acc("cash")).status_code == 400


def test_pos_card_goes_to_pos_card_account():
    card = _acc("pos_card")
    res = _order("card", card)
    assert res.status_code == 200, res.text
    oid = res.json().get("id") or res.json().get("order_id")
    assert _cashbook_account(oid) == card


def test_pos_transfer_goes_to_chosen_bank():
    bank = _acc("bank")
    res = _order("transfer", bank)
    assert res.status_code == 200, res.text
    oid = res.json().get("id") or res.json().get("order_id")
    assert _cashbook_account(oid) == bank


def test_pos_cash_goes_to_cash_drawer():
    res = _order("cash")
    assert res.status_code == 200, res.text
    oid = res.json().get("id") or res.json().get("order_id")
    db = get_db()
    t = db.execute("SELECT account_type FROM payment_accounts WHERE id = ?", (_cashbook_account(oid),)).fetchone()
    db.close()
    assert t["account_type"] == "cash"


def _topup(method, account_id=None):
    db = get_db()
    cur = db.cursor()
    cur.execute("INSERT INTO contacts (name, phone, type, spa_wallet_balance) VALUES ('KH topup TK', 'TOPUP_PAYACC', 'customer', 0)")
    cid = cur.lastrowid
    cur.execute("INSERT INTO topup_packages (name, pay_amount, receive_amount, is_active) VALUES ('PKG_PAYACC', 100000, 100000, 1)")
    pid = cur.lastrowid
    db.commit()
    db.close()
    body = {"contact_id": cid, "package_id": pid, "payment_method": method}
    if account_id is not None:
        body["account_id"] = account_id
    return client.post("/api/topup/recharge", json=body)


def test_topup_card_requires_pos_card_account():
    assert _topup("card").status_code == 400
    assert _topup("card", _acc("bank")).status_code == 400
    assert _topup("card", _acc("pos_card")).status_code == 200


def test_return_refund_by_transfer_needs_bank_account():
    """Server từ chối chi hoàn tiền chuyển khoản khi thiếu / sai tài khoản (không ghi NULL vào sổ quỹ)."""
    from dependencies import resolve_payment_account
    db = get_db()
    cur = db.cursor()
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        resolve_payment_account(cur, "transfer", None)
    with pytest.raises(HTTPException):
        resolve_payment_account(cur, "transfer", _acc("cash"))
    assert resolve_payment_account(cur, "transfer", _acc("bank")) == _acc("bank")
    db.close()


def test_shift_report_has_card_bucket():
    from routers import shifts
    src = open(shifts.__file__, encoding="utf-8").read()
    assert "card_sales" in src and "pos_card" in src


def test_account_type_pos_card_selectable_in_ui():
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    html = (root / "templates/index.html").read_text(encoding="utf-8")
    assert '<option value="pos_card">' in html, "màn Tài khoản thanh toán phải cho tạo loại Máy POS thẻ"
    assert "payacc.js" in html
    assert 'id="co-pay-account"' in html and 'id="return-modal-account"' in html and 'id="pay-po-account"' in html
    mobile = (root / "templates/pos_mobile.html").read_text(encoding="utf-8")
    assert 'id="mob-pay-account"' in mobile and "mob-pay-card" in mobile
    hotel = (root / "static/js/modules/hotel.js").read_text(encoding="utf-8")
    assert "co-pay-method" in hotel and "payment_method: 'cash'" not in hotel

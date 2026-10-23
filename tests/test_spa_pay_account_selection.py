"""Hợp đồng tài khoản nhận tiền của luồng thu tiền Spa.

- CK/thẻ bắt buộc gửi account_id đúng loại tài khoản (bank/ewallet cho CK, pos_card cho thẻ).
- Thiếu account_id -> 400 (không tự ghi vào tài khoản mặc định).
- Có account_id -> tiền vào đúng tài khoản đó (pet_service_tickets.account_id + cashbook.account_id).
"""
import time

from fastapi.testclient import TestClient

from database import get_db, init_db
from server import app

client = TestClient(app)


def _login():
    res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {res.json()['access_token']}"} if res.status_code == 200 else {}


def _accounts(headers, *types):
    res = client.get("/api/payment-accounts", headers=headers)
    assert res.status_code == 200
    return [a for a in res.json() if a["account_type"] in types and a.get("is_active", 1)]


def _make_ticket(headers, tag):
    ts = int(time.time() * 1000)
    res_cust = client.post("/api/contacts", json={
        "type": "customer",
        "name": f"Khách Spa Pay {tag} {ts}",
        "phone": f"0988{ts % 100000}",
    }, headers=headers)
    assert res_cust.status_code == 200
    res = client.post("/api/pet-services", json={
        "customer_id": res_cust.json()["id"],
        "pet_name": f"Bé {tag} {ts}",
        "service_type": "Tắm Vệ Sinh Corgi",
        "price": 200000.0,
        "payment_status": "unpaid",
    }, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()["id"]


def test_spa_transfer_without_account_is_rejected():
    init_db()
    headers = _login()
    ticket_id = _make_ticket(headers, "noacc")
    res = client.post(f"/api/pet-services/{ticket_id}/pay",
                      json={"payment_method": "transfer"}, headers=headers)
    assert res.status_code == 400, res.text
    assert "tài khoản nhận tiền" in res.json()["detail"].lower()

    with get_db() as db:
        c = db.cursor()
        c.execute("SELECT payment_status, account_id FROM pet_service_tickets WHERE id = ?", (ticket_id,))
        paid, account_id = c.fetchone()
    assert paid != "paid", "Không được đánh dấu đã thanh toán khi thiếu tài khoản nhận tiền"
    assert account_id is None


def test_spa_transfer_with_bank_account_records_account():
    init_db()
    headers = _login()
    bank = _accounts(headers, "bank", "ewallet")
    assert bank, "Cần ít nhất 1 tài khoản bank/ewallet"
    ticket_id = _make_ticket(headers, "bank")

    res = client.post(f"/api/pet-services/{ticket_id}/pay",
                      json={"payment_method": "transfer", "account_id": bank[0]["id"]}, headers=headers)
    assert res.status_code == 200, res.text

    with get_db() as db:
        c = db.cursor()
        c.execute("SELECT payment_status, payment_method, account_id FROM pet_service_tickets WHERE id = ?", (ticket_id,))
        status, method, account_id = c.fetchone()
        assert (status, method, account_id) == ("paid", "transfer", bank[0]["id"])
        c.execute("SELECT account_id FROM cashbook WHERE ref_type = 'pet_service' AND ref_id = ?", (ticket_id,))
        row = c.fetchone()
        assert row and row[0] == bank[0]["id"], "Phiếu thu phải ghi đúng tài khoản nhận tiền"


def test_spa_card_requires_pos_card_account():
    init_db()
    headers = _login()
    card_accounts = _accounts(headers, "pos_card")
    bank_accounts = _accounts(headers, "bank", "ewallet")
    assert bank_accounts, "Cần ít nhất 1 tài khoản bank/ewallet để test trường hợp sai loại"
    ticket_id = _make_ticket(headers, "card")

    # Dùng tài khoản bank cho hình thức quẹt thẻ -> phải bị từ chối
    res = client.post(f"/api/pet-services/{ticket_id}/pay",
                      json={"payment_method": "card", "account_id": bank_accounts[0]["id"]}, headers=headers)
    assert res.status_code == 400, res.text

    if card_accounts:
        res2 = client.post(f"/api/pet-services/{ticket_id}/pay",
                           json={"payment_method": "card", "account_id": card_accounts[0]["id"]}, headers=headers)
        assert res2.status_code == 200, res2.text


# ── Ví Spa chỉ trả phần dịch vụ, phần còn lại thu bằng hình thức khác ──

def _new_customer(headers, tag, wallet=0.0):
    ts = int(time.time() * 1000)
    res = client.post("/api/contacts", json={
        "type": "customer",
        "name": f"Khách Spa Pay {tag} {ts}",
        "phone": f"0977{ts % 100000}",
    }, headers=headers)
    assert res.status_code == 200, res.text
    cid = res.json()["id"]
    if wallet:
        with get_db() as db:
            db.execute("UPDATE contacts SET spa_wallet_balance = ? WHERE id = ?", (wallet, cid))
    return cid


# 170.000 dịch vụ (150.000 + 20.000 phụ thu) + 199.000 hàng hóa POS = 369.000
SERVICE_AND_RETAIL_BILL = [
    {"name": "Combo Vip 2", "quantity": 1, "price": 150000.0, "original_price": 150000.0},
    {"name": "Đánh Răng", "quantity": 1, "price": 20000.0, "original_price": 20000.0, "is_surcharge": True},
    {"product_id": 1, "name": "Sữa tắm Corgi", "quantity": 1, "price": 199000.0,
     "original_price": 199000.0, "is_retail": True},
]


def _make_mixed_ticket(headers, tag, wallet=500000.0):
    """Phiếu 369.000 = 170.000 dịch vụ + 199.000 hàng hóa, khách có ví."""
    import json as _json
    cid = _new_customer(headers, tag, wallet=wallet)
    ts = int(time.time() * 1000)
    res = client.post("/api/pet-services", json={
        "customer_id": cid,
        "pet_name": f"Bé {tag} {ts}",
        "service_type": "Combo Vip 2",
        "price": 369000.0,
        "payment_status": "unpaid",
        "services_json": _json.dumps(SERVICE_AND_RETAIL_BILL, ensure_ascii=False),
    }, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()["id"], cid


def _wallet_balance(customer_id):
    with get_db() as db:
        cur = db.cursor()
        cur.execute("SELECT spa_wallet_balance FROM contacts WHERE id = ?", (customer_id,))
        return float(cur.fetchone()[0] or 0)


def _cashbook_rows(ticket_id):
    with get_db() as db:
        cur = db.cursor()
        cur.execute("SELECT amount, account_id FROM cashbook WHERE ref_type = 'pet_service' AND ref_id = ?",
                    (ticket_id,))
        return [tuple(r) for r in cur.fetchall()]


def test_wallet_service_plus_transfer_for_retail():
    """Ví trả 170.000 dịch vụ, khách chuyển khoản 199.000 tiền hàng hóa."""
    init_db()
    headers = _login()
    bank = _accounts(headers, "bank", "ewallet")
    assert bank, "Cần ít nhất 1 tài khoản bank/ewallet"
    bank_id = bank[0]["id"]

    ticket_id, cid = _make_mixed_ticket(headers, "mix")
    res = client.post(f"/api/pet-services/{ticket_id}/pay", json={
        "payment_method": "wallet",
        "remainder_method": "transfer",
        "account_id": bank_id,
    }, headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["wallet_deduction"] == 170000.0
    assert body["cash_collected"] == 199000.0
    assert body["remainder_method"] == "transfer"
    assert _wallet_balance(cid) == 330000.0, "Ví chỉ bị trừ đúng phần dịch vụ"

    with get_db() as db:
        cur = db.cursor()
        cur.execute("""SELECT payment_status, payment_method, spa_wallet_deduction, remainder_method, account_id
                       FROM pet_service_tickets WHERE id = ?""", (ticket_id,))
        assert tuple(cur.fetchone()) == ("paid", "wallet", 170000.0, "transfer", bank_id)

    rows = _cashbook_rows(ticket_id)
    assert len(rows) == 1 and rows[0][0] == 199000.0
    assert rows[0][1] == bank_id, "199.000 phải vào đúng tài khoản chuyển khoản, không phải két tiền mặt"


def test_wallet_remainder_transfer_without_account_is_rejected():
    init_db()
    headers = _login()
    ticket_id, cid = _make_mixed_ticket(headers, "mixnoacc")
    res = client.post(f"/api/pet-services/{ticket_id}/pay", json={
        "payment_method": "wallet",
        "remainder_method": "transfer",
    }, headers=headers)
    assert res.status_code == 400, res.text
    assert _wallet_balance(cid) == 500000.0, "Không được trừ ví khi thiếu tài khoản nhận tiền"
    with get_db() as db:
        cur = db.cursor()
        cur.execute("SELECT payment_status FROM pet_service_tickets WHERE id = ?", (ticket_id,))
        assert cur.fetchone()[0] != "paid"


def test_wallet_remainder_defaults_to_cash_box():
    """Không chọn hình thức -> phần còn lại vào két tiền mặt, nhưng ghi nhận rõ remainder_method."""
    init_db()
    headers = _login()
    ticket_id, _ = _make_mixed_ticket(headers, "mixcash")
    res = client.post(f"/api/pet-services/{ticket_id}/pay", json={"payment_method": "wallet"}, headers=headers)
    assert res.status_code == 200, res.text

    cash = _accounts(headers, "cash")
    assert cash, "Cần ít nhất 1 tài khoản két tiền mặt"
    rows = _cashbook_rows(ticket_id)
    assert len(rows) == 1 and rows[0][0] == 199000.0
    assert rows[0][1] == cash[0]["id"], "Thu ngoài mặc định phải vào két tiền mặt"
    with get_db() as db:
        cur = db.cursor()
        cur.execute("SELECT remainder_method FROM pet_service_tickets WHERE id = ?", (ticket_id,))
        assert cur.fetchone()[0] == "cash"


def test_batch_wallet_plus_transfer_remainder():
    """Nhập hàng loạt: ví trả dịch vụ, phần còn lại của đợt chuyển khoản vào đúng TK."""
    import json as _json
    init_db()
    headers = _login()
    bank = _accounts(headers, "bank", "ewallet")
    assert bank, "Cần ít nhất 1 tài khoản bank/ewallet"
    bank_id = bank[0]["id"]

    cid = _new_customer(headers, "batchmix", wallet=500000.0)
    ts = int(time.time() * 1000)
    res = client.post("/api/pet-services/batch", json={
        "customer_id": cid,
        "account_id": bank_id,
        "remainder_method": "transfer",
        "tickets": [{
            "customer_id": cid,
            "pet_name": f"Bé batch {ts}",
            "service_type": "Combo Vip 2",
            "price": 369000.0,
            "payment_status": "paid",
            "payment_method": "wallet",
            "services_json": _json.dumps(SERVICE_AND_RETAIL_BILL, ensure_ascii=False),
        }],
    }, headers=headers)
    assert res.status_code == 200, res.text
    ticket = res.json()["tickets"][0]
    ticket_id = ticket["id"]

    assert ticket["spa_wallet_deduction"] == 170000.0
    assert _wallet_balance(cid) == 330000.0

    with get_db() as db:
        cur = db.cursor()
        cur.execute("SELECT payment_method, remainder_method, account_id FROM pet_service_tickets WHERE id = ?",
                    (ticket_id,))
        assert tuple(cur.fetchone()) == ("wallet", "transfer", bank_id)

    rows = _cashbook_rows(ticket_id)
    assert len(rows) == 1 and rows[0][0] == 199000.0
    assert rows[0][1] == bank_id, "Thu ngoài của đợt phải vào đúng TK chuyển khoản"

# tests/test_spa_deposit_account.py
from pathlib import Path
from fastapi.testclient import TestClient
from server import app
from database import get_db
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())


def _setup():
    db = get_db()
    cur = db.cursor()
    cur.execute("INSERT INTO contacts (name, type) VALUES ('KH Coc CK', 'customer')")
    cid = cur.lastrowid
    cur.execute("""INSERT OR IGNORE INTO payment_accounts (code, name, account_type, owner_type, is_active, is_default)
                   VALUES ('TK-TEST-COC', 'TK test coc', 'bank', 'COMPANY', 1, 0)""")
    bank_id = cur.execute("SELECT id FROM payment_accounts WHERE code = 'TK-TEST-COC'").fetchone()["id"]
    db.commit()
    db.close()
    return cid, bank_id


def _ticket(cid, **kw):
    t = {"customer_id": cid, "pet_name": "Coc", "weight_at_service": 3.0, "service_type": "Tắm",
         "price": 200000, "payment_status": "unpaid", "deposit_amount": 50000}
    t.update(kw)
    return t


def _deposit_acc_type(ticket_id):
    db = get_db()
    row = db.execute("""SELECT pa.account_type FROM cashbook cb JOIN payment_accounts pa ON pa.id = cb.account_id
                        WHERE cb.ref_type = 'pet_service_deposit' AND cb.ref_id = ?""", (ticket_id,)).fetchone()
    db.close()
    return row["account_type"] if row else None


def test_deposit_transfer_goes_to_selected_bank():
    cid, bank_id = _setup()
    r = client.post("/api/pet-services", json=_ticket(cid, deposit_method="transfer", deposit_account_id=bank_id))
    assert r.status_code == 200, r.text
    assert _deposit_acc_type(r.json()["id"]) == "bank"


def test_deposit_transfer_without_account_is_400():
    cid, _ = _setup()
    r = client.post("/api/pet-services", json=_ticket(cid, deposit_method="transfer"))
    assert r.status_code == 400, r.text
    assert "tài khoản" in r.json()["detail"].lower()


def test_deposit_default_is_cash():
    cid, _ = _setup()
    r = client.post("/api/pet-services", json=_ticket(cid))
    assert r.status_code == 200, r.text
    assert _deposit_acc_type(r.json()["id"]) == "cash"


def test_batch_deposit_transfer_goes_to_selected_bank():
    cid, bank_id = _setup()
    r = client.post("/api/pet-services/batch", json={
        "customer_id": cid,
        "tickets": [_ticket(cid, deposit_method="transfer", deposit_account_id=bank_id)]})
    assert r.status_code == 200, r.text
    assert _deposit_acc_type(r.json()["tickets"][0]["id"]) == "bank"


def test_deposit_ui_wired():
    root = Path(__file__).resolve().parent.parent
    html = (root / "templates/index.html").read_text(encoding="utf-8")
    js = (root / "static/js/modules/spa.js").read_text(encoding="utf-8")
    assert 'id="svc-deposit-method"' in html and 'id="svc-deposit-account"' in html
    assert "syncSvcDepositAccountRow" in js
    assert "deposit_method: depositMethod" in js and "deposit_account_id: depositAccountId" in js

import datetime
from fastapi.testclient import TestClient
from server import app
from database import get_db
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())


def _ticket(cust_id, name):
    return {"customer_id": cust_id, "pet_name": name, "weight_at_service": 3.0, "service_type": "Tắm",
            "price": 100000, "payment_status": "unpaid"}


def _new_customer():
    db = get_db()
    cur = db.cursor()
    cur.execute("INSERT INTO contacts (name, type) VALUES ('KH Batch STT', 'customer')")
    db.commit()
    cid = cur.lastrowid
    db.close()
    return cid


def test_batch_uses_start_ticket_number_shown_on_screen():
    cid = _new_customer()
    today = datetime.date.today().isoformat()
    db = get_db()
    mx = db.execute("SELECT MAX(ticket_number) FROM pet_service_tickets WHERE ticket_date = ?", (today,)).fetchone()[0] or 0
    db.close()
    start = mx + 50  # màn hình đã hiển thị số này cho thu ngân
    res = client.post("/api/pet-services/batch", json={
        "customer_id": cid, "start_ticket_number": start,
        "tickets": [_ticket(cid, "A"), _ticket(cid, "B")]})
    assert res.status_code == 200, res.text
    nums = sorted(t["ticket_number"] for t in res.json()["tickets"])
    assert nums == [start, start + 1]


def test_batch_ignores_start_number_already_taken():
    cid = _new_customer()
    today = datetime.date.today().isoformat()
    db = get_db()
    mx = db.execute("SELECT MAX(ticket_number) FROM pet_service_tickets WHERE ticket_date = ?", (today,)).fetchone()[0] or 5
    db.close()
    res = client.post("/api/pet-services/batch", json={
        "customer_id": cid, "start_ticket_number": 1,  # đã dùng -> phải bỏ qua, không trùng số
        "tickets": [_ticket(cid, "C"), _ticket(cid, "D")]})
    assert res.status_code == 200, res.text
    nums = sorted(t["ticket_number"] for t in res.json()["tickets"])
    assert nums[0] > mx and nums[1] == nums[0] + 1


def test_checkout_popup_is_wired_in_ui():
    root = __import__("pathlib").Path(__file__).resolve().parent.parent
    html = (root / "templates/index.html").read_text(encoding="utf-8")
    js = (root / "static/js/modules/spa.js").read_text(encoding="utf-8")
    assert 'id="modal-spa-checkout"' in html
    assert "openSpaCheckoutModal" in js and "submitSpaCheckout" in js
    # "Đã về" phải đi qua popup (updateServiceStatus chặn checked_out khi chưa skipCheckoutPopup)
    assert "skipCheckoutPopup" in js

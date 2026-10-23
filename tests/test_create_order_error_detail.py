# tests/test_create_order_error_detail.py
import time
from fastapi.testclient import TestClient
from server import app
from database import get_db
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())


def test_create_order_business_error_keeps_clean_detail():
    db = get_db()
    cur = db.cursor()
    cur.execute("INSERT INTO products (code, name, type, stock, sell_price, cost_price) VALUES (?, 'SP test loi', 'product', 10, 1000, 500)",
                (f"SP-ERR-{int(time.time() * 1000)}",))
    pid = cur.lastrowid
    sid = cur.execute("SELECT id FROM staff ORDER BY id LIMIT 1").fetchone()["id"]
    db.commit()
    db.close()
    r = client.post("/api/orders", json={
        "customer_id": 1, "staff_id": sid,
        "items": [{"product_id": pid, "quantity": 1, "price": 1000}],
        "paid_amount": 1000, "payment_method": "transfer"})  # chuyển khoản nhưng không gửi account_id
    assert r.status_code == 400, r.text
    assert r.json()["detail"].startswith("Vui lòng chọn tài khoản"), r.json()["detail"]

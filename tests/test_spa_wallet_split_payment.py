import time
from fastapi.testclient import TestClient
from server import app
from database import init_db, get_db

client = TestClient(app)

def get_auth_token():
    res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    if res.status_code == 200:
        return res.json().get("access_token")
    return None

def test_spa_wallet_split_payment_choice_a():
    init_db()
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    ts = int(time.time() * 1000)

    # 1. Tạo khách hàng có sẵn ví 100.000 đ
    res = client.post("/api/contacts", json={
        "type": "customer",
        "name": f"Khách Split Test {ts}",
        "phone": f"091122{ts % 10000}"
    }, headers=headers)
    assert res.status_code == 200
    cust_id = res.json()["id"]

    # Cập nhật số dư ví ban đầu 100.000 đ
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE contacts SET spa_wallet_balance = 100000.0 WHERE id = ?", (cust_id,))
    conn.commit()
    conn.close()

    # Kiểm tra số dư ví ban đầu đúng 100k
    res_c = client.get(f"/api/contacts/{cust_id}", headers=headers)
    assert res_c.status_code == 200
    assert res_c.json()["spa_wallet_balance"] == 100000.0

    # 2. Tạo phiếu Spa 250.000 đ thanh toán bằng 'wallet' (Lựa chọn A)
    # Kỳ vọng: Trừ sạch 100k trong ví (ví về 0), thu ngoài 150k và ghi cashbook 150k
    ticket_payload = {
        "customer_id": cust_id,
        "pet_name": f"Bé Corgi {ts}",
        "weight_at_service": 4.5,
        "service_type": "Tắm Vệ Sinh",
        "price": 250000.0,
        "payment_status": "paid",
        "payment_method": "wallet"
    }
    res_ticket = client.post("/api/pet-services", json=ticket_payload, headers=headers)
    assert res_ticket.status_code == 200
    t_data = res_ticket.json()
    assert t_data["status"] == "ok"
    ticket_id = t_data["id"]

    # 3. Kiểm tra số dư ví sau khi trừ: phải về 0 đ
    res_after = client.get(f"/api/contacts/{cust_id}", headers=headers)
    assert res_after.status_code == 200
    assert res_after.json()["spa_wallet_balance"] == 0.0

    # 4. Kiểm tra Sổ Quỹ (cashbook): chỉ ghi nhận 150.000 đ phần thu ngoài
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM cashbook WHERE ref_type = 'pet_service' AND ref_id = ?", (ticket_id,))
    cb_row = cur.fetchone()
    conn.close()

    assert cb_row is not None
    assert cb_row["amount"] == 150000.0
    assert "Trừ ví: 100,000 đ" in cb_row["note"]
    assert "Thu ngoài: 150,000 đ" in cb_row["note"]

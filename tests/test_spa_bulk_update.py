import pytest
import time
from fastapi.testclient import TestClient
from server import app
from database import get_db, init_db

client = TestClient(app)

def get_auth_token():
    res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    if res.status_code == 200:
        return res.json().get("access_token")
    return None

def test_spa_bulk_update_api():
    init_db()
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    ts = int(time.time() * 1000)

    # 0. Lấy tài khoản nhận tiền loại bank (CK bắt buộc phải chọn tài khoản đúng loại)
    res_acc = client.get("/api/payment-accounts", headers=headers)
    assert res_acc.status_code == 200
    bank_acc = next((a for a in res_acc.json() if a["account_type"] in ("bank", "ewallet") and a.get("is_active", 1)), None)
    assert bank_acc, "Cần ít nhất 1 tài khoản nhận tiền loại bank/ewallet để test"
    bank_account_id = bank_acc["id"]

    # 1. Tạo khách hàng test
    res_cust = client.post("/api/contacts", json={
        "type": "customer",
        "name": f"Anh Khách Bulk Test {ts}",
        "phone": f"091122{ts % 10000}",
        "address": "Bến Tre"
    }, headers=headers)
    assert res_cust.status_code == 200
    customer_id = res_cust.json()["id"]

    # 2. Tạo 2 vé Spa mẫu để test bulk update
    res1 = client.post("/api/pet-services", json={
        "customer_id": customer_id,
        "pet_name": f"Bé Corgi {ts}",
        "pet_breed": "Corgi",
        "weight_at_service": 8.5,
        "service_type": "Tắm Vệ Sinh Corgi",
        "price": 220000.0,
        "status": "pending"
    }, headers=headers)
    assert res1.status_code == 200
    ticket1_id = res1.json()["id"]

    res2 = client.post("/api/pet-services", json={
        "customer_id": customer_id,
        "pet_name": f"Bé Phốc Sóc {ts}",
        "pet_breed": "Pomeranian",
        "weight_at_service": 2.8,
        "service_type": "Cắt Tỉa Tạo Kiểu Phốc Sóc",
        "price": 250000.0,
        "status": "pending"
    }, headers=headers)
    assert res2.status_code == 200
    ticket2_id = res2.json()["id"]

    # 3. Gọi PUT /api/pet-services/tickets/bulk-update
    bulk_payload = {
        "tickets": [
            {
                "id": ticket1_id,
                "status": "in_progress",
                "staff_cutter": "Thợ Cắt Sang",
                "staff_worker_1": "Thợ Phụ Mai",
                "weight_at_service": 9.2,
                "accessories": "Dây dắt đỏ, áo ấm",
                "send_to_hotel": 1,
                "surcharge": 30000.0,
                "shipping_fee": 40000.0,
                "price": 290000.0,
                "payment_status": "unpaid",
                "note": "Cạo bàn chân sạch"
            },
            {
                "id": ticket2_id,
                "status": "completed",
                "staff_cutter": "Thợ Cắt Lan",
                "staff_worker_1": "",
                "teeth_cleaning": 20000.0,
                "art_cutting_fee": 50000.0,
                "price": 320000.0,
                "payment_status": "paid",
                "payment_method": "transfer",
                "account_id": bank_account_id,
                "customer_request": "Khách dặn đón trước 5h chiều"
            }
        ]
    }

    res_bulk = client.put("/api/pet-services/tickets/bulk-update", json=bulk_payload, headers=headers)
    assert res_bulk.status_code == 200
    data = res_bulk.json()
    assert data["success"] is True
    assert data["updated_count"] == 2

    # 3. Đối soát lại trong database
    with get_db() as db:
        c = db.cursor()
        c.execute("SELECT status, staff_cutter, staff_worker_1, surcharge, price, payment_status, note, weight_at_service, accessories, send_to_hotel, shipping_fee FROM pet_service_tickets WHERE id = ?", (ticket1_id,))
        t1 = c.fetchone()
        assert t1[0] == "in_progress"
        assert t1[1] == "Thợ Cắt Sang"
        assert t1[2] == "Thợ Phụ Mai"
        assert t1[3] == 30000.0
        assert t1[4] == 290000.0
        assert t1[5] == "unpaid"
        assert t1[6] == "Cạo bàn chân sạch"
        assert t1[7] == 9.2
        assert t1[8] == "Dây dắt đỏ, áo ấm"
        assert t1[9] == 1
        assert t1[10] == 40000.0

        c.execute("SELECT status, staff_cutter, teeth_cleaning, price, payment_status, payment_method, customer_request, art_cutting_fee, account_id FROM pet_service_tickets WHERE id = ?", (ticket2_id,))
        t2 = c.fetchone()
        assert t2[0] == "completed"
        assert t2[1] == "Thợ Cắt Lan"
        assert t2[2] == 20000.0
        assert t2[3] == 320000.0
        assert t2[4] == "paid"
        assert t2[5] == "transfer"
        assert t2[6] == "Khách dặn đón trước 5h chiều"
        assert t2[7] == 50000.0
        assert t2[8] == bank_account_id, "Tiền CK phải được ghi nhận đúng tài khoản nhận tiền"

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

def test_spa_batch_intake_and_warning_api():
    init_db()
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    ts = int(time.time() * 1000)

    # 1. Tạo khách hàng test
    res = client.post("/api/contacts", json={
        "type": "customer",
        "name": f"Anh Ba Spa Test {ts}",
        "phone": f"098877{ts % 10000}",
        "address": "Bến Tre"
    }, headers=headers)
    assert res.status_code == 200
    customer_id = res.json()["id"]

    # 2. Test cập nhật cảnh báo khách hàng (Danh sách đỏ)
    res_warn = client.put(f"/api/contacts/{customer_id}/warning", json={
        "is_flagged": True,
        "warning_note": "Bé Bông hay cắn thợ lạ, khách kỹ tính!"
    }, headers=headers)
    assert res_warn.status_code == 200
    assert res_warn.json()["is_flagged"] is True

    # Kiểm tra GET contact có trả về flag và note không
    res_get = client.get(f"/api/contacts/{customer_id}", headers=headers)
    assert res_get.status_code == 200
    assert res_get.json()["is_flagged"] == 1
    assert "Bé Bông hay cắn" in res_get.json()["warning_note"]

    # 3. Test tạo phiếu Spa hàng loạt (Batch Intake) cho 2 bé
    batch_payload = {
        "customer_id": customer_id,
        "batch_code": f"BATCH-{ts}",
        "tickets": [
            {
                "customer_id": customer_id,
                "pet_name": f"Bé Bông {ts}",
                "pet_breed": "Poodle",
                "weight_at_service": 3.5,
                "service_type": "Gói Tắm Thường",
                "price": 150000.0,
                "shaving_feet": "Có cạo bàn",
                "teeth_cleaning": 30000.0,
                "customer_request": "Sấy bông kỹ"
            },
            {
                "customer_id": customer_id,
                "pet_name": f"Bé Miu {ts}",
                "pet_breed": "Mèo Anh",
                "weight_at_service": 4.0,
                "service_type": "Tắm Mèo",
                "price": 180000.0,
                "shaving_feet": "Không cạo bàn",
                "surcharge": 20000.0,
                "customer_request": "Dùng sữa tắm dịu nhẹ"
            }
        ]
    }
    res_batch = client.post("/api/pet-services/batch", json=batch_payload, headers=headers)
    assert res_batch.status_code == 200
    batch_res_data = res_batch.json()
    assert batch_res_data["status"] == "ok"
    assert batch_res_data["batch_code"] == f"BATCH-{ts}"
    assert batch_res_data["count"] == 2
    assert len(batch_res_data["tickets"]) == 2
    t1 = batch_res_data["tickets"][0]
    t2 = batch_res_data["tickets"][1]
    assert t1["ticket_number"] >= 1
    assert t2["ticket_number"] == t1["ticket_number"] + 1

    pet_1_id = batch_res_data["tickets"][0]["pet_id"]
    assert pet_1_id is not None

    # 4. Test API lấy lịch sử Spa của khách hàng
    res_hist = client.get(f"/api/pet-services/history/customer/{customer_id}", headers=headers)
    assert res_hist.status_code == 200
    hist_items = res_hist.json()
    assert len(hist_items) >= 2
    assert any("Gói Tắm Thường" in h["service_type"] for h in hist_items)
    assert any("Tắm Mèo" in h["service_type"] for h in hist_items)

    # Test lọc theo pet_id
    res_pet_hist = client.get(f"/api/pet-services/history/customer/{customer_id}?pet_id={pet_1_id}", headers=headers)
    assert res_pet_hist.status_code == 200
    pet_hist_items = res_pet_hist.json()
    assert len(pet_hist_items) >= 1
    assert all(h["pet_id"] == pet_1_id for h in pet_hist_items)

    # 5. Test thanh toán bằng ví Spa cho Batch: kiểm tra trừ tiền và chặn khi số dư không đủ
    # Khách ban đầu có ví 0đ -> trả lỗi 400
    wallet_batch_payload = {
        "customer_id": customer_id,
        "batch_code": f"BATCH-WALLET-{ts}",
        "tickets": [
            {
                "customer_id": customer_id,
                "pet_name": f"Bé Bông {ts}",
                "service_type": "Tắm",
                "price": 100000.0,
                "payment_status": "paid",
                "payment_method": "wallet"
            }
        ]
    }
    res_fail = client.post("/api/pet-services/batch", json=wallet_batch_payload, headers=headers)
    assert res_fail.status_code == 400
    assert "Số dư ví Spa không đủ" in res_fail.json()["detail"]

    # Cập nhật số dư ví cho khách -> thanh toán thành công và trừ tiền
    conn = get_db()
    conn.execute("UPDATE contacts SET spa_wallet_balance = 500000 WHERE id = ?", (customer_id,))
    conn.commit()
    conn.close()

    res_ok = client.post("/api/pet-services/batch", json=wallet_batch_payload, headers=headers)
    assert res_ok.status_code == 200

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT spa_wallet_balance FROM contacts WHERE id = ?", (customer_id,))
    bal_after = cur.fetchone()["spa_wallet_balance"]
    assert bal_after == 400000.0  # 500k - 100k
    conn.close()

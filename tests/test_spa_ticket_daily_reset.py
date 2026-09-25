import pytest
import time
from fastapi.testclient import TestClient
from server import app
from database import get_db

client = TestClient(app)

def get_auth_token():
    res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    if res.status_code == 200:
        return res.json().get("access_token")
    return None

def test_ticket_number_daily_reset():
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}
    ts = int(time.time() * 1000)

    # 1. Tạo customer test
    res = client.post("/api/contacts", json={
        "type": "customer",
        "name": f"Khách Reset Test {ts}",
        "phone": f"0999{ts % 1000000:06d}",
        "address": "Bến Tre"
    }, headers=headers)
    assert res.status_code == 200
    cust_id = res.json()["id"]

    # 2. Tạo vé ngày A
    date_a = "2026-10-01"
    res_a1 = client.post("/api/pet-services", json={
        "customer_id": cust_id,
        "pet_name": "Cún A1",
        "pet_breed": "Poodle",
        "weight_at_service": 3.0,
        "service_type": "Tắm",
        "price": 100000.0,
        "ticket_date": date_a
    }, headers=headers)
    assert res_a1.status_code == 200
    assert res_a1.json()["ticket_number"] >= 1
    t_a1_num = res_a1.json()["ticket_number"]

    res_a2 = client.post("/api/pet-services", json={
        "customer_id": cust_id,
        "pet_name": "Cún A2",
        "pet_breed": "Poodle",
        "weight_at_service": 3.5,
        "service_type": "Tắm",
        "price": 100000.0,
        "ticket_date": date_a
    }, headers=headers)
    assert res_a2.status_code == 200
    assert res_a2.json()["ticket_number"] == t_a1_num + 1

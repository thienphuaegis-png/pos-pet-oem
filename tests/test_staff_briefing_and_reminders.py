import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db
from tests.auth_helpers import staff_auth_headers

client = TestClient(app)

def test_get_staff_briefing():
    headers = staff_auth_headers("cashier")
    res = client.get("/api/ai/staff-briefing", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "staff" in data
    assert "shift" in data
    assert "kpi" in data
    assert "greeting" in data
    assert "briefing_desc" in data
    assert "reminders" in data
    assert "auto_tasks" in data
    assert "warehouse_kpi" in data
    assert "accountant_kpi" in data
    assert "low_stock_count" in data["warehouse_kpi"]
    assert "incoming_shipments" in data["warehouse_kpi"]
    assert "debt_to_suppliers" in data["warehouse_kpi"]
    assert "total_payable" in data["warehouse_kpi"]
    assert "low_stock_products" in data["warehouse_kpi"]

def test_reminders_crud():
    headers = staff_auth_headers("cashier")
    
    # 1. Tạo lời nhắc mới
    create_res = client.post("/api/ai/reminders", json={
        "title": "Kiểm tra hạn sử dụng sữa tắm SOS",
        "remind_time": "14:30",
        "priority": "urgent",
        "description": "Ưu tiên kiểm lô date gần trước"
    }, headers=headers)
    assert create_res.status_code == 200
    reminder_id = create_res.json()["id"]

    # 2. Kiểm tra xuất hiện trong staff-briefing
    brief_res = client.get("/api/ai/staff-briefing", headers=headers)
    assert brief_res.status_code == 200
    reminders = brief_res.json()["reminders"]
    target = next((r for r in reminders if r["id"] == reminder_id), None)
    assert target is not None
    assert target["title"] == "Kiểm tra hạn sử dụng sữa tắm SOS"
    assert target["is_done"] == 0

    # 3. Toggle hoàn thành
    toggle_res = client.patch(f"/api/ai/reminders/{reminder_id}/toggle", headers=headers)
    assert toggle_res.status_code == 200
    assert toggle_res.json()["is_done"] == 1

    # 4. Xóa nhắc nhở
    del_res = client.delete(f"/api/ai/reminders/{reminder_id}", headers=headers)
    assert del_res.status_code == 200

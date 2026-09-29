import pytest
from fastapi.testclient import TestClient
from server import app
from database import get_db

client = TestClient(app)

def test_module_hotel_toggle(client_with_auth=None):
    # Test getting modules includes module_hotel
    res = client.get("/api/settings/modules")
    assert res.status_code == 200
    data = res.json()
    assert "module_hotel" in data
    assert isinstance(data["module_hotel"], bool)

def test_activity_log_filters_and_retention():
    # Insert test logs
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM activity_log WHERE path LIKE '%/test-log-audit%'")
    cur.execute(
        "INSERT INTO activity_log (staff_id, staff_name, role, action, method, path, ip, created_at) "
        "VALUES (1, 'Quản Lý', 'owner', 'Thao tác Khách sạn Hotel', 'POST', '/api/test-log-audit', '127.0.0.1', datetime('now', '-5 days'))"
    )
    cur.execute(
        "INSERT INTO activity_log (staff_id, staff_name, role, action, method, path, ip, created_at) "
        "VALUES (2, 'Thu Ngân 1', 'cashier', 'Tạo đơn hàng POS', 'POST', '/api/test-log-audit-pos', '192.168.1.10', datetime('now', '-50 days'))"
    )
    conn.commit()
    conn.close()

    # Query with default 90 days - both should be found
    # Login as owner to test /api/settings/activity-log
    login_res = client.post("/api/auth/login", json={"username": "admin", "password": "123"})
    if login_res.status_code == 200:
        token = login_res.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 90 days should include 50 days ago
        r = client.get("/api/settings/activity-log?days=90&search=test-log-audit", headers=headers)
        assert r.status_code == 200
        logs = r.json()["logs"]
        assert len(logs) >= 2

        # 30 days should NOT include 50 days ago
        r_30 = client.get("/api/settings/activity-log?days=30&search=test-log-audit", headers=headers)
        assert r_30.status_code == 200
        logs_30 = r_30.json()["logs"]
        paths_30 = [l["path"] for l in logs_30]
        assert "/api/test-log-audit-pos" not in paths_30

        # Action type filter
        r_act = client.get("/api/settings/activity-log?days=90&action_type=Hotel", headers=headers)
        assert r_act.status_code == 200
        for l in r_act.json()["logs"]:
            assert "Hotel" in l["action"] or "hotel" in l["path"]

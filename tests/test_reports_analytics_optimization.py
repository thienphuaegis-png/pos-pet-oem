import sqlite3
import pytest
from fastapi.testclient import TestClient
from database import get_db_path, init_db
from server import app

init_db()

def test_reports_endpoints_require_bearer_token():
    """Kiểm tra các endpoint báo cáo bắt buộc có Bearer token hợp lệ (không cho phép khách vô danh)"""
    from dependencies import get_current_user
    # Đảm bảo gỡ override nếu có từ các test khác trước đó
    app.dependency_overrides.pop(get_current_user, None)

    client = TestClient(app)
    
    # Không gửi header Authorization
    res_analytics = client.get("/api/reports/analytics")
    assert res_analytics.status_code == 401, f"Kỳ vọng 401 Unauthorized nhưng nhận {res_analytics.status_code}"

    res_excel = client.get("/api/reports/export-excel")
    assert res_excel.status_code == 401, f"Kỳ vọng 401 Unauthorized nhưng nhận {res_excel.status_code}"

def test_database_composite_indexes_exist():
    """Kiểm tra sự tồn tại của 5 composite index tối ưu hóa cho Reports Analytics"""
    conn = sqlite3.connect(get_db_path())
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='index'")
    indexes = [r[0] for r in cur.fetchall()]
    conn.close()

    expected_indexes = [
        "idx_orders_created_at_staff",
        "idx_order_items_order_prod",
        "idx_order_payments_order_method",
        "idx_hotel_bookings_created_at",
        "idx_pet_service_tickets_created_status",
    ]
    for idx in expected_indexes:
        assert idx in indexes, f"Thiếu composite index {idx} trong CSDL SQLite"

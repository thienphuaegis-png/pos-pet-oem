import pytest
from fastapi.testclient import TestClient
from database import init_db, get_db
from server import app
from dependencies import get_current_user

init_db()

@pytest.fixture(autouse=True)
def setup_auth():
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner", "is_active": 1}
    yield
    app.dependency_overrides.pop(get_current_user, None)

def test_reports_analytics_api_basic():
    client = TestClient(app)
    # 1. Gọi API analytics mặc định (hôm nay)
    res = client.get("/api/reports/analytics")
    assert res.status_code == 200, res.text
    data = res.json()

    # Kiểm tra các khối cấu trúc dữ liệu bắt buộc
    assert "summary" in data
    assert "timeline" in data
    assert "payments" in data
    assert "goods_vs_services" in data
    assert "staff_performance" in data
    assert "top_products" in data

    # Kiểm tra các trường trong summary
    summary = data["summary"]
    for field in ["total_revenue", "total_paid", "total_debt", "order_count", "total_commission", "aov"]:
        assert field in summary

def test_reports_analytics_api_with_date_range():
    client = TestClient(app)
    # 2. Gọi API với khoảng ngày tùy chọn
    res = client.get("/api/reports/analytics?from_date=2026-09-01&to_date=2026-10-31")
    assert res.status_code == 200, res.text
    data = res.json()
    assert isinstance(data["timeline"], list)
    assert isinstance(data["payments"], list)
    assert isinstance(data["staff_performance"], list)
    assert isinstance(data["top_products"], list)

def test_reports_export_excel_api():
    client = TestClient(app)
    # 3. Gọi API xuất file Excel báo cáo kinh doanh
    res = client.get("/api/reports/export-excel?from_date=2026-10-01&to_date=2026-10-07")
    assert res.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in res.headers.get("content-type", "")
    assert len(res.content) > 1000

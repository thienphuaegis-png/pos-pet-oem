from pathlib import Path

def test_reports_analytics_js_has_skeleton_and_auth_headers():
    """Kiểm tra reports_analytics.js có logic skeleton và gắn Authorization header"""
    js = Path("static/js/modules/reports_analytics.js").read_text(encoding="utf-8")

    # 1. Có hàm renderReportsSkeleton hoặc hiển thị skeleton cho KPI & Tables
    assert "renderReportsSkeleton" in js or "renderTableSkeleton" in js, "Thiếu logic renderTableSkeleton trong reports_analytics.js"
    
    # 2. Có gọi startPageLoader / stopPageLoader
    assert "startPageLoader" in js, "Thiếu startPageLoader() trong loadReportsAnalytics"
    assert "stopPageLoader" in js, "Thiếu stopPageLoader() trong loadReportsAnalytics"

    # 3. Có gắn header Authorization Bearer token hoặc Auth.getToken()
    assert "Authorization" in js or "Auth.getToken" in js, "Thiếu gắn Authorization Bearer token trong reports_analytics.js"

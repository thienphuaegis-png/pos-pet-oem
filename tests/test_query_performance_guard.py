import os
import sys
import sqlite3
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import app
from database import get_db, D1ConnectionWrapper


def _get_auth_headers(client: TestClient):
    res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    assert res.status_code == 200
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_no_correlated_subquery_table_scans_in_core_queries():
    """Đảm bảo các câu truy vấn cốt lõi (Kho, Sản phẩm, KPI Spa) không dùng Correlated Subquery quét bảng."""
    conn = get_db()
    cur = conn.cursor()

    # 1. Truy vấn Tồn kho tổng hợp (không được có CORRELATED SCALAR SUBQUERY quét product_inventory)
    unified_prod_sql = """
        SELECT 'product' as item_type, p.id, p.code, p.name,
               COALESCE(pi_sum.total_qty, 0) as quantity,
               COALESCE(pi_sum.total_qty, 0) * p.cost_price as total_value,
               sup_agg.supplier_names
        FROM products p
        LEFT JOIN (
            SELECT product_id, SUM(quantity) as total_qty
            FROM product_inventory
            GROUP BY product_id
        ) pi_sum ON pi_sum.product_id = p.id
        LEFT JOIN (
            SELECT si.product_id, GROUP_CONCAT(DISTINCT c.name) as supplier_names
            FROM supplier_items si
            JOIN contacts c ON si.supplier_id = c.id
            WHERE si.item_type = 'product'
            GROUP BY si.product_id
        ) sup_agg ON sup_agg.product_id = p.id
        WHERE COALESCE(p.is_active, 1) = 1
    """
    cur.execute("EXPLAIN QUERY PLAN " + unified_prod_sql)
    plan_steps = [r[3] for r in cur.fetchall()]
    assert not any("CORRELATED SCALAR SUBQUERY" in s for s in plan_steps), (
        f"Truy vấn tồn kho tổng hợp chứa CORRELATED SCALAR SUBQUERY gây đốt dòng đọc D1: {plan_steps}"
    )

    # 2. Truy vấn KPI Spa trong ngày phải dùng INDEX trên pet_service_tickets, cấm SCAN toàn bảng
    spa_kpi_sql = """
        SELECT
            COUNT(*) as app_today,
            COALESCE(SUM(CASE WHEN status = 'completed' AND (call_status = 'Chưa gọi' OR call_status IS NULL OR call_status = '') THEN 1 ELSE 0 END), 0) as uncalled,
            COALESCE(SUM(CASE WHEN status != 'checked_out' THEN 1 ELSE 0 END), 0) as not_checked_out,
            COALESCE(SUM(CASE WHEN status = 'checked_out' THEN 1 ELSE 0 END), 0) as checked_out
        FROM pet_service_tickets
        WHERE ticket_date = '2026-10-30'
    """
    cur.execute("EXPLAIN QUERY PLAN " + spa_kpi_sql)
    spa_plan = [r[3] for r in cur.fetchall()]
    assert any("SEARCH pet_service_tickets USING" in s for s in spa_plan), (
        f"Truy vấn KPI Spa không dùng index (sẽ quét toàn bộ 24.447 phiếu): {spa_plan}"
    )
    conn.close()


def test_core_endpoints_batch_queries_and_compact_contacts():
    """Kiểm tra các API cốt lõi và chế độ compact=1 cho danh sách khách hàng POS."""
    client = TestClient(app)
    headers = _get_auth_headers(client)

    # 1. GET /api/contacts?type=customer&compact=1 trả đủ các cột POS cần nhưng nhẹ hơn bản đầy đủ
    r_compact = client.get("/api/contacts?type=customer&compact=1", headers=headers)
    assert r_compact.status_code == 200
    c_rows = r_compact.json()
    assert isinstance(c_rows, list)
    if c_rows:
        sample = c_rows[0]
        for required_key in ("id", "name", "phone", "address", "points", "spa_wallet_balance", "price_list_id"):
            assert required_key in sample
        assert "calc_debt_company" not in sample
        assert "pets_count" not in sample

    # 2. GET /api/products, /api/inventory/unified, /api/pet-services/kpi, /api/ai/staff-briefing
    for ep in ("/api/products", "/api/inventory/unified", "/api/pet-services/kpi", "/api/ai/staff-briefing"):
        res = client.get(ep, headers=headers)
        assert res.status_code == 200, f"Endpoint {ep} failed with {res.status_code}: {res.text}"


def test_d1_batch_fallback_on_daily_row_read_limit():
    """Đảm bảo _send_batch (dùng bởi cur.executemany khi lưu cấu hình) tự động fallback khi D1 báo chạm trần đọc ngày."""
    import database

    class QuotaExceededHTTPClient:
        def post(self, url, json=None, headers=None):
            class Resp:
                status_code = 400
                text = "exceeded D1's free tier daily row read limit"

                def json(self):
                    return {
                        "success": False,
                        "errors": [
                            {
                                "code": 7500,
                                "message": "Your account has exceeded D1's free tier daily row read limit.",
                            }
                        ],
                    }

            return Resp()

    database._D1_QUOTA_EXCEEDED_UNTIL = 0.0
    conn = D1ConnectionWrapper(
        account_id="test_acc",
        database_id="e2d15172-test",
        api_token="test_tok",
        http_client=QuotaExceededHTTPClient(),
    )
    # Giả lập client sở hữu để kích hoạt nhánh fallback tự động
    conn._owns_client = True

    cur = conn.cursor()
    cur.executemany(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [("shop_name", "PetNT Test Fallback"), ("shop_phone", "0909000111")],
    )
    cur.execute("SELECT value FROM settings WHERE key = ?", ("shop_name",))
    row = cur.fetchone()
    assert row is not None
    assert row["value"] == "PetNT Test Fallback"
    database._D1_QUOTA_EXCEEDED_UNTIL = 0.0

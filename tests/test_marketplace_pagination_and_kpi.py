import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())

def test_marketplace_pagination_and_kpi():
    init_db()
    conn = get_db()
    cur = conn.cursor()

    # Tạo 15 đơn hàng test để kiểm tra phân trang (limit=5, page 1..3)
    cur.execute("DELETE FROM marketplace_order_items")
    cur.execute("DELETE FROM marketplace_orders")

    for i in range(1, 16):
        order_sn = f"TEST-PAG-ORD-{i:03d}"
        platform = "shopee" if i <= 10 else "tiktok"
        total_amt = 100000 * i
        net_amt = 90000 * i
        cur.execute("""
            INSERT INTO marketplace_orders (
                platform, order_sn, order_status, order_date, total_amount, net_payout, fee_fixed, buyer_username
            ) VALUES (?, ?, 'completed', '2026-10-16 10:00:00', ?, ?, 10000, ?)
        """, (platform, order_sn, total_amt, net_amt, f"user_{i}"))
        ord_id = cur.lastrowid
        
        # Thêm 2 items mỗi đơn
        cur.execute("""
            INSERT INTO marketplace_order_items (
                order_id, platform_product_name, quantity, unit_price, subtotal, mapped_product_id
            ) VALUES (?, 'Item Test A', 2, 50000, 100000, 1)
        """, (ord_id,))

    conn.commit()
    conn.close()

    # 1. Test KPI độc lập cho Shopee (10 đơn, mỗi đơn 2 món = 20 món)
    res_kpi = client.get("/api/marketplace/orders-kpi?platform=shopee")
    assert res_kpi.status_code == 200
    kpi = res_kpi.json()
    assert kpi["order_count"] == 10
    assert kpi["items_sold"] == 20
    assert kpi["mapped_ratio"] == 100
    assert kpi["total_revenue"] == sum(100000 * i for i in range(1, 11))

    # 2. Test Pagination page=1, limit=5
    res_p1 = client.get("/api/marketplace/orders?platform=shopee&page=1&limit=5")
    assert res_p1.status_code == 200
    data_p1 = res_p1.json()
    assert data_p1["total"] == 10
    assert data_p1["page"] == 1
    assert data_p1["limit"] == 5
    assert data_p1["total_pages"] == 2
    assert len(data_p1["orders"]) == 5
    # Kiểm tra batch loading items
    assert len(data_p1["orders"][0]["items"]) == 1
    assert data_p1["orders"][0]["items"][0]["platform_product_name"] == "Item Test A"

    # 3. Test Pagination page=2, limit=5
    res_p2 = client.get("/api/marketplace/orders?platform=shopee&page=2&limit=5")
    assert res_p2.status_code == 200
    data_p2 = res_p2.json()
    assert data_p2["page"] == 2
    assert len(data_p2["orders"]) == 5

    # 4. Test backward-compatibility: không truyền page -> trả về mảng trực tiếp
    res_compat = client.get("/api/marketplace/orders?platform=shopee&limit=5")
    assert res_compat.status_code == 200
    compat_data = res_compat.json()
    assert isinstance(compat_data, list)
    assert len(compat_data) == 5

    # 5. Test tìm kiếm q
    res_search = client.get("/api/marketplace/orders?platform=shopee&q=ORD-003&page=1&limit=10")
    assert res_search.status_code == 200
    search_data = res_search.json()
    assert search_data["total"] == 1
    assert search_data["orders"][0]["order_sn"] == "TEST-PAG-ORD-003"

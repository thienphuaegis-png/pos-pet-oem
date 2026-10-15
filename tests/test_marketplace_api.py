import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from routers.auth import _make_token
import datetime

client = TestClient(app)

def test_marketplace_full_flow():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()

        # Tạo staff admin
        cur.execute("INSERT OR REPLACE INTO staff (id, name, role, is_active, token_version) VALUES (8888, 'Owner Mkt', 'owner', 1, 0)")
        
        # Tạo 1 sản phẩm kho test
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, unit, sell_price, cost_price, stock, is_active)
            VALUES (7777, 'SP-TEST-MKT', 'Sữa Tắm Pet Test 500ml', 'product', 'Chai', 150000, 90000, 50, 1)
        """)

        conn.commit()
        conn.close()

        token = _make_token(8888, token_version=0)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Tạo tài khoản Shopee
        res_acc = client.post("/api/marketplace/accounts", headers=headers, json={
            "platform": "shopee",
            "shop_name": "PetCare Official Store",
            "cookies": "SPC_CDS=test_token_123; SPC_U=123"
        })
        assert res_acc.status_code == 200, res_acc.text
        acc_id = res_acc.json()["id"]

        # Lấy danh sách tài khoản
        res_list = client.get("/api/marketplace/accounts")
        assert res_list.status_code == 200
        assert any(a["id"] == acc_id for a in res_list.json())

        # 2. Tạo đơn hàng sàn và chi tiết mặt hàng
        conn = get_db()
        cur = conn.cursor()
        today_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cur.execute("""
            INSERT INTO marketplace_orders (platform, account_id, order_sn, order_status, order_date, total_amount, buyer_username)
            VALUES ('shopee', ?, 'SHOPEE-ORD-001', 'to_ship', ?, 300000, 'khach_hang_shopee')
        """, (acc_id, today_str))
        ord_id = cur.lastrowid

        cur.execute("""
            INSERT INTO marketplace_order_items (
                order_id, platform_item_id, platform_product_name, platform_variation, platform_sku, quantity, unit_price, subtotal
            ) VALUES (?, 'item_99', 'Sữa Tắm Chó Mèo 500ml', 'Chai 500ml', 'ST-500', 2, 150000, 300000)
        """, (ord_id,))
        conn.commit()
        conn.close()

        # 3. Lấy danh sách đơn hàng
        res_orders = client.get("/api/marketplace/orders")
        assert res_orders.status_code == 200
        orders = res_orders.json()
        assert len(orders) >= 1
        test_ord = next(o for o in orders if o["order_sn"] == "SHOPEE-ORD-001")
        assert len(test_ord["items"]) == 1
        assert test_ord["items"][0]["platform_product_name"] == "Sữa Tắm Chó Mèo 500ml"

        # 4. Kiểm tra danh sách chưa map
        res_unmapped = client.get("/api/marketplace/unmapped-items")
        assert res_unmapped.status_code == 200
        unmapped_names = [u["platform_product_name"] for u in res_unmapped.json()]
        assert "Sữa Tắm Chó Mèo 500ml" in unmapped_names

        # 5. Lưu luật ánh xạ (Map vào sản phẩm ID 7777)
        res_map = client.post("/api/marketplace/mappings", headers=headers, json={
            "platform": "shopee",
            "platform_sku": "ST-500",
            "platform_item_name": "Sữa Tắm Chó Mèo 500ml",
            "platform_variation": "Chai 500ml",
            "product_id": 7777
        })
        assert res_map.status_code == 200, res_map.text

        # Kiểm tra item đã được link vào product 7777
        res_orders_after = client.get("/api/marketplace/orders")
        test_ord_after = next(o for o in res_orders_after.json() if o["order_sn"] == "SHOPEE-ORD-001")
        assert test_ord_after["items"][0]["mapped_product_id"] == 7777

        # 6. Thống kê sản phẩm bán trong ngày
        res_analytics = client.get("/api/marketplace/analytics/daily-products")
        assert res_analytics.status_code == 200
        data_analytics = res_analytics.json()
        assert data_analytics["summary"]["shopee_sold_qty"] >= 2
        mapped_item = next((i for i in data_analytics["items"] if i["id"] == 7777), None)
        assert mapped_item is not None
        assert mapped_item["shopee_qty"] == 2
        assert mapped_item["total_qty"] >= 2

        # 7. AI Chat test
        res_ai = client.post("/api/marketplace/ai-analytics", json={
            "prompt": "Hôm nay tôi bán được bao nhiêu chai sữa tắm?"
        })
        assert res_ai.status_code == 200
        assert "reply" in res_ai.json()
        assert len(res_ai.json()["reply"]) > 10

        # 8. Test Import Excel đơn hàng
        import openpyxl, io
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["Mã đơn hàng", "Ngày đặt hàng", "Trạng thái", "Tên sản phẩm", "Phân loại", "Số lượng", "Đơn giá", "Tổng số tiền", "Người mua"])
        ws.append(["EXCEL-001", "2026-10-12 10:00:00", "Đã giao", "Sữa Tắm Chó Mèo 500ml", "Chai 500ml", 3, 150000, 450000, "nguyen_van_a"])
        excel_bio = io.BytesIO()
        wb.save(excel_bio)
        excel_bio.seek(0)

        res_excel = client.post(
            "/api/marketplace/orders/import-excel",
            files={"file": ("test_orders.xlsx", excel_bio, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"platform": "shopee"}
        )
        assert res_excel.status_code == 200, res_excel.text
        assert res_excel.json()["synced_orders"] >= 1

        # 9. Test Xóa đơn lẻ, xóa hàng loạt & dọn sạch
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id FROM marketplace_orders WHERE order_sn = 'EXCEL-001'")
        row_del = cur.fetchone()
        assert row_del is not None
        del_ord_id = row_del[0]
        conn.close()

        res_del_single = client.delete(f"/api/marketplace/orders/{del_ord_id}")
        assert res_del_single.status_code == 200

        res_del_bulk = client.post("/api/marketplace/orders/bulk-delete", json={"order_ids": [ord_id]})
        assert res_del_bulk.status_code == 200

        res_clear = client.delete("/api/marketplace/orders-clear-all?platform=shopee")
        assert res_clear.status_code == 200

    finally:
        app.dependency_overrides.update(saved_overrides)

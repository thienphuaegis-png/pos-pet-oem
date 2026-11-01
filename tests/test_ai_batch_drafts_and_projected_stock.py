import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from dependencies import get_current_user

client = TestClient(app)

def test_batch_create_drafts_and_projected_stock_update(tmp_path, monkeypatch):
    # DB trắng riêng: briefing chỉ trả top 200 SP tồn thấp, catalog thật (446 SP tồn <= 0) sẽ đẩy SP test ra ngoài
    monkeypatch.setenv("POS_DB_PATH", str(tmp_path / "pos.db"))
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Thủ Kho Phụng", "role": "warehouse"}
    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()

        # Seed 2 Suppliers (1 thương mại, 1 xưởng OEM có kho)
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type) VALUES (9009500, 'NCC Thức Ăn Hạt Hà Nội', 'supplier')")
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type) VALUES (9009600, 'Xưởng Sữa Tắm OEM Diamond', 'supplier')")
        cur.execute("INSERT OR IGNORE INTO warehouses (id, code, name, is_oem, supplier_id, is_active) VALUES (960, 'WH-960', 'Kho Xưởng Diamond', 1, 9009600, 1)")

        # SP 1 & 2 thuộc NCC 9009500 (chưa đặt)
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, min_stock, unit)
            VALUES (9501, 'HAT-01', 'Hạt Chó Con 500g', 'product', 1, 50000, 30000, 0, 10, 'gói')
        """)
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, min_stock, unit)
            VALUES (9502, 'HAT-02', 'Hạt Mèo Con 500g', 'product', 1, 60000, 35000, -2, 5, 'gói')
        """)
        cur.execute("INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (9009500, 'product', 9501, 30000)")
        cur.execute("INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (9009500, 'product', 9502, 35000)")

        # SP 3 & 4 thuộc Xưởng 9009600 (chưa đặt)
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, min_stock, unit)
            VALUES (9601, 'ST-01', 'Sữa Tắm Ve Rận 500ml', 'product', 1, 150000, 80000, 1, 10, 'chai')
        """)
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, min_stock, unit)
            VALUES (9602, 'ST-02', 'Sữa Tắm Trắng Lông 500ml', 'product', 1, 160000, 85000, 0, 8, 'chai')
        """)
        cur.execute("INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (9009600, 'product', 9601, 80000)")
        cur.execute("INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (9009600, 'product', 9602, 85000)")

        conn.commit()

        # 1. Gọi staff briefing trước khi đặt hàng: Cả 4 SP đều chưa đặt (is_ordered = False)
        res_bf1 = client.get("/api/ai/staff-briefing")
        assert res_bf1.status_code == 200, res_bf1.text
        d_bf1 = res_bf1.json()
        low_prods1 = {p["id"]: p for p in d_bf1["warehouse_kpi"]["low_stock_products"]}
        assert 9501 in low_prods1 and not low_prods1[9501]["is_ordered"]
        assert 9601 in low_prods1 and not low_prods1[9601]["is_ordered"]

        # 2. Test tạo nháp hàng loạt cho 1 đối tác (Xưởng OEM 9009600)
        res_batch1 = client.post("/api/ai/batch-create-drafts", json={"partner_id": 9009600})
        assert res_batch1.status_code == 200, res_batch1.text
        data_batch1 = res_batch1.json()
        assert data_batch1["success"] is True
        assert len(data_batch1["created_orders"]) == 1
        oem_order = data_batch1["created_orders"][0]
        assert oem_order["type"] == "oem"
        assert oem_order["items_count"] == 2
        oem_code = oem_order["code"]

        # 3. Gọi lại staff briefing sau khi tạo đơn OEM:
        # SP 9601 & 9602 phải được cập nhật ngay: is_ordered = True, on_order_code = oem_code
        res_bf2 = client.get("/api/ai/staff-briefing")
        assert res_bf2.status_code == 200, res_bf2.text
        d_bf2 = res_bf2.json()
        low_prods2 = {p["id"]: p for p in d_bf2["warehouse_kpi"]["low_stock_products"]}
        assert low_prods2[9601]["is_ordered"] is True
        assert low_prods2[9601]["on_order_code"] == oem_code
        assert low_prods2[9602]["is_ordered"] is True
        assert low_prods2[9602]["on_order_code"] == oem_code

        # 4. Test tạo nháp hàng loạt cho tất cả các đối tác còn lại (NCC 9009500)
        res_batch_all = client.post("/api/ai/batch-create-drafts", json={})
        assert res_batch_all.status_code == 200, res_batch_all.text
        data_batch_all = res_batch_all.json()
        assert data_batch_all["success"] is True
        # Phải gom SP của NCC 9009500 thành 1 PO
        po_orders = [o for o in data_batch_all["created_orders"] if o["partner_id"] == 9009500]
        assert len(po_orders) == 1
        po_code = po_orders[0]["code"]

        # 5. Gọi lại staff briefing: Cả 4 SP đều đã được lên đơn
        res_bf3 = client.get("/api/ai/staff-briefing")
        d_bf3 = res_bf3.json()
        low_prods3 = {p["id"]: p for p in d_bf3["warehouse_kpi"]["low_stock_products"]}
        assert low_prods3[9501]["is_ordered"] is True
        assert low_prods3[9501]["on_order_code"] == po_code
        assert low_prods3[9502]["is_ordered"] is True

        conn.close()
    finally:
        app.dependency_overrides = saved_overrides

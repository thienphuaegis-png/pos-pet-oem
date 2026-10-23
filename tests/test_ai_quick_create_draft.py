import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from dependencies import get_current_user

client = TestClient(app)

def test_ai_quick_create_draft_smart_grouping_and_staff_delete():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_user] = lambda: {"id": 99, "name": "Thu Ngân Test", "role": "cashier"}
    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()

        # Seed supplier & warehouse
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type) VALUES (8500, 'NCC Thức Ăn Tổng Hợp', 'supplier')")
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type) VALUES (8600, 'Xưởng May Đồ Pet Tổng Hợp', 'supplier')")
        cur.execute("INSERT OR IGNORE INTO warehouses (id, name, is_active) VALUES (1, 'Kho Tổng', 1)")

        # 1. Hai sản phẩm của NCC 8500 cùng chạm đáy tồn
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, min_stock, unit)
            VALUES (8501, 'SP-P1', 'Pate Chó Vị Bò', 'product', 1, 30000, 20000, 2, 10, 'lon')
        """)
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, min_stock, unit)
            VALUES (8502, 'SP-P2', 'Pate Mèo Vị Cá', 'product', 1, 25000, 15000, 1, 8, 'lon')
        """)
        cur.execute("INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (8500, 'product', 8501, 20000)")
        cur.execute("INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (8500, 'product', 8502, 15000)")

        # 2. Hai sản phẩm của Xưởng 8600 cùng chạm đáy tồn
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, min_stock, unit)
            VALUES (8601, 'SP-OEM-1', 'Đệm Ngủ Cho Chó', 'product', 1, 200000, 90000, 1, 5, 'cái')
        """)
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, min_stock, unit)
            VALUES (8602, 'SP-OEM-2', 'Vòng Cổ Khắc Tên', 'product', 1, 50000, 15000, 2, 6, 'cái')
        """)
        cur.execute("INSERT OR IGNORE INTO ingredients (id, code, name, unit, type) VALUES (8603, 'NVL-BONG', 'Bông Gòn', 'kg', 'IS_PHYSICAL')")
        cur.execute("INSERT OR REPLACE INTO product_bom (product_id, ingredient_id, quantity) VALUES (8601, 8603, 1)")
        cur.execute("INSERT OR REPLACE INTO product_bom (product_id, ingredient_id, quantity) VALUES (8602, 8603, 0.1)")
        cur.execute("INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (8600, 'product', 8601, 90000)")
        cur.execute("INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (8600, 'product', 8602, 15000)")

        conn.commit()

        # TEST A: Bấm tạo cho SP 8501 -> Tự động GOM cả SP 8502 của cùng NCC 8500 vào 1 đơn duy nhất
        res1 = client.post("/api/ai/quick-create-draft", json={"product_id": 8501})
        assert res1.status_code == 200, res1.text
        d1 = res1.json()
        assert d1["success"] is True
        assert d1["type"] == "purchase"
        assert d1["items_count"] == 2
        po_code = d1["code"]

        # Kiểm tra chi tiết đơn PO: có cả 8501 và 8502
        cur.execute("SELECT product_id, quantity FROM purchase_items WHERE purchase_id = ?", (d1["id"],))
        po_items = cur.fetchall()
        assert len(po_items) == 2
        p_ids = {it["product_id"] for it in po_items}
        assert 8501 in p_ids and 8502 in p_ids

        # TEST B: Bấm tạo cho SP 8601 -> Tự động GOM cả SP 8602 của Xưởng 8600 vào 1 đơn OEM duy nhất
        res2 = client.post("/api/ai/quick-create-draft", json={"product_id": 8601})
        assert res2.status_code == 200, res2.text
        d2 = res2.json()
        assert d2["success"] is True
        assert d2["type"] == "oem"
        assert d2["items_count"] == 2
        oem_id = d2["id"]
        oem_code = d2["code"]

        cur.execute("SELECT product_id, ordered_qty FROM oem_order_items WHERE order_id = ?", (oem_id,))
        oem_items = cur.fetchall()
        assert len(oem_items) == 2
        oem_p_ids = {it["product_id"] for it in oem_items}
        assert 8601 in oem_p_ids and 8602 in oem_p_ids

        # TEST C: Gọi lại quick-create-draft cho NCC 8500 -> GỘP vào đơn nháp hiện có, KHÔNG tạo mã PO mới
        res3 = client.post("/api/ai/quick-create-draft", json={"product_id": 8502})
        assert res3.status_code == 200, res3.text
        d3 = res3.json()
        assert d3["code"] == po_code

        # TEST D: Nhân viên (role='cashier') có quyền XÓA đơn nháp PO và OEM
        res_del_po = client.delete(f"/api/purchases/{po_code}")
        assert res_del_po.status_code == 200, res_del_po.text

        res_del_oem = client.delete(f"/api/oem/orders/{oem_id}")
        assert res_del_oem.status_code == 200, res_del_oem.text

        cur.execute("SELECT id FROM purchases WHERE code = ?", (po_code,))
        assert cur.fetchone() is None
        cur.execute("SELECT id FROM oem_orders WHERE id = ?", (oem_id,))
        assert cur.fetchone() is None

        # TEST E: Phiếu đã nhận (received) thì nhân viên KHÔNG được xóa (trả về 403)
        cur.execute("""
            INSERT INTO purchases (code, supplier_id, total_amount, paid_amount, status, fund_source)
            VALUES ('PN-TEST-RECEIVED', 8500, 100000, 100000, 'received', 'COMPANY')
        """)
        conn.commit()
        res_del_fail = client.delete("/api/purchases/PN-TEST-RECEIVED")
        assert res_del_fail.status_code == 403

        conn.close()
    finally:
        app.dependency_overrides = saved_overrides

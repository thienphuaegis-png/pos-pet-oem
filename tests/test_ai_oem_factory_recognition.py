import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from dependencies import get_current_user

client = TestClient(app)

def test_oem_factory_warehouse_recognition_no_bom():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin Test", "role": "owner"}
    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()

        # 1. Seed Xưởng OEM có kho xưởng (như T&D Diamond)
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type) VALUES (7700, 'Xưởng T&D Diamond Mock', 'supplier')")
        cur.execute("INSERT OR IGNORE INTO warehouses (id, code, name, is_oem, supplier_id, is_active) VALUES (770, 'WH-TD', 'Kho Xưởng T&D', 1, 7700, 1)")

        # Sản phẩm Sữa tắm không có BOM, thuộc xưởng T&D
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, min_stock, unit)
            VALUES (7701, 'ST-TD-01', 'Sữa Tắm Nấm 2L Test', 'product', 1, 350000, 0, 0, 10, 'can')
        """)
        cur.execute("INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (7700, 'product', 7701, 251000)")

        # 2. Seed Nhà phân phối thương mại thường (như Royal Canin - không có kho xưởng)
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type) VALUES (7800, 'Nhà Phân Phối Hạt Thương Mại', 'supplier')")
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, min_stock, unit)
            VALUES (7801, 'HAT-TM-01', 'Hạt Chó Con 1kg', 'product', 1, 120000, 75000, 1, 8, 'gói')
        """)
        cur.execute("INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (7800, 'product', 7801, 75000)")

        conn.commit()

        # TEST 1: Tạo nháp cho Sữa Tắm của Xưởng T&D (dù không có BOM) -> Bắt buộc nhận diện là OEM!
        res_oem = client.post("/api/ai/quick-create-draft", json={"product_id": 7701})
        assert res_oem.status_code == 200, res_oem.text
        d_oem = res_oem.json()
        assert d_oem["success"] is True
        assert d_oem["type"] == "oem", f"Kỳ vọng OEM nhưng lại ra {d_oem['type']}"
        assert d_oem["code"].startswith("OEM-")

        # Kiểm tra CSDL OEM: đơn giá lấy từ default_cost 251.000 đ chứ không phải 0 đ
        cur.execute("SELECT oem_warehouse_id, status, total_raw_amount FROM oem_orders WHERE id = ?", (d_oem["id"],))
        o_row = cur.fetchone()
        assert o_row["status"] == "DRAFT"
        assert o_row["oem_warehouse_id"] == 770
        assert o_row["total_raw_amount"] == 20.0 * 251000 # min_stock 10 * 2 = 20

        # TEST 2: Tạo nháp cho Hạt của Nhà Phân Phối Thương Mại -> Nhận diện là PO (purchase)
        res_po = client.post("/api/ai/quick-create-draft", json={"product_id": 7801})
        assert res_po.status_code == 200, res_po.text
        d_po = res_po.json()
        assert d_po["success"] is True
        assert d_po["type"] == "purchase"
        assert d_po["code"].startswith("PN")

        conn.close()
    finally:
        app.dependency_overrides = saved_overrides

import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from dependencies import get_current_user

client = TestClient(app)

def test_purchase_request_no_duplicate_lines_and_ai_hub_integration():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Thủ Kho Phụng", "role": "warehouse"}
    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()

        # Tạo 1 NCC
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type) VALUES (9910, 'Lucky Star Test Duplicate', 'supplier')")

        # Tạo 2 sản phẩm nước lau sàn
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, min_stock, unit)
            VALUES (9911, 'NLSBH1', 'Nước Lau Sàn hương Bạc Hà Test', 'product', 1, 50000, 26000, 0, 10, 'Chai')
        """)
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, min_stock, unit)
            VALUES (9912, 'NLSCS1', 'Nước Lau Sàn hương Chanh Sả Test', 'product', 1, 50000, 26000, 0, 10, 'Chai')
        """)

        # Giả lập lỗi thực tế: Mỗi sản phẩm bị liên kết nhiều dòng trong supplier_items (3 dòng lặp)
        cur.execute("DELETE FROM supplier_items WHERE product_id IN (9911, 9912)")
        for _ in range(3):
            cur.execute("INSERT INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (9910, 'product', 9911, 26000)")
            cur.execute("INSERT INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (9910, 'product', 9912, 26000)")

        conn.commit()
        conn.close()

        # 1. Nhân viên gửi phiếu yêu cầu 2 sản phẩm (mỗi món 1000 chai)
        res_create = client.post("/api/purchase-requests", json={
            "department": "store",
            "priority": "normal",
            "note": "Cần nhập gấp nước lau sàn",
            "items": [
                {"product_id": 9911, "quantity": 1000},
                {"product_id": 9912, "quantity": 1000}
            ]
        })
        assert res_create.status_code == 200, res_create.text
        req_id = res_create.json()["id"]
        req_code = res_create.json()["code"]

        conn = get_db()
        cur = conn.cursor()

        # 2. KIỂM THỬ TÁC NHÂN AI: Phiếu yêu cầu phải được đẩy thẳng vào AI Hub
        conn.close()
        res_ai = client.get("/api/ai/staff-briefing")
        assert res_ai.status_code == 200, res_ai.text
        ai_data = res_ai.json()
        wh_kpi = ai_data["warehouse_kpi"]
        assert "pending_purchase_requests" in wh_kpi
        assert wh_kpi["pending_request_count"] >= 1
        found_in_ai = [r for r in wh_kpi["pending_purchase_requests"] if r["code"] == req_code]
        assert len(found_in_ai) == 1, "Phiếu yêu cầu chưa xuất hiện trong AI Agent Hub!"
        assert found_in_ai[0]["item_count"] == 2
        assert found_in_ai[0]["total_qty"] == 2000.0

        # 3. KIỂM THỬ CHUYỂN PO: Bắt buộc CHỐNG NHÂN BẢN DÒNG (Chỉ đúng 2 dòng, không được thành 6 dòng)
        res_conv = client.post(f"/api/purchase-requests/{req_id}/convert-to-po")
        assert res_conv.status_code == 200, res_conv.text
        conv_data = res_conv.json()
        po_code = conv_data["purchase_code"]

        conn = get_db()
        cur = conn.cursor()

        # Kiểm tra chi tiết đơn PO sinh ra trong CSDL
        cur.execute("SELECT id, total_amount, subtotal_amount FROM purchases WHERE code = ?", (po_code,))
        po_row = cur.fetchone()
        assert po_row is not None
        # Tổng tiền đúng: 1000 * 26000 + 1000 * 26000 = 52.000.000 đ (KHÔNG PHẢI 156.000.000 đ)
        assert po_row["total_amount"] == 52000000.0

        cur.execute("SELECT COUNT(*) FROM purchase_items WHERE purchase_id = ?", (po_row["id"],))
        lines_count = cur.fetchone()[0]
        assert lines_count == 2, f"Lỗi nhân bản dòng: Kỳ vọng 2 dòng mặt hàng nhưng lại bị nhân thành {lines_count} dòng!"

        conn.close()
    finally:
        app.dependency_overrides = saved_overrides

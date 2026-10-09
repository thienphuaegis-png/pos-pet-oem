import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from server import app
from database import get_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def override_auth():
    from dependencies import get_current_user, require_permission
    mock_user = {"id": 1, "username": "admin", "role": "owner", "permissions": ["oem.manage"]}
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[require_permission("oem.manage")] = lambda: mock_user
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(require_permission("oem.manage"), None)

def test_oem_order_edit_and_delete_with_rollback():
    """Kiểm tra sửa và xóa đơn OEM ở trạng thái RECEIVED kèm hoàn tác tồn kho và sổ quỹ"""
    db = get_db()
    cur = db.cursor()

    # 1. Setup dữ liệu test: xưởng, kho xưởng, kho đích, nguyên liệu, sản phẩm, BOM
    cur.execute("INSERT INTO contacts (name, type) VALUES ('Xưởng Test OEM', 'supplier')")
    partner_id = cur.lastrowid

    cur.execute("INSERT INTO warehouses (name, is_oem, supplier_id) VALUES ('Kho Xưởng Test', 1, ?)", (partner_id,))
    oem_wh_id = cur.lastrowid

    cur.execute("INSERT INTO warehouses (name, is_oem) VALUES ('Kho Đích Test', 0)")
    dest_wh_id = cur.lastrowid

    cur.execute("INSERT INTO ingredients (code, name, unit, type) VALUES ('NL-CHAI-OEM', 'Chai Nhựa 250ml', 'chai', 'IS_PHYSICAL')")
    ing_id = cur.lastrowid

    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES ('SP-OEM-FIN', 'Sữa Tắm OEM', 'product', 30000, 70000, 0)")
    prod_id = cur.lastrowid

    # Định lượng BOM: 1 sản phẩm cần 1 chai nhựa
    cur.execute("INSERT INTO product_bom (product_id, ingredient_id, quantity) VALUES (?, ?, 1.0)", (prod_id, ing_id))

    # Tồn kho ban đầu của chai tại kho xưởng: 100 chai
    cur.execute("INSERT INTO inventory (warehouse_id, ingredient_id, quantity) VALUES (?, ?, 100.0)", (oem_wh_id, ing_id))

    # Tồn kho thành phẩm ban đầu tại kho đích: 0
    cur.execute("INSERT INTO product_inventory (warehouse_id, product_id, quantity) VALUES (?, ?, 0.0)", (dest_wh_id, prod_id))

    db.commit()
    db.close()

    # 2. Tạo đơn OEM: đặt 20 chai sữa tắm, cọc 200.000 đ
    create_payload = {
        "partner_id": partner_id,
        "oem_warehouse_id": oem_wh_id,
        "dest_warehouse_id": dest_wh_id,
        "expected_delivery_date": "2026-10-15",
        "discount_type": "percent",
        "discount_percent": 0.0,
        "vat_percent": 0.0,
        "deposit_amount": 200000.0,
        "fund_source": "COMPANY",
        "note": "Đơn test OEM",
        "items": [
            {
                "product_id": prod_id,
                "ordered_qty": 20.0,
                "unit_price": 25000.0
            }
        ]
    }

    res_create = client.post("/api/oem/orders", json=create_payload)
    assert res_create.status_code == 200, res_create.text
    order_id = res_create.json()["id"]

    # 3. Nhận hàng (receive): nhận đủ 20 chai, thanh toán phần còn lại
    # Lấy item_id của đơn hàng
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id FROM oem_order_items WHERE order_id = ?", (order_id,))
    item_id = cur.fetchone()["id"]
    db.close()

    rec_payload = {
        "items": [
            {
                "item_id": item_id,
                "received_qty": 20.0
            }
        ],
        "pay_remaining_now": True,
        "payment_fund_source": "COMPANY"
    }

    res_rec = client.post(f"/api/oem/orders/{order_id}/receive", json=rec_payload)
    assert res_rec.status_code == 200, res_rec.text

    # Kiểm tra tồn kho sau khi nhận:
    db = get_db()
    cur = db.cursor()
    # Thành phẩm tăng lên 20 tại kho đích
    cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (dest_wh_id, prod_id))
    assert cur.fetchone()["quantity"] == 20.0
    # Nguyên liệu tại kho xưởng giảm từ 100 xuống 80
    cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (oem_wh_id, ing_id))
    assert cur.fetchone()["quantity"] == 80.0
    # Phiếu chi cashbook đã được tạo
    cur.execute("SELECT COUNT(*) as cnt FROM cashbook WHERE ref_type = 'oem_order' AND ref_id = ?", (order_id,))
    assert cur.fetchone()["cnt"] >= 1
    db.close()

    # 4. Sửa đơn hàng (PUT /api/oem/orders/{order_id}) khi đơn đã RECEIVED -> phải thành công!
    update_payload = {
        "partner_id": partner_id,
        "oem_warehouse_id": oem_wh_id,
        "dest_warehouse_id": dest_wh_id,
        "expected_delivery_date": "2026-10-20",
        "discount_type": "percent",
        "discount_percent": 0.0,
        "vat_percent": 0.0,
        "fund_source": "COMPANY",
        "note": "Đơn test OEM đã sửa ghi chú",
        "items": [
            {
                "product_id": prod_id,
                "ordered_qty": 20.0,
                "unit_price": 26000.0
            }
        ]
    }
    res_upd = client.put(f"/api/oem/orders/{order_id}", json=update_payload)
    assert res_upd.status_code == 200, res_upd.text

    # 5. Xóa đơn hàng (DELETE /api/oem/orders/{order_id}) khi đơn đã RECEIVED -> Hoàn tác đồng bộ!
    res_del = client.delete(f"/api/oem/orders/{order_id}")
    assert res_del.status_code == 200, res_del.text

    # 6. Kiểm tra hoàn tác tồn kho & sổ quỹ:
    db = get_db()
    cur = db.cursor()
    # Đơn hàng trong oem_orders đã bị xóa
    cur.execute("SELECT * FROM oem_orders WHERE id = ?", (order_id,))
    assert cur.fetchone() is None

    # Thành phẩm tại kho đích bị trừ lại 20 (về 0)
    cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (dest_wh_id, prod_id))
    assert cur.fetchone()["quantity"] == 0.0

    # Nguyên liệu tại kho xưởng được hoàn trả lại 20 (trở lại 100)
    cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (oem_wh_id, ing_id))
    assert cur.fetchone()["quantity"] == 100.0

    # Toàn bộ phiếu chi cashbook của đơn hàng đã được xóa sạch
    cur.execute("SELECT COUNT(*) as cnt FROM cashbook WHERE ref_type = 'oem_order' AND ref_id = ?", (order_id,))
    assert cur.fetchone()["cnt"] == 0

    # Cleanup test data
    cur.execute("DELETE FROM product_bom WHERE product_id = ?", (prod_id,))
    cur.execute("DELETE FROM product_inventory WHERE product_id = ?", (prod_id,))
    cur.execute("DELETE FROM inventory WHERE ingredient_id = ?", (ing_id,))
    cur.execute("DELETE FROM products WHERE id = ?", (prod_id,))
    cur.execute("DELETE FROM ingredients WHERE id = ?", (ing_id,))
    cur.execute("DELETE FROM warehouses WHERE id IN (?, ?)", (oem_wh_id, dest_wh_id))
    cur.execute("DELETE FROM contacts WHERE id = ?", (partner_id,))
    db.commit()
    db.close()


def test_oem_order_frontend_elements():
    """Kiểm tra giao diện table và detail modal luôn có nút sửa xóa"""
    html = Path("templates/index.html").read_text(encoding="utf-8")
    assert 'id="modal-detail-oem"' in html
    assert 'deleteOEMOrderFromDetail' in html
    assert 'openModalEditOEM' in html

    prod_js = Path("static/js/modules/productions.js").read_text(encoding="utf-8")
    assert "openModalEditOEM" in prod_js
    assert "deleteOEMOrder" in prod_js
    assert "deleteOEMOrderFromDetail" in prod_js

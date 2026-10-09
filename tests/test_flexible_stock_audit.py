import pytest
from fastapi.testclient import TestClient
from server import app
from database import get_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def override_auth(monkeypatch):
    from dependencies import get_current_user, require_permission
    mock_user = {"id": 1, "username": "admin", "role": "owner", "permissions": ["inventory.manage"]}
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[require_permission("inventory.manage")] = lambda: mock_user
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(require_permission("inventory.manage"), None)

def test_selective_stock_audit():
    """Kiểm tra chỉ cân bằng các mặt hàng được chọn trong phiếu, giữ nguyên các món khác"""
    db = get_db()
    cur = db.cursor()

    # 1. Tạo kho và 3 sản phẩm test
    cur.execute("INSERT OR IGNORE INTO warehouses (name) VALUES ('Kho Test Audit')")
    cur.execute("SELECT id FROM warehouses WHERE name = 'Kho Test Audit'")
    wh_id = cur.fetchone()["id"]

    cur.execute("DELETE FROM products WHERE code IN ('SP-KK-1', 'SP-KK-2', 'SP-KK-3')")
    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES ('SP-KK-1', 'Hạt Mèo A', 'product', 50000, 80000, 10)")
    p1_id = cur.lastrowid
    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES ('SP-KK-2', 'Pate B', 'product', 15000, 25000, 20)")
    p2_id = cur.lastrowid
    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES ('SP-KK-3', 'Cát C', 'product', 40000, 60000, 30)")
    p3_id = cur.lastrowid

    # Đặt tồn kho ban đầu trong product_inventory
    cur.execute("INSERT INTO product_inventory (warehouse_id, product_id, quantity) VALUES (?, ?, ?)", (wh_id, p1_id, 10))
    cur.execute("INSERT INTO product_inventory (warehouse_id, product_id, quantity) VALUES (?, ?, ?)", (wh_id, p2_id, 20))
    cur.execute("INSERT INTO product_inventory (warehouse_id, product_id, quantity) VALUES (?, ?, ?)", (wh_id, p3_id, 30))
    db.commit()
    db.close()

    # 2. Gửi phiếu kiểm kê CHỈ CHỌN p1 và p2 (p1 lệch thành 8, p2 khớp 20). Không gửi p3!
    payload = {
        "warehouse_id": wh_id,
        "note": "Kiểm kê chọn lọc 2 món (Hạt Mèo A và Pate B)",
        "items": [
            {
                "item_type": "product",
                "item_id": p1_id,
                "system_qty": 10.0,
                "actual_qty": 8.0,
                "diff_qty": -2.0,
                "note": "Hao hụt rách bao"
            },
            {
                "item_type": "product",
                "item_id": p2_id,
                "system_qty": 20.0,
                "actual_qty": 20.0,
                "diff_qty": 0.0,
                "note": "Đủ hàng"
            }
        ]
    }

    res = client.post("/api/inventory/audit", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "audit_code" in data

    # 3. Kiểm tra cơ sở dữ liệu:
    db = get_db()
    cur = db.cursor()

    # p1 được cập nhật thành 8
    cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (wh_id, p1_id))
    assert cur.fetchone()["quantity"] == 8.0

    # p2 giữ nguyên 20
    cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (wh_id, p2_id))
    assert cur.fetchone()["quantity"] == 20.0

    # p3 KHÔNG HỀ BỊ THAY ĐỔI, vẫn nguyên 30
    cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (wh_id, p3_id))
    assert cur.fetchone()["quantity"] == 30.0

    # Kiểm tra chi tiết phiếu stock_audit_items chỉ có 2 dòng (p1 và p2), không có p3
    cur.execute("SELECT COUNT(*) as cnt FROM stock_audit_items WHERE audit_id = ?", (data["audit_id"],))
    assert cur.fetchone()["cnt"] == 2

    # Cleanup
    cur.execute("DELETE FROM stock_audit_items WHERE audit_id = ?", (data["audit_id"],))
    cur.execute("DELETE FROM stock_audits WHERE id = ?", (data["audit_id"],))
    cur.execute("DELETE FROM product_inventory WHERE warehouse_id = ?", (wh_id,))
    cur.execute("DELETE FROM products WHERE id IN (?, ?, ?)", (p1_id, p2_id, p3_id))
    db.commit()
    db.close()


def test_flexible_audit_frontend_elements():
    """Kiểm tra các thành phần UI checkbox, nút chọn nhanh và logic JS kiểm kê linh hoạt"""
    from pathlib import Path
    html = Path("templates/index.html").read_text(encoding="utf-8")
    assert 'id="chk-audit-select-all"' in html
    assert 'id="audit-sum-selected"' in html
    assert 'id="audit-btn-count"' in html
    assert 'selectOnlyDiffAuditItems' in html
    assert 'selectAllAuditItems' in html

    app_js = Path("static/js/app.js").read_text(encoding="utf-8")
    assert "toggleAuditItemSelect" in app_js
    assert "toggleSelectAllAuditItems" in app_js
    assert "selectOnlyDiffAuditItems" in app_js
    assert "removeAuditItemFromList" in app_js
    assert "is_selected !== false" in app_js


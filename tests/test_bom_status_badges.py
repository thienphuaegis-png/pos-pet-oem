import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from server import app
from database import get_db

client = TestClient(app)

def test_api_products_returns_bom_count():
    """Kiểm tra API /api/products trả về trường bom_count cho từng sản phẩm"""
    db = get_db()
    cur = db.cursor()

    # 1. Tạo 2 sản phẩm test: 1 sản phẩm có BOM, 1 sản phẩm không có BOM
    cur.execute("DELETE FROM products WHERE code IN ('SP-TEST-BOM-1', 'SP-TEST-BOM-2')")
    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES ('SP-TEST-BOM-1', 'Sản phẩm có BOM', 'product', 10000, 20000, 10)")
    p1_id = cur.lastrowid
    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES ('SP-TEST-BOM-2', 'Sản phẩm chưa có BOM', 'product', 15000, 30000, 5)")
    p2_id = cur.lastrowid

    # Tạo nguyên liệu test
    cur.execute("INSERT OR IGNORE INTO ingredients (code, name, unit, type) VALUES ('NL-TEST-1', 'Nguyên liệu test', 'cái', 'IS_PHYSICAL')")
    cur.execute("SELECT id FROM ingredients WHERE code = 'NL-TEST-1'")
    ing_id = cur.fetchone()["id"]

    # Gán BOM cho p1
    cur.execute("INSERT OR REPLACE INTO product_bom (product_id, ingredient_id, quantity) VALUES (?, ?, 2)", (p1_id, ing_id))
    db.commit()
    db.close()

    # 2. Gọi API GET /api/products
    res = client.get("/api/products")
    assert res.status_code == 200
    products = res.json()

    p1 = next((p for p in products if p["id"] == p1_id), None)
    p2 = next((p for p in products if p["id"] == p2_id), None)

    assert p1 is not None
    assert p1.get("bom_count") == 1

    assert p2 is not None
    assert p2.get("bom_count") == 0

    # Cleanup
    db = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM product_bom WHERE product_id = ?", (p1_id,))
    cur.execute("DELETE FROM products WHERE id IN (?, ?)", (p1_id, p2_id))
    cur.execute("DELETE FROM ingredients WHERE id = ?", (ing_id,))
    db.commit()
    db.close()


def test_bom_status_frontend_elements():
    """Kiểm tra giao diện HTML và hàm JS lọc và hiển thị badge BOM"""
    html = Path("templates/index.html").read_text(encoding="utf-8")
    assert 'id="bom-status-filter-pills"' in html
    assert 'id="btn-bom-filter-all"' in html
    assert 'id="btn-bom-filter-has"' in html
    assert 'id="btn-bom-filter-none"' in html
    assert 'id="bom-filter-count-all"' in html
    assert 'id="bom-filter-count-has"' in html
    assert 'id="bom-filter-count-none"' in html

    prod_js = Path("static/js/modules/productions.js").read_text(encoding="utf-8")
    assert "setBOMStatusFilter" in prod_js
    assert "updateBOMFilterCounts" in prod_js
    assert "currentBOMStatusFilter" in prod_js
    assert "⚡ Đã có BOM" in prod_js
    assert "⚪ Chưa có BOM" in prod_js

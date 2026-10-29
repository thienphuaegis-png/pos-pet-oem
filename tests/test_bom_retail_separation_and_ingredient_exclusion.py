import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from server import app
from database import get_db
from tests.auth_helpers import owner_auth_headers

client = TestClient(app)

def test_requires_bom_auto_detection_and_toggle():
    headers = owner_auth_headers()
    db = get_db()
    cur = db.cursor()

    # Dọn dẹp trước
    cur.execute("DELETE FROM products WHERE code IN ('SP-TEST-OEM-1', 'SP-TEST-RETAIL-1', 'SP-TEST-TOGGLE-1')")
    cur.execute("DELETE FROM ingredients WHERE code = 'NL-TEST-ING-1'")

    # 1. Tạo sản phẩm OEM có BOM
    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES ('SP-TEST-OEM-1', 'Xịt khử mùi OEM', 'product', 10000, 20000, 10)")
    p_oem_id = cur.lastrowid

    # 2. Tạo sản phẩm bán lẻ không BOM (Xẻng cát)
    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES ('SP-TEST-RETAIL-1', 'Xẻng cát bán lẻ', 'product', 5000, 15000, 50)")
    p_retail_id = cur.lastrowid

    # 3. Tạo sản phẩm để toggle
    cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock) VALUES ('SP-TEST-TOGGLE-1', 'Sản phẩm đổi trạng thái', 'product', 7000, 14000, 20)")
    p_toggle_id = cur.lastrowid

    # Tạo nguyên liệu và gán BOM cho p_oem_id
    cur.execute("INSERT INTO ingredients (code, name, unit, type) VALUES ('NL-TEST-ING-1', 'Vỏ chai 100ml', 'cái', 'IS_PHYSICAL')")
    ing_id = cur.lastrowid
    cur.execute("INSERT INTO product_bom (product_id, ingredient_id, quantity) VALUES (?, ?, 1)", (p_oem_id, ing_id))
    db.commit()
    db.close()

    # Kiểm tra GET /api/products
    res = client.get("/api/products", headers=headers)
    assert res.status_code == 200
    products = res.json()

    p_oem = next(p for p in products if p["id"] == p_oem_id)
    p_retail = next(p for p in products if p["id"] == p_retail_id)
    p_toggle = next(p for p in products if p["id"] == p_toggle_id)

    # p_oem có BOM -> requires_bom = 1
    assert p_oem.get("requires_bom") == 1
    assert p_oem.get("bom_count") == 1

    # p_retail không BOM -> requires_bom = 0
    assert p_retail.get("requires_bom") == 0
    assert p_retail.get("bom_count") == 0

    # Toggle p_toggle sang requires_bom = 1
    res_toggle_1 = client.post(f"/api/products/{p_toggle_id}/toggle-bom-requirement?requires_bom=1", headers=headers)
    assert res_toggle_1.status_code == 200
    assert res_toggle_1.json()["requires_bom"] == 1

    # Kiểm tra lại qua GET /api/products
    res2 = client.get("/api/products", headers=headers)
    p_toggle_after = next(p for p in res2.json() if p["id"] == p_toggle_id)
    assert p_toggle_after.get("requires_bom") == 1

    # Toggle lại về 0 (Bỏ qua BOM / Hàng bán lẻ)
    res_toggle_0 = client.post(f"/api/products/{p_toggle_id}/toggle-bom-requirement?requires_bom=0", headers=headers)
    assert res_toggle_0.status_code == 200
    assert res_toggle_0.json()["requires_bom"] == 0

    # Cleanup
    db = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM product_bom WHERE product_id = ?", (p_oem_id,))
    cur.execute("DELETE FROM products WHERE id IN (?, ?, ?)", (p_oem_id, p_retail_id, p_toggle_id))
    cur.execute("DELETE FROM ingredients WHERE id = ?", (ing_id,))
    db.commit()
    db.close()


def test_for_bom_excludes_ingredients_and_nl_codes():
    headers = owner_auth_headers()
    db = get_db()
    cur = db.cursor()

    cur.execute("DELETE FROM products WHERE code IN ('NL-1793173569276', 'GSCM-DUMMY', 'CAT-NL-DUMMY', 'SP-REAL-OEM-1')")
    cur.execute("DELETE FROM ingredients WHERE code = 'GSCM-DUMMY'")

    # 1. Nguyên liệu thật trong bảng ingredients
    cur.execute("INSERT INTO ingredients (code, name, unit, type) VALUES ('GSCM-DUMMY', 'Gà sấy cỏ mèo thô', 'Kg', 'IS_PHYSICAL')")
    ing_id = cur.lastrowid

    # 2. Sản phẩm trong products bị trùng mã với ingredients
    cur.execute("INSERT INTO products (code, name, type, sell_price) VALUES ('GSCM-DUMMY', 'Gà sấy cỏ mèo thô', 'product', 150000)")
    p_ing_dup = cur.lastrowid

    # 3. Sản phẩm trong products có mã NL-
    cur.execute("INSERT INTO products (code, name, type, sell_price) VALUES ('NL-1793173569276', 'Bộ chai nâu tròn 50', 'product', 3200)")
    p_nl_code = cur.lastrowid

    # 4. Sản phẩm có category = Nguyên liệu
    cur.execute("INSERT INTO products (code, name, type, category, sell_price) VALUES ('CAT-NL-DUMMY', 'Tem dán tròn 3cm', 'product', 'Nguyên liệu', 500)")
    p_nl_cat = cur.lastrowid

    # 5. Sản phẩm thật cần làm BOM
    cur.execute("INSERT INTO products (code, name, type, sell_price) VALUES ('SP-REAL-OEM-1', 'Xịt khử mùi hương cafe 100ml', 'product', 59000)")
    p_real = cur.lastrowid

    db.commit()
    db.close()

    # Gọi GET /api/products?for_bom=true
    res = client.get("/api/products?for_bom=true", headers=headers)
    assert res.status_code == 200
    returned_ids = [p["id"] for p in res.json()]

    # Các mã nguyên liệu không được xuất hiện
    assert p_ing_dup not in returned_ids, "Sản phẩm trùng mã nguyên liệu phải bị loại bỏ khỏi danh sách BOM"
    assert p_nl_code not in returned_ids, "Sản phẩm có mã NL- phải bị loại bỏ khỏi danh sách BOM"
    assert p_nl_cat not in returned_ids, "Sản phẩm thuộc nhóm Nguyên liệu phải bị loại bỏ khỏi danh sách BOM"

    # Sản phẩm thật phải có mặt
    assert p_real in returned_ids, "Sản phẩm thành phẩm thật phải có mặt trong danh sách BOM"

    # Cleanup
    db = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM products WHERE id IN (?, ?, ?, ?)", (p_ing_dup, p_nl_code, p_nl_cat, p_real))
    cur.execute("DELETE FROM ingredients WHERE id = ?", (ing_id,))
    db.commit()
    db.close()


def test_frontend_bom_filter_pills_and_functions():
    html = Path("templates/index.html").read_text(encoding="utf-8")
    assert 'id="btn-bom-filter-oem"' in html
    assert 'id="btn-bom-filter-has"' in html
    assert 'id="btn-bom-filter-retail"' in html
    assert 'id="bom-filter-count-oem"' in html
    assert 'id="bom-filter-count-retail"' in html

    prod_js = Path("static/js/modules/productions.js").read_text(encoding="utf-8")
    assert "toggleProductBOMRequirement" in prod_js
    assert "OEM_ALL" in prod_js
    assert "RETAIL" in prod_js
    assert "Bỏ qua BOM" in prod_js

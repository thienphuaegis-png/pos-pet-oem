import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())

PID = 37  # giữ ID gốc của kịch bản; DB trắng riêng nên không đụng catalog thật


@pytest.fixture(autouse=True)
def oem_fixture_db(tmp_path, monkeypatch):
    """DB trắng + seed SP 37 Quế Cam: BOM chai 5.800 + tem 1.400 + seal 100, đơn OEM Lucky Star 18.288 (CK 5%, VAT 8%)."""
    monkeypatch.setenv("POS_DB_PATH", str(tmp_path / "pos.db"))
    from database import init_db
    init_db()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO contacts (id, name, type) VALUES (10, 'Lucky Star', 'supplier')")
    cur.execute("INSERT INTO products (id, code, name, type, sell_price, cost_price, unit) VALUES (?, 'GC245', 'Nước Lau Sàn hương Quế Cam 1lít', 'product', 89000, 0, 'Chai')", (PID,))
    for name, price in [("Chai 1 lít", 5800), ("Tem Nước Lau Sàn hương Quế Cam", 1400), ("Seal", 100)]:
        cur.execute("INSERT INTO ingredients (name, type, unit) VALUES (?, 'IS_PHYSICAL', 'cái')", (name,))
        iid = cur.lastrowid
        cur.execute("INSERT INTO price_history (ingredient_id, purchase_price, effective_date) VALUES (?, ?, '2026-10-01')", (iid, price))
        cur.execute("INSERT INTO product_bom (product_id, ingredient_id, quantity) VALUES (?, ?, 1)", (PID, iid))
    cur.execute("INSERT INTO oem_orders (code, partner_id, discount_percent, vat_percent) VALUES ('OEM-TEST-QC', 10, 5, 8)")
    cur.execute("INSERT INTO oem_order_items (order_id, product_id, ordered_qty, unit_price) VALUES (?, ?, 1000, 18288)", (cur.lastrowid, PID))
    conn.commit()
    conn.close()


def test_oem_two_tier_cost_calculation_for_product_37():
    """
    Kiểm tra logic tính giá vốn 2 tầng cho sản phẩm OEM (Nước Lau Sàn hương Quế Cam 1lít - ID 37):
    - Tầng 1 (BOM bao bì): Chai 5.800 + Tem 1.400 + Seal 100 = 7.300 đ
    - Tầng 2 (Phí gia công xưởng Lucky Star gần nhất): 18.288 x (1 - 5%) x (1 + 8%) = 18.763,49 đ
    -> Tổng giá vốn thực tế = 26.063,49 đ
    -> Biên lợi nhuận thật = 89.000 - 26.063,49 = 62.936,51 đ
    """
    res = client.get("/api/products/37/bom")
    assert res.status_code == 200
    data = res.json()

    assert "bom_material_cost" in data
    assert "oem_processing_cost" in data
    assert "oem_factory_name" in data
    assert data["oem_factory_name"] == "Lucky Star"
    assert data["bom_material_cost"] == 7300.0
    assert abs(data["oem_processing_cost"] - 18763.49) < 0.1
    assert abs(data["cost_price"] - 26063.49) < 0.1
    assert abs(data["profit_margin"] - 62936.51) < 0.1

def test_recalculate_cost_api_updates_product_cost_price():
    """Kiểm tra gọi POST /api/products/37/recalculate-cost cập nhật đúng cost_price vào database"""
    res = client.post("/api/products/37/recalculate-cost")
    assert res.status_code == 200
    data = res.json()
    assert abs(data["cost_price"] - 26063.49) < 0.1

    # Kiểm tra trực tiếp bảng products trong DB
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT cost_price FROM products WHERE id = 37")
    row = cur.fetchone()
    conn.close()
    assert abs(row[0] - 26063.49) < 0.1

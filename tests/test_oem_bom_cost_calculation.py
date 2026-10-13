import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db

client = TestClient(app)

def test_oem_two_tier_cost_calculation_for_product_37():
    """
    Kiểm tra logic tính giá vốn 2 tầng cho sản phẩm OEM (Nước Lau Sàn hương Quế Cam 1lít - ID 37):
    - Tầng 1 (BOM bao bì): Chai 5.800 + Tem 1.400 + Seal 100 = 7.300 đ
    - Tầng 2 (Phí gia công xưởng Lucky Star gần nhất): 18.288 x (1 - 5%) x (1 + 8%) = 18.763,49 đ
    -> Tổng giá vốn thực tế = 26.063,49 đ
    -> Biên lợi nhuận thật = 89.000 - 26.063,49 = 62.936,51 đ
    """
    # Cập nhật giá tem quế cam trong price_history để đảm bảo tem = 1400 nếu chưa có
    conn = get_db()
    cur = conn.cursor()
    # Tìm tem quế cam (ID 164)
    cur.execute("SELECT id FROM ingredients WHERE name LIKE '%Tem Nước Lau Sàn hương Quế Cam%'")
    tem_row = cur.fetchone()
    if tem_row:
        tem_id = tem_row[0]
        cur.execute("SELECT id FROM price_history WHERE ingredient_id = ?", (tem_id,))
        if not cur.fetchone():
            cur.execute("INSERT INTO price_history (ingredient_id, purchase_price, effective_date) VALUES (?, 1400, '2026-10-01')", (tem_id,))
            conn.commit()
    conn.close()

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

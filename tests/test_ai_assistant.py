import pytest
from routers.ai_assistant import parse_text_offline
from starlette.testclient import TestClient
from server import app
from tests.auth_helpers import staff_auth_headers

client = TestClient(app)

def test_parse_text_offline():
    # Test case chi tiền ship
    r1 = parse_text_offline("chi 120k tiền ship cá hồi quỹ cty")
    assert r1["type"] == "out"
    assert r1["amount"] == 120000
    assert r1["fund_hint"] == "company"
    assert "vận chuyển" in r1["category"].lower() or "ship" in r1["category"].lower()

    # Test case thu tiền cọc
    r2 = parse_text_offline("thu coc khach hung 500.000 tien mat")
    assert r2["type"] == "in"
    assert r2["amount"] == 500000
    assert r2["fund_hint"] == "personal"
    assert "cọc" in r2["category"].lower()

    # Test case triệu đồng
    r3 = parse_text_offline("chi 2.5tr tien mat bang")
    assert r3["type"] == "out"
    assert r3["amount"] == 2500000

def test_api_parse_cashflow_text():
    res = client.post("/api/ai/parse-cashflow", json={
        "text": "chi 200k tiền nước uống quỹ cty"
    }, headers=staff_auth_headers("owner"))
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "out"
    assert data["amount"] == 200000
    assert "available_accounts" in data
    assert "is_duplicate" in data

def test_api_test_key_validation():
    # Test key rỗng
    res = client.post("/api/ai/test-key", json={"gemini_api_key": ""}, headers=staff_auth_headers("owner"))
    assert res.status_code == 400
    assert "Vui lòng nhập API Key" in res.json()["detail"]

def test_api_suggest_bom():
    from database import get_db
    conn = get_db()
    cur = conn.cursor()
    # Tạo sản phẩm test nếu chưa có (lưu ý có cột type)
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, category, sell_price, unit) VALUES (9999, 'TEST_SP_BOM', 'Sữa tắm cho chó Gemini 250ml', 'product', 'Sữa tắm', 199000, 'Chai')")
    cur.execute("INSERT OR REPLACE INTO ingredients (id, code, name, unit, type) VALUES (8881, 'NL_ST_TEST', 'Dung dịch sữa tắm', 'Lít', 'IS_PHYSICAL')")
    cur.execute("INSERT OR REPLACE INTO ingredients (id, code, name, unit, type) VALUES (8882, 'NL_CHAI_TEST', 'Chai nhựa nâu 250ml', 'Chai', 'IS_PHYSICAL')")
    conn.commit()
    conn.close()

    res = client.post("/api/ai/suggest-bom", json={"product_id": 9999}, headers=staff_auth_headers("owner"))
    assert res.status_code == 200
    data = res.json()
    assert data["product_id"] == 9999
    assert "suggestions" in data
    assert len(data["suggestions"]) >= 1

def test_api_clone_bom():
    from database import get_db
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, category, sell_price, unit) VALUES (9997, 'SP_SOURCE', 'Sữa tắm A', 'product', 'Sữa tắm', 100000, 'Chai')")
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, category, sell_price, unit) VALUES (9998, 'SP_TARGET', 'Sữa tắm B', 'product', 'Sữa tắm', 100000, 'Chai')")
    cur.execute("INSERT OR REPLACE INTO ingredients (id, code, name, unit, type) VALUES (8883, 'NL_TEST_CLONE', 'Dung dịch clone', 'Lít', 'IS_PHYSICAL')")
    cur.execute("INSERT OR REPLACE INTO product_bom (product_id, ingredient_id, quantity) VALUES (9997, 8883, 0.25)")
    conn.commit()
    conn.close()

    res = client.post("/api/products/9998/bom/clone-from/9997", headers=staff_auth_headers("owner"))
    assert res.status_code == 200
    data = res.json()
    assert any(item["ingredient_id"] == 8883 for item in data["bom_items"])

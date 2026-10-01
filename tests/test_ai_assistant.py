import pytest
from routers.ai_assistant import parse_text_offline
from starlette.testclient import TestClient
from server import app

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
    })
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "out"
    assert data["amount"] == 200000
    assert "available_accounts" in data
    assert "is_duplicate" in data

def test_api_test_key_validation():
    # Test key rỗng
    res = client.post("/api/ai/test-key", json={"gemini_api_key": ""})
    assert res.status_code == 400
    assert "Vui lòng nhập API Key" in res.json()["detail"]

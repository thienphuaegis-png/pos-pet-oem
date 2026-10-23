# tests/test_staff_list_no_secrets.py
from fastapi.testclient import TestClient
from server import app
from tests.auth_helpers import staff_auth_headers

client = TestClient(app)


def test_staff_list_hides_password_hash_and_ai_key():
    h = staff_auth_headers("cashier")
    r = client.post("/api/auth/my-ai-config", json={"ai_api_key": "AIzaLEAKCHECK1234567890"}, headers=h)
    assert r.status_code == 200, r.text
    try:
        res = client.get("/api/staff", headers=staff_auth_headers("staff"))
        assert res.status_code == 200, res.text
        rows = res.json()
        assert rows
        for row in rows:
            assert "password_hash" not in row
            assert "ai_api_key" not in row
            assert "token_version" not in row
            assert {"id", "name", "role", "commission_rate"} <= set(row)
    finally:
        client.post("/api/auth/my-ai-config", json={"ai_api_key": ""}, headers=h)

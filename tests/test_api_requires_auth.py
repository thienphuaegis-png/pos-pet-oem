# tests/test_api_requires_auth.py
import re
import pytest
from fastapi.testclient import TestClient
from server import app

PUBLIC = {
    ("POST", "/api/auth/login"),
    ("GET", "/api/ping"),
    ("GET", "/api/version"),
}


def _api_routes():
    # Lấy từ OpenAPI schema: ổn định qua các bản FastAPI (app.routes đã đổi cấu trúc ở 0.14x)
    out = set()
    for path, ops in app.openapi()["paths"].items():
        if not path.startswith("/api"):
            continue
        for method in ops:
            m = method.upper()
            if m in {"GET", "POST", "PUT", "PATCH", "DELETE"} and (m, path) not in PUBLIC:
                out.add((m, path))
    return sorted(out)


ROUTES = _api_routes()


def _fill(path):
    return re.sub(r"\{[^}]+\}", "1", path)


@pytest.fixture
def anon_client():
    saved = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.update(saved)


def test_route_inventory_is_not_empty():
    assert len(ROUTES) > 150


@pytest.mark.parametrize("method,path", ROUTES, ids=[f"{m} {p}" for m, p in ROUTES])
def test_api_rejects_anonymous(anon_client, method, path):
    res = anon_client.request(method, _fill(path))
    assert res.status_code == 401, f"{method} {path} trả {res.status_code} khi không có token"


def test_login_stays_open(anon_client):
    res = anon_client.post("/api/auth/login", data={"username": "khong_ton_tai", "password": "x"})
    assert res.status_code in (401, 429)
    assert res.json()["detail"] != "Not authenticated"


@pytest.mark.parametrize("path", ["/api/ping", "/api/version"])
def test_public_get_stays_open(anon_client, path):
    assert anon_client.get(path).status_code == 200

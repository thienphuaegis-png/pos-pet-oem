import pytest
import re
from pathlib import Path
from fastapi.testclient import TestClient
from server import app
from version_helper import get_app_version_info

client = TestClient(app)

@pytest.fixture(autouse=True)
def override_auth():
    from dependencies import get_current_user, require_role
    mock_user = {"id": 1, "username": "admin", "role": "owner"}
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[require_role("owner", "admin")] = lambda: mock_user
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(require_role("owner", "admin"), None)

def test_version_helper_metadata():
    """Kiểm tra helper phiên bản động trả về đúng cấu trúc"""
    info = get_app_version_info()
    assert info.get("version"), "Thiếu version"
    assert info.get("build_date"), "Thiếu build_date"
    assert info.get("commit_hash"), "Thiếu commit_hash"
    assert info.get("short_version"), "Thiếu short_version"
    assert isinstance(info.get("changelog"), list), "Changelog phải là danh sách"
    assert len(info["changelog"]) > 0, "Changelog không được rỗng"


def test_api_version_endpoint():
    """Kiểm tra endpoint GET /api/version trả về dữ liệu phiên bản và changelog"""
    res = client.get("/api/version")
    assert res.status_code == 200
    data = res.json()
    assert "version" in data
    assert "build_date" in data
    assert "commit_hash" in data
    assert "changelog" in data
    assert data["changelog"][0]["tag"] == data["version"]


def test_api_system_update_endpoints():
    """Kiểm tra endpoint check-update và apply-update"""
    res = client.get("/api/system/check-update")
    assert res.status_code == 200
    data = res.json()
    assert "update_available" in data
    assert "local_commit" in data


def test_api_ping_reflects_version():
    """Kiểm tra GET /api/ping đồng bộ phiên bản mới"""
    res = client.get("/api/ping")
    assert res.status_code == 200
    data = res.json()
    info = get_app_version_info()
    assert data["version"] == info["version"]


def test_html_dynamic_version_injection():
    """Kiểm tra server inject động version và cache-busting vào HTML index"""
    res = client.get("/")
    assert res.status_code == 200
    html = res.text
    info = get_app_version_info()

    # Kiểm tra version tag ở sidebar
    assert f"{info['version']} • {info['build_date']}" in html
    assert f'id="sidebar-version-collapsed"' in html
    assert f'title="{info["version"]}"' in html

    # Kiểm tra modal changelog và hàm mở modal
    assert 'id="modal-app-version"' in html
    assert 'openAppVersionModal' in html
    assert 'modal-v-changelog-body' in html

    # Kiểm tra cache-buster tự động cho các script
    assert re.search(rf"\.js\?v={info['commit_hash']}_\w+", html)

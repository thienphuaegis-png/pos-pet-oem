"""Test endpoint /api/ping — máy con quét LAN dựa vào endpoint này để nhận diện
đúng máy chủ POS (phân biệt với web server khác cùng port trong mạng).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)


def test_ping_returns_200():
    r = client.get("/api/ping")
    assert r.status_code == 200, f"Mong 200, nhận {r.status_code}"


def test_ping_app_identifier():
    data = client.get("/api/ping").json()
    assert data.get("app") == "pos-offline-petcare", \
        f"Máy con dựa vào field 'app' để nhận diện, nhận: {data.get('app')}"


def test_ping_has_hostname_and_version():
    data = client.get("/api/ping").json()
    assert data.get("hostname"), "Thiếu hostname"
    assert data.get("version"), "Thiếu version"


def test_ping_no_auth_required():
    # Không gửi cookie/token nào mà vẫn phải 200:
    # máy con phải dò được server TRƯỚC khi có ai đăng nhập.
    r = client.get("/api/ping", headers={})
    assert r.status_code == 200, "Ping phải mở, máy con dò trước khi login"


def test_ping_leaks_no_business_data():
    """Endpoint mở nên tuyệt đối không được trả dữ liệu kinh doanh."""
    data = client.get("/api/ping").json()
    assert set(data.keys()) == {"app", "version", "hostname"}, \
        f"Ping chỉ được trả app/version/hostname, nhận thêm: {set(data.keys())}"


if __name__ == "__main__":
    test_ping_returns_200();              print("✓ ping 200")
    test_ping_app_identifier();           print("✓ app identifier đúng")
    test_ping_has_hostname_and_version(); print("✓ có hostname + version")
    test_ping_no_auth_required();         print("✓ không cần auth")
    test_ping_leaks_no_business_data();   print("✓ không lộ dữ liệu")
    print("\nALL PASS ✅")

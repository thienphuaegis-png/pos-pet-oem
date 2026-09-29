import os
import sys

os.environ["DATABASE_URL"] = "postgresql://postgres.ifhlvbplslznumfpeojy:Sdt0388408876!@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
os.environ["VERCEL"] = "1"

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from fastapi.testclient import TestClient
from server import app

client = TestClient(app)

def test_endpoints():
    # 1. Test ping
    r = client.get("/api/ping")
    print("GET /api/ping:", r.status_code, r.json())
    assert r.status_code == 200

    # 2. Test products list
    r = client.get("/api/products")
    print("GET /api/products:", r.status_code, f"{len(r.json())} products found")
    assert r.status_code == 200
    assert len(r.json()) > 0

    # 3. Test contacts list
    r = client.get("/api/contacts")
    print("GET /api/contacts:", r.status_code, f"{len(r.json())} contacts found")
    assert r.status_code == 200
    assert len(r.json()) > 0

    # 4. Test root page (index.html)
    r = client.get("/")
    print("GET /:", r.status_code, f"HTML size: {len(r.text)} chars")
    assert r.status_code == 200
    assert "<!DOCTYPE html>" in r.text

    # 5. Test categories
    r = client.get("/api/categories")
    print("GET /api/categories:", r.status_code, f"{len(r.json())} categories found")
    assert r.status_code == 200

    print("\nALL END-TO-END SUPABASE API TESTS PASSED!")

if __name__ == "__main__":
    test_endpoints()

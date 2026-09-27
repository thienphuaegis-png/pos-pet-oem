import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from fastapi.testclient import TestClient
import sqlite3
import pytest
from server import app, invalidate_branding_cache

client = TestClient(app)

@pytest.fixture(autouse=True)
def preserve_branding():
    conn = sqlite3.connect("data/pos.db")
    cur = conn.cursor()
    cur.execute("SELECT key, value FROM settings WHERE key IN ('app_name', 'shop_logo')")
    orig = dict(cur.fetchall())
    conn.close()
    yield
    conn = sqlite3.connect("data/pos.db")
    cur = conn.cursor()
    if 'app_name' in orig:
        cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('app_name', ?)", (orig['app_name'],))
    if 'shop_logo' in orig:
        cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('shop_logo', ?)", (orig['shop_logo'],))
    conn.commit()
    conn.close()
    invalidate_branding_cache()

def test_login_page_injects_app_name_and_logo():
    # Setup test branding
    conn = sqlite3.connect("data/pos.db")
    cur = conn.cursor()
    cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('app_name', 'PetCare VIP')")
    cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('shop_logo', 'data:image/png;base64,TESTLOGO123')")
    conn.commit()
    conn.close()

    invalidate_branding_cache()

    res = client.get("/")
    assert res.status_code == 200
    html = res.text

    # Kiểm tra tên ứng dụng đã được inject vào tag login-store-name
    assert '<div id="login-store-name"' in html
    assert 'PetCare VIP</div>' in html

    # Kiểm tra logo đã được inject vào tag login-store-logo
    assert 'id="login-store-logo"' in html
    assert 'src="data:image/png;base64,TESTLOGO123"' in html
    assert 'id="login-store-icon" style="display:none;' in html

def test_login_page_fallback_when_no_logo():
    # Setup branding without logo
    conn = sqlite3.connect("data/pos.db")
    cur = conn.cursor()
    cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('app_name', 'Shop Test No Logo')")
    cur.execute("DELETE FROM settings WHERE key = 'shop_logo'")
    conn.commit()
    conn.close()

    invalidate_branding_cache()

    res = client.get("/")
    assert res.status_code == 200
    html = res.text

    assert 'Shop Test No Logo</div>' in html
    assert '<span id="login-store-icon"' in html
    assert 'display:none' not in html[html.find('id="login-store-icon"'):html.find('id="login-store-icon"') + 50]

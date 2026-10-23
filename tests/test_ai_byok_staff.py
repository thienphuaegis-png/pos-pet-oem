import pytest
from fastapi.testclient import TestClient
import database
from server import app
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())

@pytest.fixture
def setup_test_staff():
    database.init_db()
    conn = database.get_db()
    cur = conn.cursor()
    
    # 1. Tạo nhân viên mẫu test BYOK
    cur.execute("DELETE FROM staff WHERE username = 'staff_byok_test'")
    cur.execute("""
        INSERT INTO staff (name, username, role, is_active, ai_api_key, ai_model)
        VALUES ('Nhân Viên Test AI', 'staff_byok_test', 'cashier', 1, '', 'gemini-2.5-flash')
    """)
    staff_id = cur.lastrowid
    
    # 2. Cài key của shop trong settings để test fallback (lưu lại key cũ để restore sau test)
    cur.execute("SELECT value FROM settings WHERE key = 'gemini_api_key'")
    old_key_row = cur.fetchone()
    old_key_val = old_key_row[0] if old_key_row else None

    cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('gemini_api_key', 'AIzaSyShopDefaultKey123')")
    cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('gemini_model', 'gemini-2.5-flash')")

    conn.commit()
    conn.close()

    yield {
        "staff_id": staff_id
    }

    # Dọn dẹp sau test
    clean_conn = database.get_db()
    clean_cur = clean_conn.cursor()
    clean_cur.execute("DELETE FROM staff WHERE id = ?", (staff_id,))
    if old_key_val is not None:
        clean_cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('gemini_api_key', ?)", (old_key_val,))
    else:
        clean_cur.execute("DELETE FROM settings WHERE key = 'gemini_api_key'")
    clean_conn.commit()
    clean_conn.close()

def test_byok_config_endpoints(setup_test_staff):
    # 1. Đăng nhập hoặc gọi API /my-ai-config với current_user (owner)
    res = client.get("/api/auth/my-ai-config")
    assert res.status_code == 200
    data = res.json()
    assert "user_has_key" in data
    assert "shop_has_key" in data
    assert "active_source" in data

    # 2. Cập nhật key cá nhân
    update_res = client.post("/api/auth/my-ai-config", json={
        "ai_api_key": "AIzaSyCustomPersonalKey999",
        "ai_model": "gemini-1.5-pro"
    })
    assert update_res.status_code == 200
    assert update_res.json()["user_has_key"] is True

    # 3. Lấy lại cấu hình để kiểm tra key đã được che mờ
    res2 = client.get("/api/auth/my-ai-config")
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["user_has_key"] is True
    assert data2["active_source"] == "personal"
    assert "AIza" in data2["masked_key"]
    assert data2["ai_model"] == "gemini-1.5-pro"

    # 4. Kiểm tra helper get_gemini_config ưu tiên personal key
    from routers.ai_assistant import get_gemini_config
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM staff WHERE username = 'admin' OR id = 1")
    admin_user = dict(cur.fetchone())
    conn.close()

    cfg = get_gemini_config(admin_user)
    assert cfg["gemini_api_key"] == "AIzaSyCustomPersonalKey999"
    assert cfg["source"] == "personal"

    # 5. Xóa key cá nhân -> phải fallback về shop key
    client.post("/api/auth/my-ai-config", json={"ai_api_key": "", "ai_model": "gemini-2.5-flash"})
    cfg_fallback = get_gemini_config(admin_user)
    assert cfg_fallback["gemini_api_key"] == "AIzaSyShopDefaultKey123"
    assert cfg_fallback["source"] == "shop"

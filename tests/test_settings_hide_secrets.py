from fastapi.testclient import TestClient
from database import get_db
from server import app
from tests.auth_helpers import owner_auth_headers

SECRET_KEYS = ("gemini_api_key", "telegram_bot_token")


def test_get_settings_never_returns_secret_keys():
    db = get_db()
    cur = db.cursor()
    for k in SECRET_KEYS:
        cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, 'secret-test')", (k,))
    db.commit()
    db.close()

    data = TestClient(app, headers=owner_auth_headers()).get("/api/settings").json()
    for k in SECRET_KEYS:
        assert k not in data
    assert "shop_name" in data

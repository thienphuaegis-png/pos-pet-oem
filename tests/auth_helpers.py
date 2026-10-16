"""Helper cho test: header Bearer của tài khoản owner thật trong DB test (sau khi /api/* bắt buộc đăng nhập)."""
from database import get_db
from routers.auth import _make_token


def owner_auth_headers() -> dict:
    db = get_db()
    cur = db.cursor()
    cur.execute(
        "SELECT id, token_version FROM staff WHERE role IN ('owner', 'admin') AND is_active = 1 ORDER BY id LIMIT 1"
    )
    row = cur.fetchone()
    db.close()
    assert row, "DB test chưa có tài khoản owner/admin đang hoạt động"
    return {"Authorization": f"Bearer {_make_token(row['id'], row['token_version'] or 0)}"}

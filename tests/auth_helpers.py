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


def staff_auth_headers(role: str = "cashier") -> dict:
    db = get_db()
    cur = db.cursor()
    cur.execute(
        "SELECT id, token_version FROM staff WHERE role = ? AND is_active = 1 ORDER BY id LIMIT 1",
        (role,)
    )
    row = cur.fetchone()
    if not row:
        cur.execute(
            "INSERT INTO staff (name, role, is_active, token_version) VALUES (?, ?, 1, 0)",
            (f"Test {role}", role)
        )
        db.commit()
        staff_id = cur.lastrowid
        token_version = 0
    else:
        staff_id = row["id"]
        token_version = row["token_version"] or 0
    db.close()
    return {"Authorization": f"Bearer {_make_token(staff_id, token_version)}"}

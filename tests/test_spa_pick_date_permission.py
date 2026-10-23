import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_perm_key_registered_and_owner_has_it():
    from dependencies import check_permission
    from routers.settings import PERM_KEYS
    assert "spa.pick_date" in PERM_KEYS
    assert check_permission(1, "owner", "spa.pick_date") is True


def test_roles_do_not_get_pick_date_by_default():
    from database import get_db
    from dependencies import check_permission
    db = get_db()
    ids = {r["role"]: r["id"] for r in db.execute("SELECT id, role FROM staff WHERE role IN ('cashier','accountant','warehouse','staff')")}
    db.close()
    for role, sid in ids.items():
        assert check_permission(sid, role, "spa.pick_date") is False, role


def test_date_strip_shows_only_past_and_today():
    js = (ROOT / "static/js/modules/spa.js").read_text(encoding="utf-8")
    m = re.search(r"for \(let offset = (-?\d+); offset <= (-?\d+); offset\+\+\)", js)
    assert m and (m.group(1), m.group(2)) == ("-2", "0"), "dải ngày phải là hôm kia..hôm nay (3 ô, không ngày tương lai)"
    assert "canPickSpaDate" in js and "spa.pick_date" in js

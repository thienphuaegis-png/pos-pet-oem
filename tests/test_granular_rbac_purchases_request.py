import pytest
from fastapi.testclient import TestClient
from server import app
from routers.settings import PERM_KEYS
from dependencies import check_permission, get_user_effective_permissions
from database import get_db

client = TestClient(app)

def test_purchases_request_registered_in_perm_keys():
    assert "purchases.request" in PERM_KEYS

def test_purchases_request_in_staff_js_and_html():
    with open("static/js/staff.js", "r", encoding="utf-8") as f:
        staff_js = f.read()
    assert '"purchases.request":' in staff_js

    with open("templates/index.html", "r", encoding="utf-8") as f:
        html = f.read()
    assert 'data-tab="purchase-requests"' in html
    assert 'data-perm="purchases.request"' in html
    assert 'data-perm="inventory.manage"' in html
    assert 'data-perm="purchases.manage"' in html

def test_rbac_database_seed_and_defaults():
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT role, allowed FROM role_permissions WHERE perm_key = 'purchases.request'")
    rows = dict(cur.fetchall())
    db.close()

    assert rows.get("warehouse") == 1
    assert rows.get("cashier") == 1
    assert rows.get("accountant") == 1

def test_override_staff_permission_granular():
    db = get_db()
    cur = db.cursor()
    # Tìm hoặc tạo 1 nhân viên kho test
    cur.execute("SELECT id FROM staff WHERE role = 'warehouse' LIMIT 1")
    row = cur.fetchone()
    if not row:
        cur.execute("INSERT INTO staff (name, username, password_hash, role, is_active) VALUES ('Thủ Kho Test', 'kholite', 'hash', 'warehouse', 1)")
        db.commit()
        staff_id = cur.lastrowid
    else:
        staff_id = row[0]

    # Cấp purchases.request = 1, tước purchases.manage = 0, inventory.manage = 0
    cur.execute("INSERT OR REPLACE INTO staff_permissions (staff_id, perm_key, allowed) VALUES (?, 'purchases.request', 1)", (staff_id,))
    cur.execute("INSERT OR REPLACE INTO staff_permissions (staff_id, perm_key, allowed) VALUES (?, 'purchases.manage', 0)", (staff_id,))
    cur.execute("INSERT OR REPLACE INTO staff_permissions (staff_id, perm_key, allowed) VALUES (?, 'inventory.manage', 0)", (staff_id,))
    db.commit()
    db.close()

    assert check_permission(staff_id, "warehouse", "purchases.request") is True
    assert check_permission(staff_id, "warehouse", "purchases.manage") is False
    assert check_permission(staff_id, "warehouse", "inventory.manage") is False

    effective = get_user_effective_permissions(staff_id, "warehouse")
    assert "purchases.request" in effective
    assert "purchases.manage" not in effective
    assert "inventory.manage" not in effective

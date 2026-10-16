import os
import glob
import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db, get_db_path
from tests.auth_helpers import owner_auth_headers, staff_auth_headers


@pytest.fixture(autouse=True)
def isolate_overrides():
    saved = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(saved)


def test_regular_staff_forbidden_on_bulk_and_clear():
    init_db()
    headers = staff_auth_headers(role="cashier")
    client = TestClient(app, headers=headers)

    # 1. Clear all products
    res = client.delete("/api/products/clear/all-products")
    assert res.status_code == 403, f"Expected 403, got {res.status_code}"

    # 2. Bulk delete products
    res = client.post("/api/products/bulk-delete", json={"product_ids": [1, 2]})
    assert res.status_code == 403, f"Expected 403, got {res.status_code}"

    # 3. Clear all marketplace orders
    res = client.delete("/api/marketplace/orders-clear-all")
    assert res.status_code == 403, f"Expected 403, got {res.status_code}"

    # 4. Bulk delete marketplace orders
    res = client.post("/api/marketplace/orders/bulk-delete", json={"order_ids": [1, 2]})
    assert res.status_code == 403, f"Expected 403, got {res.status_code}"

    # 5. Delete hotel room
    res = client.delete("/api/hotel/rooms/999")
    assert res.status_code == 403, f"Expected 403, got {res.status_code}"

    # 6. Delete category without inventory.manage
    res = client.delete("/api/categories/999")
    assert res.status_code == 403, f"Expected 403, got {res.status_code}"


def test_warehouse_cannot_bulk_clear_but_can_manage_individual():
    init_db()
    wh_headers = staff_auth_headers(role="warehouse")
    client = TestClient(app, headers=wh_headers)

    # Warehouse cannot clear all products
    res = client.delete("/api/products/clear/all-products")
    assert res.status_code == 403

    # Warehouse cannot bulk delete products
    res = client.post("/api/products/bulk-delete", json={"product_ids": [1, 2]})
    assert res.status_code == 403


def test_owner_clear_all_products_creates_backup():
    import shutil
    init_db()
    owner_headers = owner_auth_headers()
    client = TestClient(app, headers=owner_headers)

    from backup_service import safe_sqlite_copy
    db_path = get_db_path()
    snapshot_path = db_path + ".test_snapshot"

    conn = get_db()
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.close()
    safe_sqlite_copy(db_path, snapshot_path)

    try:
        # Insert a dummy product
        conn = get_db()
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, sell_price, cost_price, is_active) VALUES (99991, 'P_CLEAR_TEST', 'Clear Test', 'product', 10000, 5000, 1)")
        conn.commit()
        conn.close()

        backup_dir = os.path.join(os.path.dirname(db_path), "backups")
        before_backups = set(glob.glob(os.path.join(backup_dir, "pos_backup_pre_clear_products_*.db")))

        res = client.delete("/api/products/clear/all-products")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

        after_backups = set(glob.glob(os.path.join(backup_dir, "pos_backup_pre_clear_products_*.db")))
        new_backups = after_backups - before_backups
        assert len(new_backups) >= 1, "Expected backup snapshot to be created before clear"

        for f in new_backups:
            try:
                os.remove(f)
            except OSError:
                pass
    finally:
        conn = get_db()
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.close()
        safe_sqlite_copy(snapshot_path, db_path)
        try:
            os.remove(snapshot_path)
        except OSError:
            pass

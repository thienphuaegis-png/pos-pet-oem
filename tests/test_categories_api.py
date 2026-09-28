import sys
import os
import pytest
from starlette.testclient import TestClient

# Ensure root dir is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from server import app
from database import get_db, init_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_data():
    init_db()
    conn = get_db()
    cur = conn.cursor()
    # Clean up test categories and test products if any
    cur.execute("DELETE FROM products WHERE code LIKE 'TEST_CAT_%'")
    cur.execute("DELETE FROM product_categories WHERE name LIKE 'Test_%'")
    conn.commit()
    conn.close()
    yield
    # Cleanup after test
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM products WHERE code LIKE 'TEST_CAT_%'")
    cur.execute("DELETE FROM product_categories WHERE name LIKE 'Test_%'")
    conn.commit()
    conn.close()

def test_get_categories():
    response = client.get("/api/categories")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    names = [c["name"] for c in data]
    assert "Khác" in names
    for item in data:
        assert "id" in item
        assert "name" in item
        assert "product_count" in item
        assert "sort_order" in item

def test_post_category_success_and_duplicate():
    # 1. Success
    payload = {
        "name": "Test_Pate_Meo",
        "description": "Thức ăn ướt cho mèo",
        "sort_order": 99
    }
    response = client.post("/api/categories", json=payload)
    assert response.status_code == 200
    cat = response.json()
    assert cat["id"] is not None
    assert cat["name"] == "Test_Pate_Meo"
    assert cat["description"] == "Thức ăn ướt cho mèo"
    assert cat["sort_order"] == 99

    # 2. Duplicate (case-insensitive)
    dup_payload = {
        "name": "test_pate_meo",
        "description": "Trùng tên",
        "sort_order": 1
    }
    dup_response = client.post("/api/categories", json=dup_payload)
    assert dup_response.status_code == 400
    assert "tồn tại" in dup_response.json()["detail"].lower()

def test_put_category_rename_and_sync_products():
    # 1. Create a category
    res = client.post("/api/categories", json={"name": "Test_Cat_Sync", "sort_order": 10})
    assert res.status_code == 200
    cat_id = res.json()["id"]

    # 2. Insert products belonging to this category
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO products (code, name, type, category, sell_price, cost_price) VALUES (?, ?, ?, ?, ?, ?)",
        ("TEST_CAT_P1", "Cat Sync Product 1", "product", "Test_Cat_Sync", 50000, 30000)
    )
    cur.execute(
        "INSERT INTO products (code, name, type, category, sell_price, cost_price) VALUES (?, ?, ?, ?, ?, ?)",
        ("TEST_CAT_P2", "Cat Sync Product 2", "product", "Test_Cat_Sync", 60000, 35000)
    )
    conn.commit()
    conn.close()

    # 3. Update category name
    update_res = client.put(f"/api/categories/{cat_id}", json={
        "name": "Test_Cat_Renamed",
        "description": "Updated desc",
        "sort_order": 20
    })
    assert update_res.status_code == 200
    updated_cat = update_res.json()
    assert updated_cat["name"] == "Test_Cat_Renamed"

    # 4. Verify products' category updated
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT category FROM products WHERE code IN ('TEST_CAT_P1', 'TEST_CAT_P2')")
    rows = cur.fetchall()
    conn.close()
    assert len(rows) == 2
    for r in rows:
        assert r["category"] == "Test_Cat_Renamed"

def test_delete_category_prevent_khac_and_migrate_to_khac():
    # 1. Try to delete 'Khác'
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM product_categories WHERE name = 'Khác'")
    khac_row = cur.fetchone()
    assert khac_row is not None
    khac_id = khac_row["id"]
    conn.close()

    del_khac_res = client.delete(f"/api/categories/{khac_id}")
    assert del_khac_res.status_code == 400
    assert "Không thể xóa nhóm mặc định 'Khác'" in del_khac_res.json()["detail"]

    # 2. Create custom category
    res = client.post("/api/categories", json={"name": "Test_To_Delete", "sort_order": 5})
    assert res.status_code == 200
    cat_id = res.json()["id"]

    # 3. Insert product belonging to this category
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO products (code, name, type, category, sell_price, cost_price) VALUES (?, ?, ?, ?, ?, ?)",
        ("TEST_CAT_P3", "Product to be migrated to Khác", "product", "Test_To_Delete", 20000, 10000)
    )
    conn.commit()
    conn.close()

    # 4. Delete custom category
    del_res = client.delete(f"/api/categories/{cat_id}")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    # 5. Verify category is deleted
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM product_categories WHERE id = ?", (cat_id,))
    assert cur.fetchone() is None

    # 6. Verify product migrated to 'Khác'
    cur.execute("SELECT category FROM products WHERE code = 'TEST_CAT_P3'")
    prod = cur.fetchone()
    conn.close()
    assert prod is not None
    assert prod["category"] == "Khác"

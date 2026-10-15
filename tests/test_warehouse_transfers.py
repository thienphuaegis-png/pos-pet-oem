from fastapi.testclient import TestClient
from server import app
from database import get_db

def test_warehouse_transfer_product_and_ingredient():
    client = TestClient(app)
    
    # 1. Login
    login_res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Setup warehouses and items in DB
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM warehouses ORDER BY id LIMIT 2")
    wh_rows = cur.fetchall()
    assert len(wh_rows) >= 2, "Cần ít nhất 2 kho"
    from_wh = wh_rows[0]["id"]
    to_wh = wh_rows[1]["id"]
    
    cur.execute("SELECT id, name FROM products LIMIT 1")
    prod = cur.fetchone()
    prod_id = prod["id"]
    
    # Ensure source warehouse has inventory
    cur.execute('''
        INSERT INTO product_inventory (warehouse_id, product_id, quantity)
        VALUES (?, ?, 50)
        ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = 50
    ''', (from_wh, prod_id))

    # Also test ingredient
    cur.execute("SELECT id, name FROM ingredients WHERE type = 'IS_PHYSICAL' LIMIT 1")
    ing = cur.fetchone()
    ing_id = None
    if ing:
        ing_id = ing["id"]
        cur.execute('''
            INSERT INTO inventory (warehouse_id, ingredient_id, quantity)
            VALUES (?, ?, 30)
            ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET quantity = 30
        ''', (from_wh, ing_id))

    conn.commit()
    conn.close()
    
    # 3. Create transfer with frontend payload format (using item_id)
    items_to_transfer = [
        {
            "item_type": "product",
            "item_id": prod_id,
            "quantity": 3
        }
    ]
    if ing_id:
        items_to_transfer.append({
            "item_type": "ingredient",
            "item_id": ing_id,
            "quantity": 2
        })

    payload = {
        "from_warehouse_id": from_wh,
        "to_warehouse_id": to_wh,
        "note": "Test chuyen kho tu dong",
        "items": items_to_transfer
    }
    res = client.post("/api/inventory/transfer", json=payload, headers=headers)
    assert res.status_code == 200, f"Tao phieu chuyen kho that bai: {res.text}"
    data = res.json()
    assert data["status"] == "ok"
    assert "code" in data
    assert "transfer_code" in data
    assert "id" in data
    transfer_id = data["id"]
    
    # 4. Get transfer detail
    detail_res = client.get(f"/api/inventory/transfers/{transfer_id}", headers=headers)
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["id"] == transfer_id
    assert detail["from_warehouse_id"] == from_wh
    assert detail["to_warehouse_id"] == to_wh
    assert len(detail["items"]) == len(items_to_transfer)
    assert detail["items"][0]["quantity"] == 3
    assert detail["items"][0]["name"] is not None
    assert "created_by" in detail, "Phiếu chuyển kho phải có trường created_by"
    assert detail["created_by"] is not None and detail["created_by"] != ""
    
    # 5. List transfers
    list_res = client.get("/api/inventory/transfers", headers=headers)
    assert list_res.status_code == 200
    items = list_res.json()
    assert any(t["id"] == transfer_id for t in items)

def test_delete_warehouse_transfer_rollback():
    """Kiểm tra xóa phiếu chuyển kho: hoàn tác số lượng về kho xuất và trừ thu hồi khỏi kho nhập."""
    client = TestClient(app)
    login_res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM warehouses ORDER BY id LIMIT 2")
    wh_rows = cur.fetchall()
    from_wh = wh_rows[0]["id"]
    to_wh = wh_rows[1]["id"]

    cur.execute("SELECT id, name FROM products LIMIT 1")
    prod = cur.fetchone()
    prod_id = prod["id"]

    # Đặt tồn ban đầu
    cur.execute('''
        INSERT INTO product_inventory (warehouse_id, product_id, quantity)
        VALUES (?, ?, 100)
        ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = 100
    ''', (from_wh, prod_id))
    cur.execute('''
        INSERT INTO product_inventory (warehouse_id, product_id, quantity)
        VALUES (?, ?, 10)
        ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = 10
    ''', (to_wh, prod_id))
    conn.commit()
    conn.close()

    # Tạo phiếu chuyển 10 sản phẩm
    create_res = client.post("/api/inventory/transfer", json={
        "from_warehouse_id": from_wh,
        "to_warehouse_id": to_wh,
        "note": "Chuyển để test xóa",
        "items": [{"item_type": "product", "item_id": prod_id, "quantity": 10}]
    }, headers=headers)
    assert create_res.status_code == 200
    transfer_id = create_res.json()["id"]

    # Kiểm tra tồn sau khi chuyển
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (from_wh, prod_id))
    assert cur.fetchone()["quantity"] == 90
    cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (to_wh, prod_id))
    assert cur.fetchone()["quantity"] == 20
    conn.close()

    # Gọi DELETE xóa phiếu
    del_res = client.delete(f"/api/inventory/transfers/{transfer_id}", headers=headers)
    assert del_res.status_code == 200

    # Kiểm tra hoàn tác tồn kho (Kho xuất +10 thành 100, Kho nhập -10 thành 10)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (from_wh, prod_id))
    assert cur.fetchone()["quantity"] == 100
    cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (to_wh, prod_id))
    assert cur.fetchone()["quantity"] == 10
    conn.close()

    # Kiểm tra phiếu không còn tồn tại
    detail_res = client.get(f"/api/inventory/transfers/{transfer_id}", headers=headers)
    assert detail_res.status_code == 404

def test_update_warehouse_transfer_rollback_and_reapply():
    """Kiểm tra sửa phiếu chuyển kho: hoàn tác số lượng cũ, áp dụng số lượng mới, lưu vết updated_by."""
    client = TestClient(app)
    login_res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM warehouses ORDER BY id LIMIT 2")
    wh_rows = cur.fetchall()
    from_wh = wh_rows[0]["id"]
    to_wh = wh_rows[1]["id"]

    cur.execute("SELECT id, name FROM products LIMIT 1")
    prod = cur.fetchone()
    prod_id = prod["id"]

    # Đặt tồn ban đầu kho xuất = 50, kho nhập = 0
    cur.execute('''
        INSERT INTO product_inventory (warehouse_id, product_id, quantity)
        VALUES (?, ?, 50)
        ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = 50
    ''', (from_wh, prod_id))
    cur.execute('''
        INSERT INTO product_inventory (warehouse_id, product_id, quantity)
        VALUES (?, ?, 0)
        ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = 0
    ''', (to_wh, prod_id))
    conn.commit()
    conn.close()

    # Tạo phiếu chuyển 10 món
    create_res = client.post("/api/inventory/transfer", json={
        "from_warehouse_id": from_wh,
        "to_warehouse_id": to_wh,
        "note": "Ban dau chuyen 10",
        "items": [{"item_type": "product", "item_id": prod_id, "quantity": 10}]
    }, headers=headers)
    assert create_res.status_code == 200
    transfer_id = create_res.json()["id"]

    # Gọi PUT sửa thành 15 món
    put_res = client.put(f"/api/inventory/transfers/{transfer_id}", json={
        "from_warehouse_id": from_wh,
        "to_warehouse_id": to_wh,
        "note": "Sua lai thanh 15",
        "items": [{"item_type": "product", "item_id": prod_id, "quantity": 15}]
    }, headers=headers)
    assert put_res.status_code == 200

    # Kiểm tra tồn sau khi sửa (50 ban đầu - 15 = 35 ở kho xuất, 15 ở kho nhập)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (from_wh, prod_id))
    assert cur.fetchone()["quantity"] == 35
    cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (to_wh, prod_id))
    assert cur.fetchone()["quantity"] == 15
    conn.close()

    # Kiểm tra vết updated_by và updated_at
    detail_res = client.get(f"/api/inventory/transfers/{transfer_id}", headers=headers)
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["note"] == "Sua lai thanh 15"
    assert detail["updated_by"] is not None and detail["updated_by"] != ""
    assert detail["updated_at"] is not None
    assert detail["items"][0]["quantity"] == 15



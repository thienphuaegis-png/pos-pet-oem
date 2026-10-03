import pytest
import io
import time
import openpyxl
from fastapi.testclient import TestClient
from server import app
from database import get_db

@pytest.fixture
def client():
    return TestClient(app)

def test_price_list_excel_export_and_import(client):
    # 1. Login admin
    login_res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    ts = int(time.time() * 1000)
    p_code1 = f"SP-PL1-{ts}"
    p_code2 = f"SP-PL2-{ts}"

    # 2. Tạo 2 sản phẩm test
    r1 = client.post("/api/products", json={
        "code": p_code1,
        "name": f"Hạt Chó Vị Bò {ts}",
        "type": "product",
        "category": "Thức ăn",
        "sell_price": 100000,
        "cost_price": 60000,
        "unit": "gói"
    }, headers=headers)
    assert r1.status_code == 200
    p1_id = r1.json()["id"]

    r2 = client.post("/api/products", json={
        "code": p_code2,
        "name": f"Sữa Tắm Cho Mèo {ts}",
        "type": "product",
        "category": "Sữa tắm",
        "sell_price": 150000,
        "cost_price": 90000,
        "unit": "chai"
    }, headers=headers)
    assert r2.status_code == 200
    p2_id = r2.json()["id"]

    # 3. Tạo 1 bảng giá mới (VD: Bảng giá đại lý)
    pl_code = f"PL-DL-{ts}"
    r_pl = client.post("/api/price-lists", json={
        "code": pl_code,
        "name": "Bảng Giá Đại Lý Cấp 1",
        "description": "Bảng giá sỉ đại lý chiết khấu cao"
    }, headers=headers)
    assert r_pl.status_code == 200
    pl_id = r_pl.json()["id"]

    try:
        # 4. Kiểm tra Export Excel
        res_exp = client.get(f"/api/price-lists/{pl_id}/export-excel")
        assert res_exp.status_code == 200
        assert "application/vnd.openxmlformats" in res_exp.headers.get("content-type", "")
        wb_exp = openpyxl.load_workbook(io.BytesIO(res_exp.content), data_only=True)
        ws_exp = wb_exp.active
        exp_rows = list(ws_exp.iter_rows(values_only=True))
        assert len(exp_rows) >= 2 # tiêu đề + SP
        headers_row = [str(h or "").lower() for h in exp_rows[0]]
        assert any("mã" in h for h in headers_row)
        assert any("đại lý" in h or "giá riêng" in h for h in headers_row)

        # 5. Tạo file Excel mới để Import giá đại lý cho 2 sản phẩm
        wb_in = openpyxl.Workbook()
        ws_in = wb_in.active
        ws_in.append(["Mã SP", "Tên sản phẩm", "Nhóm hàng", "ĐVT", "Giá bán lẻ", "Giá đại lý (đ)"])
        ws_in.append([p_code1, f"Hạt Chó Vị Bò {ts}", "Thức ăn", "gói", 100000, "80.000"]) # 80,000đ
        ws_in.append([p_code2, f"Sữa Tắm Cho Mèo {ts}", "Sữa tắm", "chai", 150000, 115000]) # 115,000đ

        buf = io.BytesIO()
        wb_in.save(buf)
        buf.seek(0)

        files = {
            "file": ("test_import_bang_gia.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        }
        res_imp = client.post(f"/api/price-lists/{pl_id}/import-excel", files=files, headers=headers)
        assert res_imp.status_code == 200, f"Import error: {res_imp.text}"
        imp_data = res_imp.json()
        assert imp_data["success"] is True
        assert imp_data["created"] == 2

        # 6. Kiểm tra lại ma trận bảng giá
        res_mat = client.get(f"/api/price-lists/{pl_id}/matrix", headers=headers)
        assert res_mat.status_code == 200
        mat_items = res_mat.json()
        item1 = next((x for x in mat_items if x["product_id"] == p1_id), None)
        item2 = next((x for x in mat_items if x["product_id"] == p2_id), None)
        assert item1 is not None and item1["custom_price"] == 80000
        assert item2 is not None and item2["custom_price"] == 115000

    finally:
        # Cleanup
        client.delete(f"/api/price-lists/{pl_id}/products/{p1_id}", headers=headers)
        client.delete(f"/api/price-lists/{pl_id}/products/{p2_id}", headers=headers)
        client.delete(f"/api/price-lists/{pl_id}", headers=headers)
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM products WHERE id IN (?, ?)", (p1_id, p2_id))
        conn.commit()
        conn.close()

def test_oem_factory_products_deduplicated(client):
    login_res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    ts = int(time.time() * 1000)
    # Tạo NCC / Nhà máy
    res_supp = client.post("/api/contacts", json={
        "name": f"Nhà Máy Hevico {ts}",
        "phone": f"091{ts % 1000000:07d}",
        "type": "supplier"
    }, headers=headers)
    assert res_supp.status_code == 200
    supp_id = res_supp.json()["id"]

    # Tạo 1 sản phẩm
    res_prod = client.post("/api/products", json={
        "code": f"OEM-P-{ts}",
        "name": f"Dầu Gội OEM Thảo Dược {ts}",
        "type": "product",
        "sell_price": 120000,
        "cost_price": 50000
    }, headers=headers)
    assert res_prod.status_code == 200
    prod_id = res_prod.json()["id"]

    # Gán sản phẩm vào supplier_items 2 lần (giả lập trường hợp bị duplicate)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (?, 'product', ?, 45000)", (supp_id, prod_id))
    cur.execute("INSERT INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (?, 'product', ?, 48000)", (supp_id, prod_id))
    conn.commit()
    conn.close()

    try:
        # Gọi API list_factory_products
        res_fact = client.get(f"/api/oem/factories/{supp_id}/products")
        assert res_fact.status_code == 200
        prods = res_fact.json()
        matching = [p for p in prods if p["id"] == prod_id]
        # Phải được GROUP BY / DISTINCT, chỉ còn đúng 1 dòng duy nhất!
        assert len(matching) == 1
        assert matching[0]["cost_price"] == 48000
    finally:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM supplier_items WHERE supplier_id = ?", (supp_id,))
        cur.execute("DELETE FROM products WHERE id = ?", (prod_id,))
        cur.execute("DELETE FROM contacts WHERE id = ?", (supp_id,))
        conn.commit()
        conn.close()

def test_order_edit_api(client):
    login_res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    ts = int(time.time() * 1000)
    p_code = f"SP-ORD-{ts}"
    res_p = client.post("/api/products", json={
        "code": p_code,
        "name": f"Hạt Mèo Vị Cá {ts}",
        "type": "product",
        "sell_price": 50000,
        "cost_price": 30000
    }, headers=headers)
    assert res_p.status_code == 200
    p_id = res_p.json()["id"]

    res_c = client.post("/api/contacts", json={
        "name": f"Khách Mua Test {ts}",
        "phone": f"092{ts % 1000000:07d}",
        "type": "customer"
    }, headers=headers)
    assert res_c.status_code == 200
    cust_id = res_c.json()["id"]

    # Tạo đơn hàng
    res_ord = client.post("/api/orders", json={
        "customer_id": cust_id,
        "staff_id": 1,
        "items": [{"product_id": p_id, "quantity": 2, "price": 50000}],
        "paid_amount": 100000,
        "note": "Đơn test trước khi sửa"
    }, headers=headers)
    assert res_ord.status_code == 200
    ord_code = res_ord.json()["order_code"]

    try:
        # Lấy chi tiết đơn
        res_get = client.get(f"/api/orders/{ord_code}", headers=headers)
        assert res_get.status_code == 200
        ord_data = res_get.json()
        assert ord_data["customer_id"] == cust_id

        # Sửa đơn hàng: tăng số lượng lên 3, giảm giá 10k
        res_put = client.put(f"/api/orders/{ord_code}", json={
            "customer_id": cust_id,
            "staff_id": ord_data.get("staff_id") or 1,
            "discount": 10000,
            "paid_amount": 140000,
            "note": "Đơn test sau khi sửa",
            "items": [{"product_id": p_id, "quantity": 3, "price": 50000}]
        }, headers=headers)
        assert res_put.status_code == 200

        # Kiểm tra lại đơn hàng sau khi sửa
        res_after = client.get(f"/api/orders/{ord_code}", headers=headers)
        assert res_after.status_code == 200
        after_data = res_after.json()
        assert after_data["discount"] == 10000
        assert after_data["final_amount"] == 140000
        assert after_data["paid_amount"] == 140000
    finally:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM order_payments WHERE order_id IN (SELECT id FROM orders WHERE code = ?)", (ord_code,))
        cur.execute("DELETE FROM cashbook WHERE ref_id IN (SELECT id FROM orders WHERE code = ?) AND ref_type = 'order'", (ord_code,))
        cur.execute("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE code = ?)", (ord_code,))
        cur.execute("DELETE FROM inventory_logs WHERE order_code = ?", (ord_code,))
        cur.execute("DELETE FROM orders WHERE code = ?", (ord_code,))
        cur.execute("DELETE FROM products WHERE id = ?", (p_id,))
        cur.execute("DELETE FROM contacts WHERE id = ?", (cust_id,))
        conn.commit()
        conn.close()


"""Test API hàng đang chờ đặt: gộp theo sản phẩm, chỉ phiếu pending, không lộ NCC/giá vốn."""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from database import get_db, init_db
from routers.purchases import list_pending_request_items


def test_list_pending_request_items_aggregates_only_pending(tmp_path, monkeypatch):
    monkeypatch.setenv("POS_DB_PATH", str(tmp_path / "pos.db"))
    init_db()

    conn = get_db()
    cur = conn.cursor()
    # 2 sản phẩm
    cur.execute("INSERT INTO products (code, name, unit, stock, cost_price, sell_price, type) VALUES ('SP-TEST-1', 'Hạt Mèo Test', 'Gói', 5, 50000, 75000, 'product')")
    p1 = cur.lastrowid
    cur.execute("INSERT INTO products (code, name, unit, stock, cost_price, sell_price, type) VALUES ('SP-TEST-2', 'Pate Chó Test', 'Hộp', 0, 20000, 30000, 'product')")
    p2 = cur.lastrowid

    # Phiếu 1: pending, đặt p1=2, p2=3
    cur.execute("INSERT INTO purchase_requests (code, department, priority, status, created_by) VALUES ('YCNH-TEST-01', 'store', 'normal', 'pending', 'NV A')")
    r1 = cur.lastrowid
    cur.execute("INSERT INTO purchase_request_items (request_id, product_id, quantity) VALUES (?, ?, 2)", (r1, p1))
    cur.execute("INSERT INTO purchase_request_items (request_id, product_id, quantity) VALUES (?, ?, 3)", (r1, p2))

    # Phiếu 2: pending, đặt p1=4
    cur.execute("INSERT INTO purchase_requests (code, department, priority, status, created_by) VALUES ('YCNH-TEST-02', 'spa', 'urgent', 'pending', 'NV B')")
    r2 = cur.lastrowid
    cur.execute("INSERT INTO purchase_request_items (request_id, product_id, quantity) VALUES (?, ?, 4)", (r2, p1))

    # Phiếu 3: converted (đã lên PO), đặt p1=10, p2=10 -> KHÔNG được tính vào bảng chờ đặt
    cur.execute("INSERT INTO purchase_requests (code, department, priority, status, created_by, converted_purchase_code) VALUES ('YCNH-TEST-03', 'store', 'normal', 'converted', 'NV A', 'PO-01')")
    r3 = cur.lastrowid
    cur.execute("INSERT INTO purchase_request_items (request_id, product_id, quantity) VALUES (?, ?, 10)", (r3, p1))
    cur.execute("INSERT INTO purchase_request_items (request_id, product_id, quantity) VALUES (?, ?, 10)", (r3, p2))

    conn.commit()
    conn.close()

    res = list_pending_request_items(user={"id": 1, "role": "owner", "permissions": []})
    assert len(res) == 2, f"Phải có đúng 2 mặt hàng đang chờ, nhận: {len(res)}"

    by_code = {it["product_code"]: it for it in res}
    # p1: 2 + 4 = 6 (bỏ qua 10 của converted), thuộc 2 phiếu
    assert by_code["SP-TEST-1"]["total_qty"] == 6.0
    assert by_code["SP-TEST-1"]["stock"] == 5.0
    assert by_code["SP-TEST-1"]["request_count"] == 2
    assert set(by_code["SP-TEST-1"]["request_codes"]) == {"YCNH-TEST-01", "YCNH-TEST-02"}

    # p2: chỉ trong phiếu 1 = 3 (bỏ qua 10 của converted)
    assert by_code["SP-TEST-2"]["total_qty"] == 3.0
    assert by_code["SP-TEST-2"]["request_count"] == 1
    assert by_code["SP-TEST-2"]["request_codes"] == ["YCNH-TEST-01"]

    # Bảo mật: không có trường giá vốn / nhà cung cấp
    for it in res:
        assert "cost_price" not in it and "supplier_id" not in it and "supplier_name" not in it

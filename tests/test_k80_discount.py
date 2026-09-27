import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from database import init_db, get_db
from fastapi.testclient import TestClient
from server import app

init_db()
client = TestClient(app)

def test_order_items_original_price_and_discount():
    db = get_db()
    cur = db.cursor()

    # 1. Tạo hoặc lấy sản phẩm mẫu có giá gốc 120.000
    cur.execute("SELECT id FROM products WHERE code = 'TEST_SP_DISC' LIMIT 1")
    p = cur.fetchone()
    if p:
        p_id = p["id"]
        cur.execute("UPDATE products SET sell_price = 120000 WHERE id = ?", (p_id,))
    else:
        cur.execute("""
            INSERT INTO products (code, name, type, sell_price, cost_price, stock, unit)
            VALUES ('TEST_SP_DISC', 'Sản Phẩm Test Giảm Giá', 'product', 120000, 70000, 10, 'cái')
        """)
        p_id = cur.lastrowid

    # 2. Tạo đơn hàng test có item bán với giá giảm (100.000 thay vì giá gốc 120.000)
    order_code = "TEST_ORD_K80_DISC"
    cur.execute("SELECT id FROM orders WHERE code = ?", (order_code,))
    old_ord = cur.fetchone()
    if old_ord:
        cur.execute("DELETE FROM order_items WHERE order_id = ?", (old_ord["id"],))
        cur.execute("DELETE FROM orders WHERE id = ?", (old_ord["id"],))
    cur.execute("""
        INSERT INTO orders (code, total_amount, discount, final_amount, paid_amount, debt_amount)
        VALUES (?, 200000, 20000, 180000, 180000, 0)
    """, (order_code,))
    order_id = cur.lastrowid

    cur.execute("""
        INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
        VALUES (?, ?, 2, 100000, 200000)
    """, (order_id, p_id))

    db.commit()
    db.close()

    # 3. Gọi API GET /api/orders/{code}
    response = client.get(f"/api/orders/{order_code}")
    assert response.status_code == 200, f"API lỗi: {response.text}"
    data = response.json()

    assert data["code"] == order_code
    assert data["discount"] == 20000
    assert len(data["items"]) == 1

    item = data["items"][0]
    assert item["price"] == 100000
    assert "original_price" in item, "Item phải có trường original_price từ bảng products"
    assert item["original_price"] == 120000, f"original_price mong đợi 120000, thực tế {item.get('original_price')}"

def test_frontend_pos_k80_discount_logic():
    base_dir = os.path.dirname(os.path.dirname(__file__))
    pos_js_path = os.path.join(base_dir, "static", "js", "pos.js")
    app_js_path = os.path.join(base_dir, "static", "js", "app.js")

    with open(pos_js_path, "r", encoding="utf-8") as f:
        pos_js = f.read()

    with open(app_js_path, "r", encoding="utf-8") as f:
        app_js = f.read()
    prod_js_path = os.path.join(base_dir, "static", "js", "modules", "productions.js")
    if os.path.exists(prod_js_path):
        with open(prod_js_path, "r", encoding="utf-8") as f:
            app_js += "\n" + f.read()

    # 1. pos.js: Đơn giá hiển thị 2 dòng khi có giảm giá (giá gốc line-through)
    assert "hasItemDisc" in pos_js, "pos.js phải kiểm tra hasItemDisc"
    assert "text-decoration: line-through" in pos_js, "pos.js phải gạch ngang giá gốc khi có giảm giá"
    assert "it.original_price > it.price" in pos_js, "pos.js phải so sánh giá gốc với giá bán"

    # 2. pos.js: Chân trang tự ẩn dòng giảm giá K80 khi discount = 0
    assert "hasBillDiscount" in pos_js, "pos.js phải kiểm tra hasBillDiscount"
    assert "effectiveElements = effectiveElements.filter(e => e !== discElem)" in pos_js, "pos.js phải tự ẩn dòng giảm giá khi bill không chiết khấu"

    # 3. pos.js: Draft order giữ original_price
    assert "original_price: i.original_price || i.price" in pos_js, "printDraftOrder phải truyền original_price"

    # 5. pos.js & app.js: Đẩy chân trang tự động tránh đè chữ
    assert 'data-zone' in pos_js and 'data-zone' in app_js, "Phải gán data-zone để đo đạc DOM"
    assert 'domTableBottom + safeGap > minDomFooterTop' in pos_js, "pos.js phải có logic tự dịch chân trang khi bảng dài"
    assert 'domTableBottom + safeGap > minDomFooterTop' in app_js, "app.js phải có logic tự dịch chân trang khi bảng dài"

    # 6. Bố cục 2 dòng trên hóa đơn nhiệt (Dòng 1 tên món tràn 100%, Dòng 2 SL | Đơn giá | Thành tiền)
    assert 'colspan="3"' in pos_js and 'colspan="3"' in app_js, "K80 phải có dòng 1 tên sản phẩm colspan=3"
    assert '>SL</th>' in pos_js and '>Đơn giá</th>' in pos_js and '>Thành tiền</th>' in pos_js, "K80 phải có tiêu đề 3 cột SL, Đơn giá, Thành tiền"

    # 7. Ghi rõ số tiền giảm trên từng món và tổng tiết kiệm chân trang
    assert '(Giảm ' in pos_js and '(Giảm ' in app_js, "Phải ghi rõ số tiền giảm trên từng món"
    assert 'totalSavings' in pos_js and 'totalSavings' in app_js, "Phải tính tổng số tiền tiết kiệm totalSavings"

    # 8. Đánh số tab hóa đơn tự động reset theo số lượng tab đang mở
    assert 'reindexInvoiceTabs' in pos_js, "pos.js phải có hàm reindexInvoiceTabs"
    assert 'tab.name = `Hóa đơn ${idx + 1}`' in pos_js, "pos.js phải reset số hóa đơn 1..N theo tab thực tế"


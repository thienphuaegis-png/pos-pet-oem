import pytest
import sqlite3
from database import init_db, get_db
import services.telegram_bot as bot

@pytest.fixture(autouse=True)
def setup_test_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM telegram_admins WHERE chat_id IN (999001, 999002)")
    cur.execute("DELETE FROM telegram_admin_requests WHERE chat_id IN (999001, 999002)")
    cur.execute("DELETE FROM order_items WHERE product_id IN (SELECT id FROM products WHERE code IN ('TEST-OOS-01', 'TEST-PRICE-01', 'PROD-CANCEL-01'))")
    cur.execute("DELETE FROM product_inventory WHERE product_id IN (SELECT id FROM products WHERE code IN ('TEST-OOS-01', 'TEST-PRICE-01', 'PROD-CANCEL-01'))")
    cur.execute("DELETE FROM products WHERE code IN ('TEST-OOS-01', 'TEST-PRICE-01', 'PROD-CANCEL-01')")
    cur.execute("DELETE FROM cashbook WHERE ref_id IN (SELECT id FROM orders WHERE code = 'HD-TEST-CANCEL')")
    cur.execute("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE code = 'HD-TEST-CANCEL')")
    cur.execute("DELETE FROM orders WHERE code = 'HD-TEST-CANCEL'")
    conn.commit()
    conn.close()

def test_telegram_tables_exist():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='telegram_admins'")
    assert cur.fetchone() is not None, "Bảng telegram_admins chưa tồn tại"
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='telegram_admin_requests'")
    assert cur.fetchone() is not None, "Bảng telegram_admin_requests chưa tồn tại"
    conn.close()

def test_admin_registration_and_approval():
    user_chat_id = 999001
    msg = {
        "chat": {"id": user_chat_id},
        "from": {"username": "testadmin", "first_name": "Phu"},
        "text": "/dangky"
    }

    # 1. Chưa là admin -> Yêu cầu đăng ký
    res = bot.handle_message(msg)
    assert "Đã gửi yêu cầu đăng ký Admin" in res["reply"]
    assert bot.is_admin(user_chat_id) is False

    # 2. Duyệt admin
    approved = bot.approve_admin_request(user_chat_id, approved_by="Test")
    assert approved is True
    assert bot.is_admin(user_chat_id) is True

    # 3. Gửi lại /dangky khi đã là admin
    res2 = bot.handle_message(msg)
    assert "đã là Admin" in res2["reply"]

def test_unauthorized_access():
    unauth_id = 999002
    msg = {
        "chat": {"id": unauth_id},
        "from": {"username": "stranger"},
        "text": "/baocao"
    }
    res = bot.handle_message(msg)
    assert "chưa được cấp quyền Admin" in res["reply"]

def test_out_of_stock_query():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
    INSERT INTO products (code, name, type, cost_price, sell_price, stock, unit, is_active)
    VALUES ('TEST-OOS-01', 'Hạt Test Hết Hàng', 'product', 50000, 70000, -1, 'gói', 1)
    """)
    conn.commit()
    conn.close()

    items = bot.query_out_of_stock()
    found = [it for it in items if it["code"] == 'TEST-OOS-01']
    assert len(found) > 0
    assert found[0]["stock"] <= 0

    # Cleanup
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM order_items WHERE product_id IN (SELECT id FROM products WHERE code = 'TEST-OOS-01')")
    cur.execute("DELETE FROM product_inventory WHERE product_id IN (SELECT id FROM products WHERE code = 'TEST-OOS-01')")
    cur.execute("DELETE FROM products WHERE code = 'TEST-OOS-01'")
    conn.commit()
    conn.close()

def test_price_query():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
    INSERT INTO products (code, name, type, cost_price, sell_price, stock, unit, is_active)
    VALUES ('TEST-PRICE-01', 'Pate Cá Hồi Test', 'product', 10000, 25000, 10, 'lon', 1)
    """)
    conn.commit()
    conn.close()

    res = bot.query_product_price("Pate Cá Hồi Test")
    assert len(res) > 0
    assert res[0]["sell_price"] == 25000

    bot.approve_admin_request(999001)
    msg = {
        "chat": {"id": 999001},
        "from": {"username": "testadmin"},
        "text": "/gia Pate Cá Hồi Test"
    }
    ans = bot.handle_message(msg)
    assert "25.000 đ" in ans["reply"] or "25,000" in ans["reply"]

    # Cleanup
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM order_items WHERE product_id IN (SELECT id FROM products WHERE code = 'TEST-PRICE-01')")
    cur.execute("DELETE FROM product_inventory WHERE product_id IN (SELECT id FROM products WHERE code = 'TEST-PRICE-01')")
    cur.execute("DELETE FROM products WHERE code = 'TEST-PRICE-01'")
    conn.commit()
    conn.close()

def test_cancel_order_and_change_payment():
    admin_id = 999001
    bot.approve_admin_request(admin_id)

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
    INSERT INTO products (code, name, type, cost_price, sell_price, stock, is_active)
    VALUES ('PROD-CANCEL-01', 'Đồ chơi chuột', 'product', 10000, 30000, 10, 1)
    """)
    p_id = cur.lastrowid

    cur.execute("""
    INSERT INTO orders (code, total_amount, final_amount, paid_amount, debt_amount)
    VALUES ('HD-TEST-CANCEL', 30000, 30000, 30000, 0)
    """)
    o_id = cur.lastrowid

    cur.execute("""
    INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
    VALUES (?, ?, 2, 15000, 30000)
    """, (o_id, p_id))

    cur.execute("""
    INSERT INTO cashbook (code, type, category, amount, ref_type, ref_id, note, account_id)
    VALUES ('PT-TEST-01', 'in', 'Thu tien ban hang', 30000, 'order', ?, 'Test don', 1)
    """, (o_id,))
    conn.commit()
    conn.close()

    # 1. Thao tác đổi phương thức thanh toán
    change_res = bot.execute_change_payment('HD-TEST-CANCEL', 2)
    assert change_res["success"] is True

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT account_id FROM cashbook WHERE ref_type = 'order' AND ref_id = ?", (o_id,))
    cb = cur.fetchone()
    assert cb["account_id"] == 2
    conn.close()

    # 2. Thao tác /huyhoadon
    msg_cancel = {
        "chat": {"id": admin_id},
        "from": {"username": "testadmin"},
        "text": "/huyhoadon HD-TEST-CANCEL"
    }
    res_cancel = bot.handle_message(msg_cancel)
    assert "XÁC NHẬN HỦY HÓA ĐƠN: HD-TEST-CANCEL" in res_cancel["reply"]
    assert "confirm_cancel:HD-TEST-CANCEL" in res_cancel["inline_keyboard"][0][0]["callback_data"]

    # 3. Bấm xác nhận hủy qua callback query
    cb_data = {
        "data": "confirm_cancel:HD-TEST-CANCEL",
        "from": {"id": admin_id}
    }
    cb_res = bot.handle_callback_query(cb_data)
    assert "Đã hủy thành công đơn hàng HD-TEST-CANCEL" in cb_res["reply"]

    # Kiểm tra tồn kho được hoàn
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT stock FROM products WHERE id = ?", (p_id,))
    prod = cur.fetchone()
    assert prod["stock"] == 12

    # Kiểm tra đơn và cashbook đã xóa
    cur.execute("SELECT 1 FROM orders WHERE code = 'HD-TEST-CANCEL'")
    assert cur.fetchone() is None
    cur.execute("SELECT 1 FROM cashbook WHERE ref_type = 'order' AND ref_id = ?", (o_id,))
    assert cur.fetchone() is None

    cur.execute("DELETE FROM order_items WHERE order_id = ?", (o_id,))
    cur.execute("DELETE FROM product_inventory WHERE product_id = ?", (p_id,))
    cur.execute("DELETE FROM products WHERE id = ?", (p_id,))
    conn.commit()
    conn.close()

def test_telegram_settings_api():
    from fastapi.testclient import TestClient
    from server import app
    client = TestClient(app)

    # Đăng nhập lấy token owner
    login_res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    if login_res.status_code != 200:
        login_res = client.post("/api/auth/login", data={"username": "admin", "password": "123"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Cập nhật cấu hình bot
    cfg_res = client.post("/api/settings/telegram/config", json={
        "bot_token": "TEST_TOKEN_123456",
        "is_enabled": True
    }, headers=headers)
    assert cfg_res.status_code == 200

    # 2. Tạo 1 yêu cầu pending
    bot.register_admin_request(999003, username="owner_test", first_name="Owner")

    # 3. Lấy dữ liệu settings
    get_res = client.get("/api/settings/telegram", headers=headers)
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["bot_token"] == "TEST_TOKEN_123456"
    assert data["is_enabled"] is True
    assert any(r["chat_id"] == 999003 for r in data["requests"])

    # 4. Duyệt admin qua API
    appr_res = client.post("/api/settings/telegram/approve", json={"chat_id": 999003}, headers=headers)
    assert appr_res.status_code == 200
    assert bot.is_admin(999003) is True

    # 5. Xóa admin qua API
    rej_res = client.post("/api/settings/telegram/reject", json={"chat_id": 999003}, headers=headers)
    assert rej_res.status_code == 200
    assert bot.is_admin(999003) is False

    # Cleanup
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM telegram_admins WHERE chat_id = 999003")
    cur.execute("DELETE FROM telegram_admin_requests WHERE chat_id = 999003")
    conn.commit()
    conn.close()

def test_telegram_reports_and_categories():
    admin_id = 999001
    bot.approve_admin_request(admin_id)

    # 1. Test /danhmuc
    msg_cat = {"chat": {"id": admin_id}, "from": {"username": "admin"}, "text": "/danhmuc"}
    res_cat = bot.handle_message(msg_cat)
    assert "DANH MỤC HÀNG HÓA" in res_cat["reply"]

    # 2. Test /baocao (hiện báo cáo hôm nay kèm buttons)
    msg_rep = {"chat": {"id": admin_id}, "from": {"username": "admin"}, "text": "/baocao"}
    res_rep = bot.handle_message(msg_rep)
    assert "BÁO CÁO DOANH THU" in res_rep["reply"]
    assert "inline_keyboard" in res_rep

    # 3. Test /baocao homnay
    msg_today = {"chat": {"id": admin_id}, "from": {"username": "admin"}, "text": "/baocao homnay"}
    res_today = bot.handle_message(msg_today)
    assert "BÁO CÁO DOANH THU" in res_today["reply"]

    # 4. Test callback_query for report
    cb_rep = {"data": "report:thangnay", "from": {"id": admin_id}}
    res_cb = bot.handle_callback_query(cb_rep)
    assert "BÁO CÁO DOANH THU THÁNG NÀY" in res_cb["reply"]

def test_telegram_service_start_stop():
    bot.start_telegram_bot_service()
    assert bot._polling_thread is not None
    assert bot._polling_thread.is_alive()
    bot.stop_telegram_bot_service()
    assert bot._stop_event.is_set()




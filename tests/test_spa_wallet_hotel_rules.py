import pytest
from fastapi.testclient import TestClient
from server import app
from database import get_db
from dependencies import get_current_user

# Bypass auth
app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner", "is_active": 1}

from tests.auth_helpers import owner_auth_headers
client = TestClient(app, headers=owner_auth_headers())

def test_hotel_checkout_summary_breaks_down_wallet_limits():
    """Kiểm tra API checkout-summary bóc tách rõ ràng: tiền phòng cấm dùng ví, chỉ tiền spa được dùng ví"""
    with get_db() as conn:
        cursor = conn.cursor()
        # Tạo khách hàng có ví Spa 500k
        cursor.execute("INSERT INTO contacts (name, phone, type, spa_wallet_balance) VALUES ('Test Guest Wallet', '0999888777', 'customer', 500000)")
        contact_id = cursor.lastrowid
        cursor.execute("INSERT INTO pets (name, customer_id, species) VALUES ('Cún Test', ?, 'Chó')", (contact_id,))
        pet_id = cursor.lastrowid
        cursor.execute("SELECT id FROM hotel_rooms WHERE status = 'available' LIMIT 1")
        room = cursor.fetchone()
        if not room:
            cursor.execute("INSERT INTO hotel_rooms (code, name, zone, price_per_day, status) VALUES ('P-TEST', 'Phòng VIP Test', 'dog', 200000, 'available')")
            room_id = cursor.lastrowid
        else:
            room_id = room["id"]
        
        # Check-in 1 booking
        cursor.execute("""
            INSERT INTO hotel_bookings (code, room_id, contact_id, pet_id, check_in_time, expected_checkout_time, daily_rate, deposit_amount, status)
            VALUES ('HT-TEST-001', ?, ?, ?, '2026-09-28T08:00:00', '2026-10-01T12:00:00', 200000, 50000, 'active')
        """, (room_id, contact_id, pet_id))
        booking_id = cursor.lastrowid
        
        # Thêm 1 vé Spa gắn với booking này trị giá 150k
        cursor.execute("""
            INSERT INTO pet_service_tickets (code, customer_id, pet_id, service_type, price, status, hotel_booking_id)
            VALUES ('ST-TEST-001', ?, ?, 'Tắm sấy test', 150000, 'done', ?)
        """, (contact_id, pet_id, booking_id))
        conn.commit()

    try:
        res = client.get(f"/api/hotel/checkout-summary/{booking_id}")
        assert res.status_code == 200
        data = res.json()
        
        # Kiểm tra bóc tách
        assert data["room_total"] >= 200000
        assert data["deposit_amount"] == 50000
        assert data["room_payable"] == data["room_total"] - 50000
        assert data["spa_total"] == 150000
        assert data["contact_spa_wallet"] == 500000
        # Ví có 500k nhưng dịch vụ spa chỉ 150k -> trần tối đa trừ ví chỉ là 150k (không được trừ sang tiền phòng)
        assert data["max_spa_wallet_deduction"] == 150000
        assert data["allow_wallet_on_room"] is False
    finally:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM pet_service_tickets WHERE code = 'ST-TEST-001'")
            cur.execute("DELETE FROM hotel_bookings WHERE id = ?", (booking_id,))
            cur.execute("DELETE FROM pets WHERE id = ?", (pet_id,))
            cur.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
            conn.commit()

def test_hotel_checkout_blocks_wallet_deduction_when_no_spa_tickets():
    """Nếu không có dịch vụ Spa nào, khách không được phép dùng Ví Spa để cấn trừ tiền phòng"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO contacts (name, phone, type, spa_wallet_balance) VALUES ('Test Guest No Spa', '0999888776', 'customer', 500000)")
        contact_id = cursor.lastrowid
        cursor.execute("INSERT INTO pets (name, customer_id, species) VALUES ('Cún No Spa', ?, 'Chó')", (contact_id,))
        pet_id = cursor.lastrowid
        cursor.execute("SELECT id FROM hotel_rooms WHERE status = 'available' LIMIT 1")
        room = cursor.fetchone()
        if not room:
            cursor.execute("INSERT INTO hotel_rooms (code, name, zone, price_per_day, status) VALUES ('P-TEST', 'Phòng VIP Test', 'dog', 200000, 'available')")
            room_id = cursor.lastrowid
        else:
            room_id = room["id"]
        
        cursor.execute("""
            INSERT INTO hotel_bookings (code, room_id, contact_id, pet_id, check_in_time, expected_checkout_time, daily_rate, status)
            VALUES ('HT-TEST-002', ?, ?, ?, '2026-09-28T08:00:00', '2026-10-01T12:00:00', 200000, 'active')
        """, (room_id, contact_id, pet_id))
        booking_id = cursor.lastrowid
        conn.commit()

    try:
        # Cố tình gửi trừ ví khi spa_total == 0 -> hệ thống phải từ chối
        checkout_payload = {
            "payment_method": "cash",
            "use_spa_wallet": True,
            "spa_wallet_amount": 100000
        }
        res = client.post(f"/api/hotel/checkout/{booking_id}", json=checkout_payload)
        assert res.status_code == 400
        assert "tiền phòng" in res.json()["detail"].lower()
    finally:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM hotel_bookings WHERE id = ?", (booking_id,))
            cur.execute("DELETE FROM pets WHERE id = ?", (pet_id,))
            cur.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
            conn.commit()

def test_hotel_checkout_clamps_and_deducts_wallet_only_for_spa():
    """Khi có vé Spa, trừ ví chỉ được tối đa bằng tiền vé Spa, số dư ví giảm đúng mức và ghi nhận transaction"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO contacts (name, phone, type, spa_wallet_balance) VALUES ('Test Guest Wallet Deduct', '0999888775', 'customer', 500000)")
        contact_id = cursor.lastrowid
        cursor.execute("INSERT INTO pets (name, customer_id, species) VALUES ('Cún Deduct', ?, 'Chó')", (contact_id,))
        pet_id = cursor.lastrowid
        cursor.execute("SELECT id FROM hotel_rooms WHERE status = 'available' LIMIT 1")
        room = cursor.fetchone()
        if not room:
            cursor.execute("INSERT INTO hotel_rooms (code, name, zone, price_per_day, status) VALUES ('P-TEST', 'Phòng VIP Test', 'dog', 200000, 'available')")
            room_id = cursor.lastrowid
        else:
            room_id = room["id"]
        
        cursor.execute("""
            INSERT INTO hotel_bookings (code, room_id, contact_id, pet_id, check_in_time, expected_checkout_time, daily_rate, status)
            VALUES ('HT-TEST-003', ?, ?, ?, '2026-09-28T08:00:00', '2026-10-01T12:00:00', 200000, 'active')
        """, (room_id, contact_id, pet_id))
        booking_id = cursor.lastrowid

        cursor.execute("""
            INSERT INTO pet_service_tickets (code, customer_id, pet_id, service_type, price, status, hotel_booking_id)
            VALUES ('ST-TEST-003', ?, ?, 'Cắt tỉa test', 120000, 'done', ?)
        """, (contact_id, pet_id, booking_id))
        conn.commit()

    try:
        # Khách yêu cầu trừ ví 300k, nhưng spa chỉ 120k -> hệ thống clamp về 120k
        checkout_payload = {
            "payment_method": "cash",
            "use_spa_wallet": True,
            "spa_wallet_amount": 300000
        }
        res = client.post(f"/api/hotel/checkout/{booking_id}", json=checkout_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["spa_wallet_deducted"] == 120000

        # Kiểm tra số dư ví còn lại = 500k - 120k = 380k
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT spa_wallet_balance FROM contacts WHERE id = ?", (contact_id,))
            bal = cur.fetchone()["spa_wallet_balance"]
            assert bal == 380000

            # Kiểm tra transaction log
            cur.execute("SELECT * FROM spa_wallet_transactions WHERE contact_id = ? ORDER BY id DESC LIMIT 1", (contact_id,))
            tx = cur.fetchone()
            assert tx is not None
            assert tx["amount"] == 120000
            assert tx["type"] == "spend"
    finally:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM spa_wallet_transactions WHERE contact_id = ?", (contact_id,))
            cur.execute("DELETE FROM pet_service_tickets WHERE code = 'ST-TEST-003'")
            cur.execute("DELETE FROM hotel_bookings WHERE id = ?", (booking_id,))
            cur.execute("DELETE FROM pets WHERE id = ?", (pet_id,))
            cur.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
            conn.commit()

def test_pos_order_excludes_hotel_category_from_spa_wallet():
    """Trong đơn bán hàng POS, sản phẩm dịch vụ thuộc nhóm Khách Sạn không được tính vào trần trừ ví Spa"""
    import time
    ts = int(time.time() * 1000)
    spa_code = f"P-SPA-{ts}"
    hotel_code = f"P-HOTEL-{ts}"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO contacts (name, phone, type, spa_wallet_balance) VALUES ('Test POS Wallet Customer', '0999888774', 'customer', 500000)")
        contact_id = cursor.lastrowid
        
        # 1 dịch vụ Spa thường
        cursor.execute("INSERT INTO products (code, name, type, category, sell_price, cost_price) VALUES (?, 'Dịch vụ Tắm Spa', 'service', 'Spa Grooming', 100000, 20000)", (spa_code,))
        p_spa_id = cursor.lastrowid
        
        # 1 dịch vụ Khách Sạn
        cursor.execute("INSERT INTO products (code, name, type, category, sell_price, cost_price) VALUES (?, 'Lưu trú phòng VIP', 'service', 'Khách Sạn Pet Hotel', 250000, 50000)", (hotel_code,))
        p_hotel_id = cursor.lastrowid
        conn.commit()

    try:
        # Tạo đơn POS với cả 2 dịch vụ, chọn use_spa_wallet
        order_payload = {
            "customer_id": contact_id,
            "staff_id": 1,
            "items": [
                {"product_id": p_spa_id, "quantity": 1, "price": 100000},
                {"product_id": p_hotel_id, "quantity": 1, "price": 250000}
            ],
            "discount": 0,
            "paid_amount": 250000,
            "payment_method": "cash",
            "use_spa_wallet": True,
            "spa_wallet_amount": 350000 # Cố tình yêu cầu trừ cả 350k
        }
        res = client.post("/api/orders", json=order_payload)
        assert res.status_code == 200
        data = res.json()
        
        # Chỉ được trừ đúng 100k của dịch vụ Spa, 250k tiền phòng Khách Sạn không được trừ ví
        assert data["spa_wallet_deduction"] == 100000
        assert data["final_amount"] == 250000
    finally:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM orders WHERE customer_id = ?", (contact_id,))
            oids = [r[0] for r in cur.fetchall()]
            for oid in oids:
                cur.execute("DELETE FROM order_payments WHERE order_id = ?", (oid,))
                cur.execute("DELETE FROM order_items WHERE order_id = ?", (oid,))
                cur.execute("DELETE FROM inventory_logs WHERE order_id = ?", (oid,))
                cur.execute("DELETE FROM cashbook WHERE ref_type = 'order' AND ref_id = ?", (oid,))
                cur.execute("DELETE FROM orders WHERE id = ?", (oid,))
            cur.execute("DELETE FROM spa_wallet_transactions WHERE contact_id = ?", (contact_id,))
            cur.execute("DELETE FROM products WHERE id IN (?, ?)", (p_spa_id, p_hotel_id))
            cur.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
            conn.commit()

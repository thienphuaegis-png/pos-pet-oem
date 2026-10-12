import pytest
import sqlite3
import os
from database import get_db, get_db_path

DB_PATH = get_db_path()

def test_database_has_hotel_tables():
    """Kiểm tra sự tồn tại của 2 bảng hotel_rooms và hotel_bookings trong SQLite"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check hotel_rooms
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='hotel_rooms'")
        assert cursor.fetchone() is not None, "Bảng hotel_rooms chưa được tạo trong database"
        
        # Check columns in hotel_rooms
        cursor.execute("PRAGMA table_info(hotel_rooms)")
        cols = {row["name"] for row in cursor.fetchall()}
        assert {"id", "code", "name", "zone", "price_per_day", "status"}.issubset(cols)

        # Check hotel_bookings
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='hotel_bookings'")
        assert cursor.fetchone() is not None, "Bảng hotel_bookings chưa được tạo trong database"
        
        # Check columns in hotel_bookings
        cursor.execute("PRAGMA table_info(hotel_bookings)")
        b_cols = {row["name"] for row in cursor.fetchall()}
        assert {"id", "code", "room_id", "contact_id", "pet_id", "check_in_time", "daily_rate", "status"}.issubset(b_cols)

def test_hotel_rooms_seeded():
    """Kiểm tra đã seed danh sách buồng phòng tiêu chuẩn (ít nhất 10 phòng)"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM hotel_rooms")
        row = cursor.fetchone()
        assert row["cnt"] >= 10, f"Cần ít nhất 10 phòng lưu trú, hiện có {row['cnt']}"

def test_hotel_api_endpoints():
    """Kiểm tra các API endpoints của phân hệ Hotel qua FastAPI TestClient"""
    from fastapi.testclient import TestClient
    from server import app
    client = TestClient(app)

    # 1. GET /api/hotel/rooms
    res = client.get("/api/hotel/rooms")
    assert res.status_code == 200
    rooms = res.json()
    assert len(rooms) >= 10
    first_room = rooms[0]
    assert "code" in first_room
    assert "status" in first_room

    # 2. Check-in flow test
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM contacts LIMIT 1")
        contact_id = cursor.fetchone()["id"]
        cursor.execute("SELECT id FROM pets LIMIT 1")
        p_row = cursor.fetchone()
        if not p_row:
            cursor.execute("INSERT INTO pets (customer_id, name, species) VALUES (?, 'Miu Test', 'cat')", (contact_id,))
            conn.commit()
            pet_id = cursor.lastrowid
        else:
            pet_id = p_row["id"]
        # Lấy phòng trống
        cursor.execute("SELECT id FROM hotel_rooms WHERE status = 'available' LIMIT 1")
        avail_room_id = cursor.fetchone()["id"]

    checkin_payload = {
        "room_id": avail_room_id,
        "contact_id": contact_id,
        "pet_id": pet_id,
        "expected_checkout_time": "2026-10-01T12:00:00",
        "feeding_notes": "Ăn hạt 2 lần/ngày",
        "items_brought": "1 balo, 1 chăn"
    }
    checkin_res = client.post("/api/hotel/checkin", json=checkin_payload)
    assert checkin_res.status_code == 200
    b_data = checkin_res.json()
    booking_id = b_data["booking_id"]
    assert booking_id > 0
    assert "HT-" in b_data["code"]

    # 3. GET /api/hotel/bookings/active
    active_res = client.get("/api/hotel/bookings/active")
    assert active_res.status_code == 200
    active_list = active_res.json()
    assert any(b["id"] == booking_id for b in active_list)

    # 4. Check-out flow test
    checkout_payload = {
        "payment_method": "cash"
    }
    checkout_res = client.post(f"/api/hotel/checkout/{booking_id}", json=checkout_payload)
    assert checkout_res.status_code == 200
    co_data = checkout_res.json()
    assert co_data["total_days"] >= 1
    assert co_data["total_amount"] > 0

    # 5. GET /api/hotel/bookings/history
    hist_res = client.get("/api/hotel/bookings/history")
    assert hist_res.status_code == 200
    hist_list = hist_res.json()
    assert any(b["id"] == booking_id for b in hist_list)

def test_hotel_html_elements_exist():
    """Kiểm tra các thành phần giao diện của Hotel trong templates/index.html"""
    with open("templates/index.html", "r", encoding="utf-8") as f:
        content = f.read()

    # Navbar tab button
    assert "tab-hotel" in content, "Thiếu nút chuyển tab Khách Sạn trên navbar"
    assert 'id="tab-hotel"' in content, "Thiếu container chính #tab-hotel"
    
    # 3 View containers
    assert 'id="hotel-view-grid"' in content, "Thiếu container view Lưới phòng #hotel-view-grid"
    assert 'id="hotel-view-table"' in content, "Thiếu container view Bảng danh sách #hotel-view-table"
    assert 'id="hotel-view-gantt"' in content, "Thiếu container view Lịch Gantt #hotel-view-gantt"
    
    # Drawer & Modals
    assert 'id="hotel-drawer"' in content or 'id="hotel-room-drawer"' in content, "Thiếu drawer chi tiết phòng"
    assert 'id="modal-hotel-checkin"' in content, "Thiếu modal check-in"
    assert 'id="modal-hotel-checkout"' in content, "Thiếu modal check-out"
    
    # Subtab in tab-orders
    assert 'id="btn-subtab-order-hotel"' in content or 'orders-subview-hotel' in content, "Thiếu subtab Lịch sử Hotel trong Tab Hóa Đơn"

def test_hotel_js_module_exists():
    """Kiểm tra file JS module và các hàm điều khiển cốt lõi"""
    assert os.path.exists("static/js/modules/hotel.js"), "File static/js/modules/hotel.js chưa tồn tại"
    with open("static/js/modules/hotel.js", "r", encoding="utf-8") as f:
        js_content = f.read()
    
    assert "loadHotelRooms" in js_content
    assert "switchHotelView" in js_content
    assert "openHotelCheckinModal" in js_content
    assert "submitHotelCheckin" in js_content

def test_hotel_batch_schema_and_models():
    """Task 1: Kiểm tra cấu trúc bảng hotel_bookings có các cột tiếp nhận đợt và Pydantic schemas"""
    from schemas import HotelBatchCheckinItem, HotelBatchCheckinRequest

    item = HotelBatchCheckinItem(
        room_id=1,
        pet_id=2,
        pet_name="Miu",
        pet_weight=3.5,
        daily_rate=150000,
        health_condition="Bình thường",
        feeding_notes="Ăn 2 bữa",
        items_brought="1 balo"
    )
    req = HotelBatchCheckinRequest(
        contact_id=1,
        deposit_amount=100000,
        items=[item]
    )
    assert req.contact_id == 1
    assert len(req.items) == 1
    assert req.items[0].pet_weight == 3.5

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(hotel_bookings)")
        cols = {row["name"] for row in cursor.fetchall()}
        assert "batch_code" in cols, "Thiếu cột batch_code trong hotel_bookings"
        assert "pet_weight_at_checkin" in cols, "Thiếu cột pet_weight_at_checkin trong hotel_bookings"
        assert "health_condition" in cols, "Thiếu cột health_condition trong hotel_bookings"
        assert "deposit_amount" in cols, "Thiếu cột deposit_amount trong hotel_bookings"

def test_hotel_checkin_batch_api():
    """Task 2: Kiểm tra API POST /api/hotel/checkin-batch tiếp nhận nhiều bé cùng lúc"""
    from fastapi.testclient import TestClient
    from server import app
    client = TestClient(app)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM contacts LIMIT 1")
        contact_id = cursor.fetchone()["id"]
        # Đảm bảo có ít nhất 2 phòng trống để test batch check-in
        cursor.execute("""
            INSERT OR IGNORE INTO hotel_rooms (code, name, room_group, price_per_day, status)
            VALUES ('TEST-B1', 'Phòng Test B1', 'standard', 150000, 'available'),
                   ('TEST-B2', 'Phòng Test B2', 'standard', 150000, 'available')
        """)
        cursor.execute("UPDATE hotel_rooms SET status = 'available' WHERE code IN ('TEST-B1', 'TEST-B2')")
        conn.commit()
        cursor.execute("SELECT id, code, price_per_day FROM hotel_rooms WHERE status = 'available' LIMIT 2")
        rooms = cursor.fetchall()
        assert len(rooms) >= 2, "Cần ít nhất 2 phòng trống để test batch check-in"
        r1, r2 = rooms[0], rooms[1]

    payload = {
        "contact_id": contact_id,
        "check_in_time": "2026-09-28T14:00:00",
        "expected_checkout_time": "2026-10-01T10:00:00",
        "deposit_amount": 150000,
        "items": [
            {
                "room_id": r1["id"],
                "pet_name": "Bé Mèo 1",
                "pet_breed": "Mèo Ta",
                "pet_weight": 3.2,
                "daily_rate": r1["price_per_day"],
                "health_condition": "Đã tiêm phòng dại",
                "feeding_notes": "Ăn pate trưa",
                "items_brought": "1 balo màu vàng"
            },
            {
                "room_id": r2["id"],
                "pet_name": "Bé Mèo 2",
                "pet_breed": "Anh Lông Ngắn",
                "pet_weight": 4.5,
                "daily_rate": r2["price_per_day"],
                "health_condition": "Bình thường",
                "feeding_notes": "Hạt Royal Canin",
                "items_brought": "1 dây dắt"
            }
        ]
    }

    res = client.post("/api/hotel/checkin-batch", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "HTB-" in data["batch_code"]
    assert len(data["bookings"]) == 2

    # Kiểm tra 2 phòng đã chuyển sang occupied
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT status FROM hotel_rooms WHERE id IN (?, ?)", (r1["id"], r2["id"]))
        statuses = [row["status"] for row in cursor.fetchall()]
        assert all(s == "occupied" for s in statuses)

def test_hotel_intake_k80_and_batch_ui():
    """Task 3 & 4: Kiểm tra các hàm in phiếu K80 và thành phần giao diện Batch Check-in"""
    # 1. Kiểm tra HTML index.html có các thành phần combobox & bảng phân bổ bé
    with open("templates/index.html", "r", encoding="utf-8") as f:
        html = f.read()

    assert "hotel-cust-search" in html, "Thiếu ô tìm kiếm combobox khách hàng #hotel-cust-search"
    assert "hotel-cust-dropdown" in html, "Thiếu dropdown kết quả tìm kiếm #hotel-cust-dropdown"
    assert "tbody-hotel-batch-pets" in html, "Thiếu bảng phân bổ nhiều bé #tbody-hotel-batch-pets"
    assert "hotel-deposit-amount" in html, "Thiếu ô đặt cọc #hotel-deposit-amount"

    # 2. Kiểm tra JS module có các hàm nghiệp vụ combobox, batch row và in phiếu K80
    with open("static/js/modules/hotel.js", "r", encoding="utf-8") as f:
        js = f.read()

    assert "onHotelCustSearchInput" in js, "Thiếu hàm tìm kiếm khách hàng onHotelCustSearchInput"
    assert "selectHotelCust" in js, "Thiếu hàm chọn khách hàng selectHotelCust"
    assert "addHotelBatchPetRow" in js, "Thiếu hàm thêm dòng bé addHotelBatchPetRow"
    assert "submitHotelBatchCheckin" in js, "Thiếu hàm gửi batch check-in submitHotelBatchCheckin"
    assert "generateHotelIntakeTicketHtml" in js, "Thiếu hàm sinh HTML phiếu tiếp nhận K80"
    assert "printHotelIntakeTicketDirectly" in js, "Thiếu hàm in trực tiếp phiếu tiếp nhận K80"

def test_hotel_room_group_schema_and_spa_links():
    """Task 1: Kiểm tra cấu trúc database phòng có nhóm phòng và vé Spa có liên kết hotel"""
    from schemas import HotelRoomCreate, HotelRoomUpdate

    room_in = HotelRoomCreate(
        code="TEST-01",
        name="Phòng Test",
        zone="cat",
        room_group="Tầng 1 Khu Mèo",
        price_per_day=160000,
        price_per_hour=25000,
        capacity=2,
        description="Có máy lạnh"
    )
    assert room_in.room_group == "Tầng 1 Khu Mèo"
    assert room_in.price_per_hour == 25000
    assert room_in.capacity == 2

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(hotel_rooms)")
        r_cols = {row["name"] for row in cursor.fetchall()}
        assert "room_group" in r_cols, "Thiếu cột room_group trong hotel_rooms"
        assert "price_per_hour" in r_cols, "Thiếu cột price_per_hour trong hotel_rooms"
        assert "capacity" in r_cols, "Thiếu cột capacity trong hotel_rooms"

        cursor.execute("PRAGMA table_info(pet_service_tickets)")
        spa_cols = {row["name"] for row in cursor.fetchall()}
        assert "hotel_booking_id" in spa_cols, "Thiếu cột hotel_booking_id trong pet_service_tickets"
        assert "target_hotel_room_id" in spa_cols, "Thiếu cột target_hotel_room_id trong pet_service_tickets"

def test_hotel_room_crud_and_spa_workflow_apis():
    """Task 2: Kiểm tra các API CRUD phòng, room-groups và workflow chuyển Spa <-> Hotel"""
    from fastapi.testclient import TestClient
    from server import app
    client = TestClient(app)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM hotel_rooms WHERE code LIKE 'CUSTOM-%'")
        old_ids = [r["id"] for r in cursor.fetchall()]
        if old_ids:
            placeholders = ",".join("?" for _ in old_ids)
            cursor.execute(f"DELETE FROM pet_service_tickets WHERE hotel_booking_id IN (SELECT id FROM hotel_bookings WHERE room_id IN ({placeholders}))", old_ids)
            cursor.execute(f"DELETE FROM hotel_bookings WHERE room_id IN ({placeholders})", old_ids)
            cursor.execute(f"DELETE FROM hotel_rooms WHERE id IN ({placeholders})", old_ids)
            conn.commit()

    # 1. POST /api/hotel/rooms (tạo phòng mới)
    create_payload = {
        "code": "CUSTOM-99",
        "name": "Phòng Hoàng Gia Mới",
        "zone": "vip",
        "room_group": "Khu Biệt Thự",
        "price_per_day": 350000,
        "price_per_hour": 50000,
        "capacity": 2,
        "description": "Camera 24/7 và sofa riêng"
    }
    create_res = client.post("/api/hotel/rooms", json=create_payload)
    assert create_res.status_code == 200
    new_room = create_res.json()
    new_room_id = new_room["id"]
    assert new_room["code"] == "CUSTOM-99"
    assert new_room["room_group"] == "Khu Biệt Thự"

    # 2. GET /api/hotel/room-groups
    groups_res = client.get("/api/hotel/room-groups")
    assert groups_res.status_code == 200
    groups = groups_res.json()
    assert "Khu Biệt Thự" in groups

    # 3. PUT /api/hotel/rooms/{id} (sửa phòng)
    update_res = client.put(f"/api/hotel/rooms/{new_room_id}", json={"price_per_day": 380000, "name": "Phòng Hoàng Gia VIP"})
    assert update_res.status_code == 200
    assert update_res.json()["price_per_day"] == 380000

    # 4. Tạo 1 vé spa mẫu và chuyển sang hotel qua POST /api/hotel/transfer-from-spa/{ticket_id}
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM contacts LIMIT 1")
        cid = cursor.fetchone()["id"]
        cursor.execute("SELECT id, name FROM pets WHERE customer_id = ? LIMIT 1", (cid,))
        p_row = cursor.fetchone()
        if not p_row:
            cursor.execute("INSERT INTO pets (customer_id, name, species) VALUES (?, 'Bé Test', 'dog')", (cid,))
            pid = cursor.lastrowid
            pname = 'Bé Test'
        else:
            pid = p_row["id"]
            pname = p_row["name"]

        cursor.execute("""
            INSERT INTO pet_service_tickets (
                customer_id, pet_id, service_type, price, status, weight_at_service
            ) VALUES (?, ?, 'Combo Tắm Vệ Sinh', 200000, 'done', 4.5)
        """, (cid, pid))
        test_ticket_id = cursor.lastrowid

    transfer_res = client.post(f"/api/hotel/transfer-from-spa/{test_ticket_id}", json={
        "room_id": new_room_id,
        "expected_checkout_time": "2026-10-02T10:00:00",
        "feeding_notes": "Ăn 2 cữ",
        "items_brought": "1 túi xách"
    })
    assert transfer_res.status_code == 200
    b_data = transfer_res.json()
    b_id = b_data["booking_id"]
    assert b_id > 0

    # 5. Chiều 2: Đặt lịch Spa cho bé đang ở Hotel qua POST /api/hotel/book-spa-for-guest/{booking_id}
    book_spa_res = client.post(f"/api/hotel/book-spa-for-guest/{b_id}", json={
        "service_type": "Cắt Tỉa Lông Toàn Thân",
        "price": 250000,
        "note": "Cắt gọn gàng"
    })
    assert book_spa_res.status_code == 200
    assert book_spa_res.json()["success"] is True

    # 6. GET /api/hotel/checkout-summary/{booking_id} (tổng hợp tiền gộp)
    summary_res = client.get(f"/api/hotel/checkout-summary/{b_id}")
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert summary["room_total"] >= 380000
    assert summary["spa_total"] == 450000 # 200k từ vé chuyển sang + 250k từ vé book thêm
    assert summary["grand_total"] == summary["room_total"] + 450000 - summary["deposit_amount"]

    # 7. Check-out và xác nhận ràng buộc xóa phòng
    client.post(f"/api/hotel/checkout/{b_id}", json={"payment_method": "cash"})
    # Phòng đã có lịch sử booking sẽ không cho xóa để bảo toàn dữ liệu
    del_fail_res = client.delete(f"/api/hotel/rooms/{new_room_id}")
    assert del_fail_res.status_code == 400

    # Thử xóa phòng trống chưa từng có booking
    temp_room_res = client.post("/api/hotel/rooms", json={"code": "TEMP-DEL", "name": "Phòng tạm", "price_per_day": 100000})
    temp_id = temp_room_res.json()["id"]
    del_res = client.delete(f"/api/hotel/rooms/{temp_id}")
    assert del_res.status_code == 200

def test_hotel_rooms_config_and_spa_workflow_ui_elements():
    """Task 3 & 4: Kiểm tra sự hiện diện của các thành phần UI quản lý buồng phòng và Spa workflow"""
    with open("templates/index.html", "r", encoding="utf-8") as f:
        html = f.read()

    # Sub-tab & UI cấu hình buồng phòng
    assert 'id="btn-hotel-view-rooms-config"' in html
    assert 'id="hotel-view-rooms-config"' in html
    assert 'id="tbody-hotel-rooms-config-list"' in html
    assert 'id="modal-hotel-room-editor"' in html
    assert 'id="hotel-room-input-code"' in html
    assert 'id="hotel-room-input-group"' in html
    assert 'id="hotel-room-groups-datalist"' in html

    # Modals cho Spa <-> Hotel workflow
    assert 'id="modal-hotel-book-spa"' in html
    assert 'id="modal-spa-transfer-hotel"' in html
    assert 'id="hotel-room-input-price-day"' in html
    assert 'id="hotel-room-input-price-hour"' in html

    with open("static/js/modules/hotel.js", "r", encoding="utf-8") as f:
        js = f.read()

    # Các hàm nghiệp vụ quản lý buồng phòng và workflow Spa
    assert 'openRoomEditorModal' in js
    assert 'saveRoomEditor' in js
    assert 'deleteRoom' in js
    assert 'renderRoomsConfigTable' in js
    assert 'loadRoomGroupsDatalist' in js
    assert 'openBookSpaModal' in js
    assert 'submitBookSpaForGuest' in js
    assert 'openSpaTransferModal' in js
    assert 'submitSpaTransferToHotel' in js
    assert 'batch-hotel-daily-rate' in js
    assert 'onBatchRoomSelectChange' in js
    assert "viewType === 'rooms_config'" in js or "vt === 'rooms_config'" in js or "'rooms_config'" in js

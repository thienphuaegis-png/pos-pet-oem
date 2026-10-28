# Kế Hoạch Triển Khai: Quản Lý Buồng Phòng, Phân Nhóm Khu Vực & Tích Hợp Workflow Spa ⟷ Hotel

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Thêm sub-tab cấu hình buồng phòng linh hoạt với thuộc tính nhóm phòng (khu vực); hoàn thiện workflow hai chiều giữa dịch vụ Spa và lưu trú Hotel (chuyển tiếp sau khi Spa xong, đặt lịch Spa cho bé đang lưu trú và gộp chung hóa đơn khi thanh toán).

**Architecture:** Mở rộng schema `hotel_rooms` và `pet_service_tickets`; bổ sung REST APIs quản lý buồng phòng CRUD và endpoint chuyển tiếp/gộp hóa đơn; xây dựng sub-tab cấu hình phòng trên UI; nâng cấp modal checkout và drawer Hotel.

**Tech Stack:** Python 3.11 / FastAPI / SQLite / TailwindCSS / Vanilla JavaScript (ES6).

---

### Task 1: Mở Rộng Schema Database & Pydantic Validation

**Files:**
- Modify: `database.py`
- Modify: `schemas.py`
- Test: `tests/test_hotel_system.py`

**Interfaces:**
- `hotel_rooms`: `room_group TEXT DEFAULT 'Khu Tiêu Chuẩn'`, `price_per_hour REAL DEFAULT 0`, `capacity INTEGER DEFAULT 1`
- `pet_service_tickets`: `hotel_booking_id INTEGER REFERENCES hotel_bookings(id)`, `target_hotel_room_id INTEGER REFERENCES hotel_rooms(id)`
- `schemas.HotelRoomCreate`, `schemas.HotelRoomUpdate`: hỗ trợ `room_group`, `price_per_hour`, `capacity`

- [ ] **Step 1: Write failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit/Checkpoint**

---

### Task 2: REST APIs Quản Lý Buồng Phòng & Tích Hợp Spa ⟷ Hotel

**Files:**
- Modify: `routers/hotel.py`
- Modify: `routers/spa.py` (nếu cần liên kết vé)
- Test: `tests/test_hotel_system.py`

**Interfaces:**
- `POST /api/hotel/rooms`: Tạo phòng mới (mã, tên, nhóm, giá, sức chứa)
- `PUT /api/hotel/rooms/{id}`: Sửa phòng
- `DELETE /api/hotel/rooms/{id}`: Xóa phòng trống
- `GET /api/hotel/room-groups`: Lấy danh sách nhóm phòng phân biệt
- `POST /api/hotel/transfer-from-spa/{ticket_id}`: Chuyển vé Spa sang lưu trú Hotel
- `POST /api/hotel/book-spa-for-guest/{booking_id}`: Tạo vé Spa cho bé đang ở Hotel
- `GET /api/hotel/checkout-summary/{booking_id}`: Trả về chi tiết tiền phòng + chi phí vé Spa gộp

- [ ] **Step 1: Write failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit/Checkpoint**

---

### Task 3: Xây Dựng Sub-tab `[🏢 Cấu Hình & Danh Sách Phòng]`

**Files:**
- Modify: `templates/index.html`
- Modify: `static/js/modules/hotel.js`
- Test: `tests/test_hotel_system.py`

**Interfaces:**
- View Switcher: Nút `#btn-hotel-view-config`
- Container: `#hotel-view-config`
- Modal: `#modal-hotel-room-config` (Thêm/Sửa buồng phòng)
- Functions: `loadRoomConfigTable()`, `openRoomConfigModal(roomId)`, `saveRoomConfig()`, `deleteRoom(roomId)`

- [ ] **Step 1: Write failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit/Checkpoint**

---

### Task 4: Workflow Spa ⟷ Hotel & Modal Thanh Toán Gộp (Cách B)

**Files:**
- Modify: `templates/index.html`
- Modify: `static/js/modules/hotel.js`
- Modify: `static/js/modules/spa.js`
- Test: `tests/test_hotel_system.py`

**Interfaces:**
- Drawer Hotel: Nút `[✂️ Đặt Lịch Spa Cho Bé]`
- Modal Checkout Hotel: Bảng kê gộp tiền phòng + các dịch vụ Spa đi kèm
- Spa table: Nút `[🏨 Chuyển Vào Hotel]` cho vé đã xong

- [ ] **Step 1: Write failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit/Checkpoint**

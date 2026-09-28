# Kế Hoạch Triển Khai: Phân Hệ Quản Lý Hotel (Khách Sạn Thú Cưng)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Triển khai hoàn chỉnh phân hệ Quản Lý Khách Sạn Thú Cưng (Pet Hotel) độc lập trên Menu chính, hỗ trợ 3 chế độ xem linh hoạt (Lưới phòng + Drawer, Bảng danh sách, Lịch Gantt), tác nghiệp Check-in/Check-out tính tiền theo ngày/đêm và đồng bộ lịch sử vào Tab Hóa Đơn (`tab-orders`).

**Architecture:** Sử dụng kiến trúc module hóa: Database SQLite bổ sung 2 bảng `hotel_rooms` và `hotel_bookings`; Backend triển khai `routers/hotel.py` theo FastAPI; Frontend xây dựng `static/js/modules/hotel.js` quản lý state 3 view và tích hợp trực tiếp vào thanh điều hướng trong `templates/index.html` và `static/js/app.js`.

**Tech Stack:** Python 3.12+, FastAPI, SQLite3, TailwindCSS, Vanilla JavaScript ES6 Modules, Pytest.

---

## File Structure Map

| File | Responsibility |
|---|---|
| `database.py` | Create schema `hotel_rooms` và `hotel_bookings` |
| `schemas.py` | Pydantic models: `HotelRoomOut`, `HotelBookingCreate`, `HotelBookingOut`, `HotelCheckoutRequest` |
| `routers/hotel.py` | API endpoints: Quản lý phòng, Check-in, Check-out, Lịch sử lưu trú |
| `main.py` | Đăng ký `hotel.router` vào FastAPI application |
| `tools/seed_hotel_data.py` | Seed 16 buồng phòng chuẩn (Khu Mèo, Khu Chó, VIP) và vài booking mẫu |
| `templates/index.html` | Thêm Tab `#tab-hotel` (3 view + Drawer + Modals) và Subtab Lịch sử trong `#tab-orders` |
| `static/js/modules/hotel.js` | Module JS điều khiển logic 3 View, Check-in, Check-out, Drawer và Gantt |
| `static/js/app.js` | Đăng ký sự kiện chuyển tab menu chính `tab-hotel` |
| `tests/test_hotel_system.py` | Unit test & Integration test toàn bộ luồng Hotel |

---

### Task 1: Database Schema & Pydantic Schemas

**Files:**
- Modify: `database.py`
- Modify: `schemas.py`
- Create: `tools/seed_hotel_data.py`
- Test: `tests/test_hotel_system.py`

- [ ] **Step 1:** Viết file test `tests/test_hotel_system.py` kiểm tra sự tồn tại của 2 bảng `hotel_rooms`, `hotel_bookings` và các trường dữ liệu quan trọng.
- [ ] **Step 2:** Chạy pytest để xác nhận test ban đầu fail (do bảng chưa tồn tại).
- [ ] **Step 3:** Thêm `CREATE TABLE IF NOT EXISTS hotel_rooms` và `hotel_bookings` vào `database.py:init_db()`.
- [ ] **Step 4:** Thêm các Pydantic schema vào `schemas.py`.
- [ ] **Step 5:** Tạo và chạy script `tools/seed_hotel_data.py` khởi tạo 16 buồng phòng chuẩn (C01-C08, D01-D06, V01-V02).
- [ ] **Step 6:** Chạy test kiểm tra schema và dữ liệu seed passed.

---

### Task 2: Backend Router & API Endpoints

**Files:**
- Create: `routers/hotel.py`
- Modify: `main.py`
- Test: `tests/test_hotel_system.py`

- [ ] **Step 1:** Thêm test API endpoints trong `tests/test_hotel_system.py` (`GET /api/hotel/rooms`, `POST /api/hotel/checkin`, `POST /api/hotel/checkout/{id}`, `GET /api/hotel/bookings/history`).
- [ ] **Step 2:** Chạy test để xác nhận fail khi chưa có router.
- [ ] **Step 3:** Viết `routers/hotel.py` xử lý logic lấy danh sách phòng kèm trạng thái, tạo booking nhận bé, trả bé tính tiền ngày x giá phòng và cập nhật trạng thái phòng.
- [ ] **Step 4:** Include `hotel.router` vào `main.py`.
- [ ] **Step 5:** Chạy pytest xác nhận các endpoint API hoạt động chính xác và trả về HTTP 200/201.

---

### Task 3: Giao Diện HTML Tab Hotel & Subtab Hóa Đơn

**Files:**
- Modify: `templates/index.html`
- Test: `tests/test_hotel_system.py`

- [ ] **Step 1:** Thêm test kiểm tra sự hiện diện của DOM elements: nút menu tab `🏨 Khách Sạn`, `#tab-hotel`, các container view `#hotel-view-grid`, `#hotel-view-table`, `#hotel-view-gantt`, drawer `#hotel-drawer`, modal `#modal-hotel-checkin`, `#modal-hotel-checkout`, và subtab `#orders-subview-hotel` trong `#tab-orders`.
- [ ] **Step 2:** Chạy test để xác nhận fail.
- [ ] **Step 3:** Bổ sung nút bấm Tab Khách Sạn trên navbar chính trong `templates/index.html`.
- [ ] **Step 4:** Bổ sung markup `#tab-hotel` chứa KPI bar, bộ chọn 3 chế độ xem (Lưới phòng + Drawer, Bảng danh sách, Lịch Gantt) và 2 modal Check-in / Check-out.
- [ ] **Step 5:** Thêm Sub-tab thứ 3 `[🏨 Lịch Sử Lưu Trú Hotel]` vào `#tab-orders`.
- [ ] **Step 6:** Chạy test xác nhận DOM elements hợp lệ 100%.

---

### Task 4: Module JavaScript Xử Lý Nghiệp Vụ (`static/js/modules/hotel.js`)

**Files:**
- Create: `static/js/modules/hotel.js`
- Modify: `static/js/app.js`
- Test: `tests/test_hotel_system.py`

- [ ] **Step 1:** Thêm test kiểm tra sự tồn tại và các hàm export của `window.hotelManager` trong `tests/test_hotel_system.py`.
- [ ] **Step 2:** Chạy test xác nhận fail.
- [ ] **Step 3:** Triển khai `static/js/modules/hotel.js` với các chức năng:
  - `loadHotelRooms()`: Tải dữ liệu phòng và render lên Lưới và Drawer.
  - `switchHotelView(viewType)`: Chuyển đổi mượt mà giữa Grid (Mẫu 2), Table và Gantt (Mẫu 3).
  - `openHotelCheckinModal(roomCode)`: Nạp dữ liệu khách & thú cưng vào form check-in.
  - `submitHotelCheckin()`: Gọi API check-in, cập nhật giao diện.
  - `openHotelCheckoutModal(bookingId)`: Tính toán số ngày và tiền phòng, chuẩn bị thanh toán.
  - `submitHotelCheckout(bookingId)`: Hoàn tất trả phòng và chuyển phiếu sang lịch sử.
  - `renderHotelGanttTimeline()`: Dựng lịch Gantt 7 ngày trong tuần.
- [ ] **Step 4:** Đăng ký sự kiện mở `#tab-hotel` trong `static/js/app.js`.
- [ ] **Step 5:** Chạy toàn bộ test suite kiểm tra tích hợp frontend và backend.

---

### Task 5: Kiểm Thử Toàn Diện & Nghiệm Thu Trực Quan

**Files:**
- Run: `pytest tests/test_hotel_system.py`
- Manual check: Khởi chạy server và kiểm tra trực quan trên trình duyệt (thao tác Check-in, đổi phòng, xem Gantt, Check-out và tra cứu tại Tab Hóa Đơn).

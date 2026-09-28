# Thiết Kế Chi Tiết: Phân Hệ Quản Lý Hotel (Khách Sạn Thú Cưng)

**Ngày:** 2026-09-28  
**Tác giả:** Bùi Thiên Phú & Hermes  
**Trạng thái:** Approved by User  
**Mục tiêu:** Xây dựng phân hệ quản lý Khách Sạn Thú Cưng (Pet Hotel) độc lập trên Menu chính, hỗ trợ 3 chế độ xem linh hoạt (Lưới buồng phòng + Drawer chi tiết, Bảng danh sách phiếu lưu trú, và Lịch Gantt dòng thời gian), quản lý check-in/check-out tính tiền theo ngày/đêm, và đồng bộ chuyển lịch sử lưu trú hoàn tất sang Tab Hóa Đơn (`tab-orders`).

---

## 1. Cấu Trúc Giao Diện & Điều Hướng (UI Architecture)

### 1.1 Vị Trí Menu Chính
- Bổ sung nút Tab `🏨 Khách Sạn` trên thanh điều hướng chính (`#main-nav-tabs`), nằm ngang hàng với POS, Spa, Kho.
- Đặt id container chính là `#tab-hotel`.

### 1.2 Thanh Thao Tác & Chuyển Đổi 3 Chế Độ Xem (View Switcher)
Trên cùng `#tab-hotel` gồm:
1. **KPI Thống Kê Nhanh (5 thẻ):**
   - Tổng số buồng/phòng.
   - Số buồng đang có khách (kèm tỷ lệ %).
   - Số buồng trống sẵn sàng đón khách.
   - Số bé đến lịch đón hôm nay.
   - Doanh thu lưu trú tạm tính lũy kế.
2. **Bộ Lọc Nhanh & View Switcher:**
   - Nút Chuyển Chế Độ Xem:
     - `[🏨 Lưới Buồng Phòng]` (Mẫu 2)
     - `[📋 Bảng Danh Sách]` (Table View)
     - `[📅 Lịch Dòng Thời Gian]` (Mẫu 3 Gantt)
   - Bộ lọc trạng thái: Tất cả, Phòng trống, Đang ở, Trả hôm nay.
   - Nút `[➕ Nhận Bé Mới (Check-in)]`.

### 1.3 Chi Tiết 3 Chế Độ Xem Trong Tab Hotel

#### View 1: Lưới Buồng Phòng + Drawer Trượt (Mẫu 2)
- **Cột Trái (8/12 cột):** Lưới thẻ phòng hiển thị phân khu rõ ràng (Khu Mèo C01-C08, Khu Chó D01-D06, Khu VIP V01-V02).
  - Thẻ phòng trống: Viền nét đứt màu xanh ngọc, nút "+ Nhận bé".
  - Thẻ phòng có khách: Nền hồng/cam, mã buồng, tên bé + giống, tên chủ + SĐT, số ngày đã ở, tạm tính tiền.
- **Cột Phải (4/12 cột - Sticky Drawer):**
  - Khi click vào phòng nào, hiển thị chi tiết bé cưng đang ở phòng đó: Ảnh/icon, chủ nuôi, giờ vào, giờ dự kiến đón.
  - **Nhật ký cho ăn hôm nay:** Checkbox bữa sáng, bữa chiều.
  - **Ghi chú y tế & chế độ chăm sóc riêng:** Đồ mang theo, loại thức ăn.
  - Nút `🖨️ In Phiếu Lưu Trú` và nút `💳 Check-out Trả Phòng`.

#### View 2: Bảng Danh Sách Phiếu Lưu Trú Đang Ở (Table View)
- Bảng hiển thị các phiếu lưu trú đang có hiệu lực (`status = 'active'`).
- Cột: STT, Mã phiếu (`HT-...`), Buồng phòng, Bé cưng, Khách hàng & SĐT, Ngày vào, Ngày đón dự kiến, Số ngày, Tạm tính, Thao tác (Check-out, In phiếu, Đổi phòng).

#### View 3: Lịch Gantt Dòng Thời Gian (Mẫu 3)
- Bảng ma trận: Cột dọc là danh sách các phòng, Hàng ngang là 7 ngày trong tuần hiện tại (kèm nút tuần trước/tuần tới).
- Các dải màu kéo dài giữa các ngày hiển thị thời gian lưu trú hoặc đặt trước (Booking).
- Click vào ô trống bất kỳ trên lịch để mở form Check-in / Booking vào đúng ngày và phòng đó.

### 1.4 Tab Hóa Đơn (`tab-orders`): Tích Hợp Lịch Sử Hotel Đã Hoàn Tất
- Thêm Sub-tab thứ 3 trong `#tab-orders`:
  - `[🛒 Hóa Đơn Bán Lẻ]`
  - `[🐾 Lịch Sử Hóa Đơn Spa]`
  - `[🏨 Lịch Sử Lưu Trú Hotel]`
- Khi một phiếu lưu trú Hotel được Check-out và thanh toán, trạng thái đổi thành `completed` và tự động lưu vào danh sách tra cứu lịch sử tại Sub-tab này (giúp màn hình tác nghiệp Hotel luôn gọn gàng, chỉ chứa các phòng đang có khách).

---

## 2. Thiết Kế Cơ Sở Dữ Liệu (Database Schema)

### 2.1 Bảng `hotel_rooms` (Danh mục buồng phòng)
```sql
CREATE TABLE IF NOT EXISTS hotel_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,          -- VD: 'C01', 'D01', 'VIP01'
    name TEXT NOT NULL,                 -- VD: 'Phòng Gỗ Mèo C01'
    zone TEXT NOT NULL DEFAULT 'cat',   -- 'cat', 'dog_small', 'dog_large', 'vip'
    price_per_day REAL NOT NULL DEFAULT 150000,
    status TEXT NOT NULL DEFAULT 'available', -- 'available', 'occupied', 'cleaning', 'maintenance'
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.2 Bảng `hotel_bookings` (Phiếu lưu trú & đặt lịch)
```sql
CREATE TABLE IF NOT EXISTS hotel_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,          -- VD: 'HT-260928-0001'
    room_id INTEGER NOT NULL REFERENCES hotel_rooms(id),
    contact_id INTEGER NOT NULL REFERENCES contacts(id),
    pet_id INTEGER NOT NULL REFERENCES pets(id),
    check_in_time TIMESTAMP NOT NULL,
    expected_checkout_time TIMESTAMP NOT NULL,
    actual_checkout_time TIMESTAMP,
    daily_rate REAL NOT NULL,
    total_days REAL DEFAULT 1,
    total_amount REAL NOT NULL DEFAULT 0,
    feeding_notes TEXT,                 -- Chế độ ăn uống
    items_brought TEXT,                 -- Đồ dùng mang theo
    daily_care_log TEXT,                -- JSON lưu trữ nhật ký chăm sóc hàng ngày
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'completed', 'cancelled'
    order_id INTEGER REFERENCES orders(id), -- Liên kết với đơn hàng POS khi thanh toán
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. Danh Sách Endpoint Backend API (`routers/hotel.py`)

- `GET /api/hotel/rooms`: Lấy danh sách buồng phòng kèm trạng thái và thông tin bé đang ở.
- `POST /api/hotel/rooms`: Thêm mới hoặc cập nhật buồng phòng.
- `GET /api/hotel/bookings/active`: Lấy danh sách các phiếu đang lưu trú.
- `GET /api/hotel/bookings/history`: Lấy lịch sử các phiếu lưu trú đã hoàn tất (cho tab Hóa Đơn).
- `POST /api/hotel/checkin`: Tạo phiếu nhận bé vào phòng, cập nhật phòng sang `occupied`.
- `POST /api/hotel/checkout/{booking_id}`: Trả phòng, tính tổng ngày và thành tiền, cập nhật phòng về `available`, tạo hóa đơn bán hàng/dịch vụ liên kết.
- `PATCH /api/hotel/bookings/{booking_id}/care-log`: Cập nhật nhật ký ăn uống/sức khỏe.

---

## 4. Danh Sách File Tác Động
- `database.py`: Thêm bảng `hotel_rooms` và `hotel_bookings`.
- `schemas.py`: Định nghĩa Pydantic models cho Hotel Room, Booking, Check-in, Check-out.
- `routers/hotel.py`: Triển khai router FastAPI xử lý API buồng phòng và lưu trú.
- `main.py`: Include `hotel.router`.
- `templates/index.html`: Thêm tab `#tab-hotel`, 3 chế độ xem, drawer trượt, popup check-in/check-out, và subtab trong `#tab-orders`.
- `static/js/modules/hotel.js`: Module JavaScript xử lý nạp phòng, chuyển đổi 3 view, check-in, check-out, và vẽ Gantt chart.
- `static/js/app.js`: Đăng ký điều hướng menu cho Tab Hotel.
- `tests/test_hotel_system.py`: Test suite toàn diện cho DB schema, API CRUD, check-in, check-out và UI elements.

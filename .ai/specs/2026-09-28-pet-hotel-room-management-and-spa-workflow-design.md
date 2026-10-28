# Đặc Tả Thiết Kế: Quản Lý Danh Sách Phòng, Phân Nhóm Khu Vực & Workflow Hai Chiều Spa - Hotel

- **Ngày ban hành:** 2026-09-28
- **Tác giả:** Bùi Thiên Phú & Hermes Agent
- **Trạng thái:** Đã phê duyệt (Approved)
- **Hệ thống:** POS Offline Petcare (`pos-offline-petcare2`)

---

## 1. Mục Tiêu Nghiệp Vụ
1. **Quản lý linh hoạt buồng phòng:** Người dùng có thể tự thêm buồng phòng mới, đổi tên, định giá ngày/giờ, đặt sức chứa và phân chia theo **Nhóm phòng (Khu vực)** tự do (VD: Tầng 1 Khu Mèo, Khu Biệt Thự VIP, Chuồng Inox Lớn...).
2. **Sub-tab cấu hình phòng:** Thêm sub-tab `[🏢 Cấu Hình & Danh Sách Phòng]` trong phân hệ Hotel để thêm/sửa/xóa buồng phòng.
3. **Workflow hai chiều Spa ⟷ Hotel:**
   - **Chiều 1 (Spa ➔ Hotel):** Làm Spa xong, chuyển thẳng bé vào buồng phòng Hotel đã đặt trước hoặc tạo mới phiếu lưu trú, mang toàn bộ thông tin khách/bé/cân nặng sang.
   - **Chiều 2 (Hotel ➔ Spa):** Bé đang ở Hotel có thể đặt lịch làm Spa ngay từ màn hình Hotel hoặc Spa, tự động gộp chi phí Spa vào phiếu Hotel.
   - **Gộp thanh toán (Cách B):** Khi check-out Hotel, hệ thống tự động tổng hợp: Tiền phòng + Dịch vụ Spa đi kèm - Tiền cọc = Tổng thu tại quầy một lần duy nhất.

---

## 2. Thiết Kế Cơ Sở Dữ Liệu & API

### 2.1. Cập nhật Bảng `hotel_rooms`
- `room_group TEXT DEFAULT 'Khu Tiêu Chuẩn'`: Tên nhóm phòng / khu vực linh hoạt.
- `price_per_hour REAL DEFAULT 0`: Đơn giá theo giờ (nếu có).
- `capacity INTEGER DEFAULT 1`: Sức chứa tối đa số bé.

### 2.2. Cập nhật Bảng `pet_service_tickets` (Vé Spa)
- `hotel_booking_id INTEGER REFERENCES hotel_bookings(id)`: Liên kết vé Spa với phiếu lưu trú Hotel để gộp chi phí.
- `target_hotel_room_id INTEGER REFERENCES hotel_rooms(id)`: Buồng phòng dự kiến chuyển vào sau khi hoàn tất Spa.

### 2.3. Endpoints REST API
- **Quản lý phòng:**
  - `GET /api/hotel/rooms`: Trả về danh sách phòng kèm `room_group`.
  - `POST /api/hotel/rooms`: Tạo buồng phòng mới.
  - `PUT /api/hotel/rooms/{room_id}`: Cập nhật thông tin buồng phòng (tên, nhóm, giá, trạng thái).
  - `DELETE /api/hotel/rooms/{room_id}`: Xóa phòng nếu đang ở trạng thái trống (`available`).
  - `GET /api/hotel/room-groups`: Danh sách các nhóm phòng hiện có để gợi ý droplist.
- **Workflow Spa ⟷ Hotel:**
  - `POST /api/hotel/transfer-from-spa/{ticket_id}`: Chuyển vé Spa đã xong sang lưu trú Hotel (tạo phiếu check-in và liên kết).
  - `POST /api/hotel/book-spa-for-guest/{booking_id}`: Tạo vé Spa từ khách đang lưu trú Hotel và gắn `hotel_booking_id`.
  - `GET /api/hotel/bookings/{booking_id}/summary`: Tính toán tổng chi phí gộp (tiền phòng + các vé Spa liên kết - tiền cọc).

---

## 3. Thiết Kế Giao Diện Người Dùng (UI/UX)

### 3.1. Sub-tab Quản Lý Phòng (`#hotel-view-config`)
- Nằm trên thanh View Switcher của phân hệ Hotel:
  - `🏨 Lưới Phòng` | `📋 Bảng Danh Sách` | `📅 Lịch Dòng Thời Gian` | `🏢 Danh Sách & Cấu Hình Phòng`
- Giao diện gồm:
  - Bộ lọc theo Nhóm phòng (Tab chips hoặc Droplist).
  - Nút `[➕ Thêm Buồng Phòng Mới]` mở modal nhập mã, tên, chọn/nhập nhóm phòng, giá ngày, tiện ích.
  - Bảng danh sách buồng phòng: Mã, Tên, Nhóm phòng (Badge màu), Giá ngày, Sức chứa, Trạng thái (Trống / Đang ở / Bảo trì), Thao tác Sửa / Xóa.

### 3.2. Chuyển Tiếp Spa ➔ Hotel Trên Giao Diện
- Trên bảng tác nghiệp Spa, mỗi vé có checkbox `[🏨 Gửi Hotel]` kèm chọn phòng giữ chỗ.
- Khi bấm "Hoàn tất Spa" (hoặc nút `[🏨 Chuyển Vào Hotel]`), tự động tạo phiếu Check-in Hotel và thông báo mã phòng.

### 3.3. Đặt Lịch Spa Cho Bé Đang Ở Hotel
- Trong Drawer chi tiết buồng phòng Hotel: Thêm nút `[✂️ Đặt Lịch Spa Cho Bé]`.
- Chọn gói dịch vụ Spa (Tắm sấy, cắt tỉa...) -> Tự tạo vé Spa liên kết.

### 3.4. Modal Check-out Gộp Chi Phí
- Modal Check-out hiển thị bảng kê chi tiết:
  - Tiền phòng: `... ngày × ... đ/ngày = ... đ`
  - Dịch vụ Spa đi kèm: Danh sách các gói Spa đã làm trong kỳ lưu trú.
  - Đã đặt cọc: `- ... đ`
  - **TỔNG CỘNG THANH TOÁN GỘP**.

# Kế Hoạch Thiết Kế & Triển Khai: Phân Hệ Nhân Viên Spa, Trạng Thái Gọi Điện & Bảng Theo Dõi Chuyên Nghiệp

**Ngày:** 2026-09-18  
**Dự án:** POS KiotViet Offline (`pos-offline`)  
**Tác giả:** Hermes & Bùi Thiên Phú  

---

## 1. Định Hướng & Kiến Trúc Dài Hạn (Architecture & Extension)
1. **Kiến trúc Bật/Tắt Module Linh Hoạt (Feature Flags)**:
   - Các phân hệ: `OEM / Sản Xuất Gia Công`, `Dịch Vụ Spa Thú Cưng`, `Bán Hàng POS Thuần Túy`.
   - Cửa hàng không có OEM hoặc không có Spa có thể ẩn tab/chức năng qua cấu hình Settings mà **không cần xóa code hay xóa bảng**.
2. **Phân Quyền & Bảo Mật Dữ Liệu**:
   - Nhân viên tiếp tân / thợ chỉ xem và thao tác trong phân hệ Spa / POS được giao, không xem doanh thu nhạy cảm hay can thiệp vào cấu hình hệ thống.
3. **Tách Biệt Dịch Vụ & Hàng Hóa**:
   - Khách mua thức ăn, lược, phụ kiện $\to$ đi qua POS.
   - Bảng Spa chỉ thuần túy quản lý nghiệp vụ làm đẹp, chăm sóc, phụ thu dịch vụ và phân công thợ.

---

## 2. Chi Tiết Các Hạng Mục Triển Khai Đợt Này

### A. Bảng Dữ Liệu Mới `spa_staff` (Nhân Viên Spa)
- Schema:
  - `id` (INTEGER PRIMARY KEY)
  - `staff_code` (TEXT): Mã số thợ (vd: `2`, `3`, `4`, `5`)
  - `name` (TEXT): Tên nhân viên (vd: `Huyền Trân`, `Thanh Vân`, `Bé Ngọc`, `Cún`)
  - `phone` (TEXT): SĐT liên hệ
  - `role` (TEXT): Vai trò chuyên môn (`Tiếp nhận`, `Tắm vệ sinh`, `Cắt tỉa`, `Nhuộm`)
  - `is_active` (INTEGER DEFAULT 1): Còn làm việc (1) hoặc ẩn (0)

### B. Mở Rộng `pet_service_tickets` (Phiếu Spa Chuyên Sâu)
1. **Thời gian tự động**:
   - `received_time`: Tự động lấy giờ bấm bill/tạo phiếu (`HH:MM`).
   - `arrival_method`: `Khách chở tới` (mặc định) / `Shop đón`.
   - `checkout_time`: Tự động ghi nhận giờ (`HH:MM`) ngay khi nhân viên chuyển trạng thái sang **`Đã Về`**.
   - `return_method`: `Khách đón` (mặc định) / `Shop đưa về`.
2. **Trạng thái cuộc gọi khách hàng (`call_status`)**:
   - Nằm ngay sau cột SĐT: `Chưa gọi` / `Đã gọi đón` / `Không nghe máy` / `Hẹn giờ đón`.
3. **Phân công 5 vị trí thợ**:
   - `staff_receiver` (Nhân viên nhận)
   - `staff_worker_1` (Nhân viên làm 1)
   - `staff_worker_2` (Nhân viên làm 2)
   - `staff_cutter` (Nhân viên cắt)
   - `staff_dyer` (Nhân viên nhuộm)
4. **Phụ thu dịch vụ & Tiền Tip**:
   - `surcharge` (Phụ thu chung)
   - `art_cutting_fee` (Phụ thu cắt nghệ thuật)
   - `teeth_cleaning` (Đánh răng: 0 hoặc số tiền, vd 20.000đ)
   - `shipping_fee` (Cước ship)
   - `tip_amount` (Tiền Tip)
5. **Trạng thái phiếu**:
   - Mở rộng 4 trạng thái: `⏳ Chờ` -> `🔄 Đang làm` -> `✅ Xong` -> `🏠 Đã Về`.

### C. Giao Diện Người Dùng (UI)
1. **Thêm Sub-tab 3: `👥 Nhân Viên Spa`**:
   - Thêm, sửa, xem danh sách thợ Spa, mã số thợ, vai trò.
2. **Modal Lập Phiếu & Sửa Phiếu Spa**:
   - Bổ sung các droplist chọn thợ, các ô phụ thu (Đánh răng, Cắt nghệ thuật, Tip, Ship), hình thức đón/về.
3. **Bảng Theo Dõi Dịch Vụ Spa Đầy Đủ**:
   - Render đầy đủ các cột tương tự bảng Excel theo dõi thực tế của anh.
   - Thêm nút/droplist gọi điện nhanh ngay sau SĐT.
   - Khi chọn trạng thái `Đã Về`, tự động fill giờ hiện tại vào `THỜI GIAN VỀ`.

---

## 3. Kế Hoạch Thực Hiện
- [ ] **Bước 1**: Tạo bảng SQLite `spa_staff`, nạp dữ liệu mẫu (`4 Huyền Trân`, `3 Thanh Vân`, `2 Bé Ngọc`, `5 Cún`).
- [ ] **Bước 2**: Bổ sung các cột mới vào `pet_service_tickets` và cập nhật backend API (`routers/partners.py`).
- [ ] **Bước 3**: Tạo giao diện sub-tab `👥 Nhân Viên Spa` và tích hợp vào form tạo/sửa phiếu spa.
- [ ] **Bước 4**: Cập nhật bảng theo dõi phiếu spa đầy đủ cột, trạng thái gọi điện và tự động hóa giờ về khi `Đã Về`.
- [ ] **Bước 5**: Kiểm thử tự động bằng Python script xác thực toàn bộ flow.

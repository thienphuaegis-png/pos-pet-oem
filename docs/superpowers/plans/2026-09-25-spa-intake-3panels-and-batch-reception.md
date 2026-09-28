# Kế Hoạch Triển Khai: Tiếp Nhận Spa 3 Cột & Nhập Hàng Loạt Nhiều Bé

## Mục Tiêu
Nâng cấp toàn diện modal tiếp nhận Spa: 3 cột luôn mở, nhập nhanh dạng bảng Google Sheets nhiều bé, cờ đỏ lưu ý khách hàng, đưa phụ thu vào form tạo và định dạng tiền tệ chuyên nghiệp.

---

## Chi Tiết Các Bước Triển Khai

### Giai Đoạn 1: Cơ Sở Dữ Liệu & Backend APIs
- [ ] **Bước 1.1:** Cập nhật `database.py`:
  - Thêm cột `is_flagged INTEGER DEFAULT 0` và `warning_note TEXT DEFAULT ''` vào bảng `contacts`.
  - Thêm cột `batch_code TEXT DEFAULT ''` vào bảng `pet_service_tickets`.
- [ ] **Bước 1.2:** Cập nhật `routers/partners.py`:
  - Thêm endpoint `PUT /api/contacts/{id}/warning` để cập nhật cảnh báo khách hàng.
  - Thêm endpoint `POST /api/pet-services/batch` tiếp nhận mảng danh sách vé nhiều bé trong 1 transaction.
  - Thêm endpoint `GET /api/pet-services/history/customer/{id}` trả về lịch sử làm đẹp của khách (có tùy chọn lọc theo `pet_id`).
- [ ] **Bước 1.3:** Viết test backend trong `tests/test_spa_batch_intake.py` và chạy xác nhận pass.

### Giai Đoạn 2: Giao Diện Người Dùng (`templates/index.html`)
- [ ] **Bước 2.1:** Thiết kế lại `#modal-create-service-ticket`:
  - Mở rộng kích thước modal (`max-w-7xl`).
  - Thanh header: chuyển chế độ giữa `🐾 1 Bé Đơn Lẻ (3 Cột)` và `⚡ Nhập Hàng Loạt (Sheets)`.
  - Banner Cảnh Báo Danh Sách Đỏ (`#svc-red-flag-banner`) hiển thị nổi bật dưới thanh chọn khách.
- [ ] **Bước 2.2:** Xây dựng khung 3 Cột cho Chế độ 1 Bé:
  - Cột 1: Dịch vụ & Bé.
  - Cột 2: Phụ thu & Tài chính thanh toán (các ô tiền có định dạng phân cách hàng nghìn).
  - Cột 3: Lịch sử Spa của khách hàng (luôn hiển thị, có dropdown lọc thú cưng).
- [ ] **Bước 2.3:** Xây dựng khung Bảng Grid Nhập Hàng Loạt cho Chế độ Sheets:
  - Bảng nhập nhanh nhiều dòng thú cưng.
  - Nút thêm dòng bé, xóa dòng, tính tổng tiền hàng loạt.

### Giai Đoạn 3: Logic JavaScript (`static/js/app.js`)
- [ ] **Bước 3.1:** Thêm hàm định dạng tiền tệ `formatMoneyInput(el)` và `parseMoneyInput(val)`.
- [ ] **Bước 3.2:** Thêm hàm nạp và hiển thị lịch sử Spa của khách `loadCustomerSpaHistoryDirectly(customerId, petId)`.
- [ ] **Bước 3.3:** Xử lý cảnh báo Danh sách đỏ khi chọn khách hàng (`renderCustomerWarningBanner(customer)`).
- [ ] **Bước 3.4:** Quản lý bảng nhập hàng loạt `addBatchPetRow()`, `calcBatchRowTotal()`, `calcBatchGrandTotal()`.
- [ ] **Bước 3.5:** Tích hợp gọi `POST /api/pet-services/batch` khi lưu đợt tiếp nhận nhiều bé.

### Giai Đoạn 4: Kiểm Thử Toàn Diện & Dữ Liệu Mẫu
- [ ] **Bước 4.1:** Seed dữ liệu mẫu khách hàng có danh sách đỏ + lịch sử làm đẹp nhiều bé.
- [ ] **Bước 4.2:** Chạy toàn bộ test suite pytest & JS test runtime.
- [ ] **Bước 4.3:** Cập nhật checkpoint `PROJECT_STATE.md`.

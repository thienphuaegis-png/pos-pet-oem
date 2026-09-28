# Kế Hoạch Triển Khai: Nâng Cấp Phân Hệ Dịch Vụ Spa Thú Cưng & Bảng Giá Theo Cân Nặng

**Tài liệu thiết kế tham chiếu:** `plans/2026-09-18-pet-spa-services-pricing-design.md`  
**Dự án:** POS KiotViet Offline (`pos-offline`)  

---

## Danh Sách Các Bước Thực Hiện (Implementation Steps)

### Giai đoạn 1: Database Migration & Backend Endpoints
- [ ] **Bước 1.1**: Tạo bảng SQLite `pet_service_pricing` và cập nhật các cột mới cho `pet_service_tickets` trong `database.py` (idempotent / `ALTER TABLE ADD COLUMN`).
- [ ] **Bước 1.2**: Nạp danh mục dịch vụ mẫu mặc định (Tắm, Cạo, Combo VIP 2/VIP 3, Super VIP, Spa Mèo, Nhuộm...) vào `pet_service_pricing`.
- [ ] **Bước 1.3**: Viết Router API CRUD Bảng giá dịch vụ:
  - `GET /api/pet-services/pricing`: Lấy danh mục bảng giá.
  - `POST /api/pet-services/pricing`: Thêm khoảng giá mới cho dịch vụ.
  - `PUT /api/pet-services/pricing/{id}`: Sửa khoảng giá / tên dịch vụ.
  - `DELETE /api/pet-services/pricing/{id}`: Xóa khoảng giá.
- [ ] **Bước 1.4**: Cập nhật API Tạo phiếu Spa `POST /api/pet-services`:
  - Logic tính `ticket_number`: đầu ngày random từ 5-10, các phiếu sau +1.
  - Logic tự động cập nhật `weight` mới nhất vào bảng `pets`.
  - Lưu đầy đủ các trường: `shaving_feet`, `customer_request`, `accessories`, `payment_status`, `payment_method`, `services_json`.

### Giai đoạn 2: Giao Diện Người Dùng (HTML & Client Logic)
- [ ] **Bước 2.1**: Thêm sub-tab `🏷️ Bảng Giá Dịch Vụ Theo Cân Nặng` trong `#tab-pet-services` (`templates/index.html`).
- [ ] **Bước 2.2**: Thiết kế lại Modal Lập Phiếu Spa `#modal-create-service-ticket`:
  - Ô tìm kiếm khách hàng linh hoạt kèm nút thêm khách nhanh.
  - Dropdown chọn bé cũ của khách hoặc nút thêm bé mới.
  - Form nhập: Giống (21 loại), Giới tính, Cân nặng (nhận cả `2.1` và `2,1`), Màu lông (20 màu).
  - Bảng chọn dịch vụ tự động dò và nhảy giá theo số kg.
  - Nhóm radio Lưu ý cạo bàn (*Không cạo bàn / Cạo bàn / Cạo bàn cao*).
  - Ô nhập Yêu cầu của khách, Phụ kiện, Ghi chú.
  - Chọn trạng thái thanh toán: Thanh toán trước hoặc Thanh toán sau.
- [ ] **Bước 2.3**: Xây dựng Modal Xem Trước & In Phiếu Tiếp Nhận Dịch Vụ (K80 / A5).

### Giai đoạn 3: Kiểm Thử & Xác Nhận (Verification)
- [ ] **Bước 3.1**: Viết test script tự động kiểm thử toàn bộ luồng tạo phiếu, cập nhật kg vào `pets`, sinh số thứ tự và dò giá theo cân nặng.
- [ ] **Bước 3.2**: Test giao diện trên trình duyệt và xác nhận các nút in phiếu hoạt động chính xác.

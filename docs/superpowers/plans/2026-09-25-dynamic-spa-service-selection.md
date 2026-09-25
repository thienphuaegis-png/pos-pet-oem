# Kế Hoạch Triển Khai: Nạp Động Gói Dịch Vụ Spa Vào Form Tiếp Nhận

## Mục tiêu
Đồng bộ tự động 100% danh sách dịch vụ trong form tạo phiếu tiếp nhận Spa (`#svc-primary-package` & `#svc-dye-package`) từ dữ liệu bảng giá thực tế trong cơ sở dữ liệu.

## Các bước thực hiện:

### Bước 1: Xóa Option Cứng Trong `templates/index.html`
- Xóa các thẻ `<optgroup>` và `<option>` tĩnh bên trong `#svc-primary-package` và `#svc-dye-package`.
- Giữ lại option mặc định:
  - `#svc-primary-package`: `<option value="">-- Chọn gói chính --</option>`
  - `#svc-dye-package`: `<option value="">-- Không nhuộm --</option>`

### Bước 2: Thêm Hàm `populateServicePackageDropdowns()` Trong `static/js/app.js`
- Quét toàn bộ `allPetPricingData`.
- Nhóm dịch vụ theo `category`:
  - Category không chứa "nhuộm" -> gom vào `<optgroup label="${category}">` của `#svc-primary-package`.
  - Category chứa "nhuộm" -> đưa vào `#svc-dye-package`.
- Tích hợp gọi hàm tại:
  - `openCreateServiceTicketModal()`: đảm bảo khi mở form luôn có danh sách mới nhất.
  - `loadPetPricingList()`: khi bảng giá được cập nhật/sửa/xóa/đổi tên.

### Bước 3: Viết Kiểm Thử Tự Động Trong `tests/test_pet_pricing_table.py`
- Kiểm tra tính toàn vẹn template (không còn option tĩnh).
- Kiểm tra logic JS `populateServicePackageDropdowns`.
- Kiểm tra trường hợp đổi tên dịch vụ trong DB -> dropdown hiển thị đúng tên mới.

### Bước 4: Chạy Toàn Bộ Test Suite & Nghiệm Thu
- `pytest tests/test_pet_pricing_table.py`
- Full test suite: `pytest`
- `node tests/test_spa_render.js`

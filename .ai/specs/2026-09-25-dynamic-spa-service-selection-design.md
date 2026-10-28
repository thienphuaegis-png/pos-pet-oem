# Thiết Kế: Nạp Động Danh Sách Gói Dịch Vụ Spa Vào Form Tạo Phiếu Tiếp Nhận

## 1. Mục Đích & Vấn Đề
- **Hiện trạng:** Modal tạo phiếu tiếp nhận dịch vụ Spa (`#modal-create-service-ticket`) có 2 dropdown chọn dịch vụ (`#svc-primary-package` và `#svc-dye-package`) đang bị gán tĩnh (hardcode) trong file `templates/index.html`.
- **Hệ quả:** Khi người dùng đổi tên dịch vụ hoặc thêm phân loại/dịch vụ mới trong Bảng Giá (`pet_service_pricing`), dropdown trong form tạo phiếu không cập nhật, vẫn hiển thị các tên dịch vụ cũ.
- **Mục tiêu:** Chuyển đổi 2 dropdown sang cơ chế nạp động 100% từ bảng giá dịch vụ thực tế trong DB (`allPetPricingData`), nhóm theo phân loại (`<optgroup>`).

---

## 2. Kiến Trúc Giải Pháp (Phương Án A)

### A. Giao Diện (UI / Templates)
- **File:** `templates/index.html`
- **Thay đổi:**
  - Làm trống các thẻ `<option>` tĩnh bên trong `<select id="svc-primary-package">` và `<select id="svc-dye-package">`.
  - Để lại option mặc định:
    - `#svc-primary-package`: `<option value="">-- Chọn gói chính --</option>`
    - `#svc-dye-package`: `<option value="">-- Không nhuộm --</option>`

### B. Logic Client-Side (JavaScript)
- **File:** `static/js/app.js`
- **Hàm mới `populateServicePackageDropdowns()`:**
  1. Trích xuất danh sách duy nhất các dịch vụ (`service_name`) kèm `category` từ `allPetPricingData`.
  2. Gom nhóm dịch vụ theo `category`.
  3. Đổ vào `#svc-primary-package`:
     - Bỏ qua các phân loại có tên chứa "nhuộm" (không phân biệt hoa thường).
     - Mỗi category tạo một `<optgroup label="${category}">`.
     - Bên trong optgroup là các `<option value="${service_name}">${service_name}</option>`.
  4. Đổ vào `#svc-dye-package`:
     - Gom tất cả các dịch vụ thuộc category có tên chứa "nhuộm".
     - Tạo danh sách `<option value="${service_name}">${service_name}</option>`.
  5. Bảo lưu giá trị đã chọn nếu gói dịch vụ đó vẫn tồn tại sau khi cập nhật.
- **Thời điểm gọi:**
  - Khi mở modal tạo phiếu: `openCreateServiceTicketModal()`.
  - Khi tải lại bảng giá / cập nhật bảng giá: `loadPetPricingList()`.

---

## 3. Kế Hoạch Kiểm Thử
1. **Kiểm tra DOM:** Đảm bảo 2 dropdown không còn option hardcode tĩnh.
2. **Kiểm thử Đồng bộ (E2E Integration Test):**
   - Đổi tên một dịch vụ trong bảng giá qua API (`PUT /api/pet-services/pricing/{id}`).
   - Kiểm tra xem hàm render dropdown có tạo ra đúng option mang tên mới hay không.
3. **Regression Tests:** Chạy full suite 15 test cases của backend và `test_spa_render.js`.

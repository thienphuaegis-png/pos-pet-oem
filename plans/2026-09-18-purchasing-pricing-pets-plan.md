# Kế Hoạch Triển Khai: Nhập Hàng 2 Bước, Bảng Giá Đa Cấp, Nhóm KH, Hồ Sơ Thú Cưng & Import Excel

**Mục tiêu:** 
1. Cải tiến phân hệ Nhập hàng (PO) theo quy trình 2 bước hiện đại (Tạo phiếu -> In phiếu kiểm tay -> Xác nhận nhập kho thực tế), đồng bộ thẻ KPI và bảng quản lý gọn gàng.
2. Import/Export Excel cho Khách Hàng và Nhà Cung Cấp.
3. Phân nhóm khách hàng gán Bảng Giá đa cấp (cài giá riêng từng SP, fallback giá lẻ mặc định).
4. Hồ sơ Thú cưng (1 Khách hàng - Nhiều thú cưng: Tên, Giống loài, Màu lông, Cân nặng, Ghi chú - không cần tuổi).

---

## 1. Database Schema (`database.py`)
- Bảng `pets`: `id, customer_id, name, species, breed, color, weight, note, created_at`
- Bảng `customer_groups`: `id, name, code, price_list_id, note, created_at`
- Migration `contacts`: Thêm cột `group_id INTEGER`
- Bảng `price_lists`: `id, name, code, is_default, note, created_at`
- Bảng `price_list_items`: `id, price_list_id, product_id, custom_price, created_at`
- Bảng `purchases`: Thêm cột `fund_source TEXT DEFAULT 'PERSONAL'` nếu chưa có, và bảng `purchase_actual_items` hoặc đối chiếu SL thực nhận.

---

## 2. Phân Hệ Backend (`routers/`)
- `routers/purchases.py`:
  - Thống kê KPI nhập hàng (Đơn chờ nhận, Tiền đã trả, Công nợ còn nợ, Tổng đơn).
  - API in phiếu kiểm tay thực tế (HTML print template).
  - API xác nhận nhập kho thực tế (2-step receive).
- `routers/partners.py`:
  - CRUD Thú cưng (`/api/customers/{id}/pets`, `/api/pets/{id}`).
  - CRUD Nhóm khách hàng (`/api/customer-groups`).
  - Import/Export Excel Khách hàng & NCC (`openpyxl`).
- `routers/price_lists.py`:
  - CRUD Bảng giá, gán nhóm khách hàng, cài giá riêng từng SP, tự động fallback giá lẻ mặc định.

---

## 3. Giao Diện Frontend (`templates/index.html` & `static/js/app.js`)
- Tab **Nhập Hàng (`tab-purchases`)**:
  - 4 thẻ KPI đầu trang.
  - Bảng danh sách đơn PO hiện đại (Mã Đơn, NCC, Kho, Hẹn Giao, Nguồn Tiền, Tổng Tiền, Đã Trả, Còn Nợ, Trạng Thái, Thao Tác).
  - Nút `🖨️ In phiếu kiểm tay` (mở trang in kiểm đếm thực tế).
  - Nút `📦 Nhận hàng thực tế` (modal đối chiếu SL đặt vs SL thực nhận).
- Tab **Khách Hàng & Đối Tác (`tab-contacts`)**:
  - Nút Import/Export Excel.
  - Quản lý Nhóm khách hàng.
  - Modal danh sách Thú cưng của từng khách hàng (Thêm/Sửa/Xóa thú cưng).
- Tab **Bảng Giá (`tab-price-lists`)**:
  - Danh sách bảng giá, gán nhóm KH áp dụng, cài đặt giá riêng từng sản phẩm.

---

## 4. Tài liệu & Sơ đồ
- Cập nhật `PROJECT_MAP.html`.

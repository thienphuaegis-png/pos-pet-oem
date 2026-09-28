# Kế Hoạch Triển Khai: Phân Hệ Gia Công OEM & Dự Báo Dòng Tiền Đa Quỹ

> **Goal:** Xây dựng phân hệ Quản lý Đặt Hàng Gia Công OEM tách biệt nguồn tiền (Công ty / Cá nhân), tự động trừ kho nguyên liệu tem/chai theo thực nhận và dự báo dòng tiền chi.

**Tech Stack:** Python 3.11, FastAPI, SQLite, Vanilla JS, Tailwind CSS.

---

## Danh Mục File Thay Đổi & Tạo Mới

| File | Hành động | Mục đích |
|---|---|---|
| `database.py` | Modify | Bổ sung bảng `oem_orders`, `oem_order_items`, cột `is_oem` trong `warehouses`, cột `fund_source` trong `cashbook` |
| `schemas.py` | Modify | Định nghĩa schema cho OEM Order, OEM Item, Nhận hàng & Dự báo dòng tiền |
| `routers/oem.py` | Create | Router xử lý toàn bộ logic CRUD, cọc tiền, nhận hàng, trừ NVL BOM và dự báo dòng tiền |
| `server.py` | Modify | Include `oem_router` vào ứng dụng FastAPI |
| `templates/index.html` | Modify | Thêm menu tab OEM, bảng quản lý đơn gia công, modal đặt hàng, modal nhận hàng, widget dự báo dòng tiền |
| `static/js/app.js` | Modify | Logic tương tác giao diện OEM, tính toán CK/VAT/cọc tự động, gọi API nhận hàng và render dự báo dòng tiền |
| `test_oem_flow.py` | Create | Script kiểm thử tự động toàn diện: tạo đơn -> cọc -> nhận thực tế -> kiểm tra trừ kho NVL -> kiểm tra giá vốn thành phẩm |

---

## Chi Tiết Các Bước Triển Khai (Task List)

### Task 1: Migration Cơ Sở Dữ Liệu & Schemas
- [ ] **Step 1:** Cập nhật `database.py` tự động migration:
  - Thêm bảng `oem_orders`, `oem_order_items`.
  - Thêm cột `is_oem` vào `warehouses` (nếu chưa có).
  - Thêm cột `fund_source` vào `cashbook` ('COMPANY' / 'PERSONAL').
- [ ] **Step 2:** Thêm Pydantic models trong `schemas.py`:
  - `OEMOrderCreate`, `OEMOrderReceive`, `OEMOrderResponse`.
- [ ] **Step 3:** Chạy script xác thực schema DB tạo thành công.

### Task 2: Xây Dựng Router `routers/oem.py`
- [ ] **Step 1:** Viết API `GET /api/oem/orders` & `POST /api/oem/orders` (Tạo đơn dự kiến).
- [ ] **Step 2:** Viết API `POST /api/oem/orders/{id}/deposit` (Xác nhận cọc 50%, xuất quỹ `cashbook` theo `fund_source`).
- [ ] **Step 3:** Viết API `POST /api/oem/orders/{id}/receive` (Nhận hàng thực tế: cập nhật số lượng thực, tính lại chiết khấu/VAT/tiền còn lại, trừ kho NVL tại xưởng theo BOM, cập nhật `cost_price` thành phẩm).
- [ ] **Step 4:** Viết API `GET /api/oem/cashflow-forecast` (Dự báo dòng tiền theo ngày nhận hàng, trừ hao ±1 ngày, nhóm theo `fund_source`).
- [ ] **Step 5:** Đăng ký router trong `server.py`.

### Task 3: Giao Diện Tab "Gia Công OEM" & Dự Báo Dòng Tiền
- [ ] **Step 1:** Thêm Tab điều hướng `🏭 Gia Công OEM` trong `templates/index.html`.
- [ ] **Step 2:** Thêm bảng danh sách đơn đặt gia công (Trạng thái: Nháp, Đã cọc, Đã nhận hàng, Hoàn tất).
- [ ] **Step 3:** Thêm Modal "Tạo Đơn Đặt Gia Công OEM" (Form nhập đơn giá niêm yết, % VAT, % Chiết khấu, tự tính tiền cọc 50% và hiển thị nhu cầu tem/chai).
- [ ] **Step 4:** Thêm Modal "Nhận Hàng Gia Công & Quyết Toán" (Nhập số lượng thực nhận, tự tính tiền đợt 2 còn lại và hiển thị số lượng tem chai sẽ bị trừ).
- [ ] **Step 5:** Thêm Widget "Dự Báo Dòng Tiền Chi" với nút lọc nhanh: [Tất cả] - [🏢 Quỹ Công Ty] - [👤 Quỹ Cá Nhân].

### Task 4: Kiểm Thử Nghiệp Vụ Thực Tế & Bàn Giao
- [ ] **Step 1:** Viết `test_oem_flow.py` mô phỏng đúng hóa đơn mẫu: 1.491 chai Bạc Hà, 986 chai Chanh Sả, 988 chai Quế Cam.
- [ ] **Step 2:** Kiểm tra số dư tem, vỏ chai bị trừ chính xác khỏi kho xưởng.
- [ ] **Step 3:** Kiểm tra giá vốn thành phẩm sau khi nhận hàng phản ánh đúng chi phí thực trả (sau CK + VAT + tem chai).
- [ ] **Step 4:** Cập nhật `PROJECT_MAP.html` và hướng dẫn sử dụng.

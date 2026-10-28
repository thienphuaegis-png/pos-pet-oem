# Implementation Plan: Nhập Tay Công Nợ Đầu Kỳ Phân Tách Quỹ Cty & Cá Nhân

- [ ] **Step 1: DB Migration trong `database.py`**
  - Thêm `initial_debt_company` và `initial_debt_personal` vào bảng `contacts` trong `init_db()`.
  - Tự động nạp giá trị cũ: nếu NCC đã có `debt > 0` và chưa phân tách, mặc định chuyển vào `initial_debt_personal`.

- [ ] **Step 2: Cập nhật APIs `routers/partners.py`**
  - Thêm `initial_debt_company` và `initial_debt_personal` vào `ContactCreate`, `ContactUpdate`, `ContactDebtAdjust`.
  - Cập nhật hàm `create_contact`, `update_contact`, `adjust_contact_debt`.

- [ ] **Step 3: Cập nhật APIs `routers/oem.py`**
  - Sửa `list_debt_suppliers`: tính `debt_company = sum(PO/OEM cty) + initial_debt_company`, `debt_personal = sum(PO/OEM cá nhân) + initial_debt_personal`.
  - Sửa `pay_supplier_debt`: hỗ trợ thanh toán trừ vào `initial_debt_company` hoặc `initial_debt_personal` khi không đủ hoặc không có đơn PO/OEM.

- [ ] **Step 4: Cập nhật Frontend UI & Modal**
  - `templates/index.html`: Thêm 2 input nợ cty / nợ cá nhân trong modal đối tác và thêm modal riêng `modal-quick-edit-debt` để sửa nợ 2 quỹ trực quan.
  - `static/js/modules/contacts.js`: Đọc/ghi 2 trường nợ cty và cá nhân.
  - `static/js/modules/cashflow.js`: Bật modal sửa nợ 2 quỹ, cập nhật giao diện thanh toán nợ nhận đúng nợ đầu kỳ.

- [ ] **Step 5: Viết Test tự động & Chạy xác thực**
  - Tạo `tests/test_supplier_debt_split.py` kiểm tra toàn bộ luồng logic tính nợ và thanh toán nợ.

- [ ] **Step 6: Build lại Portable EXE & Push GitHub**
  - Build `POS_Mastercare.exe` mới.
  - Cập nhật gói `GOI_CAP_NHAT_PORTABLE.zip`.
  - Push GitHub để máy bên kia bấm `CAP_NHAT_TU_GITHUB.bat` là xong.

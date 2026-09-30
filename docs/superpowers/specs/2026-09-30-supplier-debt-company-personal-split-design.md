# Thiết Kế: Nhập Tay Công Nợ Đầu Kỳ Phân Tách Quỹ Công Ty & Cá Nhân (POS Pet Care)

- **Ngày tạo:** 2026-09-30
- **Trạng thái:** Approved by User (Phương án 1)

## 1. Mục tiêu
- Cho phép người dùng/Admin nhập tay và chỉnh sửa trực tiếp công nợ đầu kỳ của từng Nhà cung cấp (NCC).
- Phân tách độc lập 2 nguồn quỹ:
  1. `Nợ Quỹ Công Ty (initial_debt_company)`: Các khoản nợ pháp nhân / hóa đơn VAT đầu kỳ.
  2. `Nợ Quỹ Cá Nhân (initial_debt_personal)`: Các khoản nợ tiền mặt / cá nhân chi trả đầu kỳ.
- Tổng nợ hiển thị và dòng tiền tính toán chuẩn xác:
  - `Nợ Cty = initial_debt_company + Nợ đơn PO/OEM có thuế`
  - `Nợ Cá nhân = initial_debt_personal + Nợ đơn PO/OEM không thuế`
  - `Tổng nợ phải trả = Nợ Cty + Nợ Cá nhân`
- Cho phép thanh toán công nợ theo từng quỹ ngay cả khi không có đơn hàng PO/OEM trong hệ thống (tự động trừ vào nợ đầu kỳ tương ứng và sinh phiếu chi sổ quỹ).

## 2. Kiến trúc & CSDL (`database.py`)
- Thêm 2 cột vào bảng `contacts`:
  - `initial_debt_company REAL DEFAULT 0`: Nợ cty đầu kỳ.
  - `initial_debt_personal REAL DEFAULT 0`: Nợ cá nhân đầu kỳ.
- Tự động chạy migration trong `init_db()` (dùng `ALTER TABLE contacts ADD COLUMN ...`).

## 3. Backend APIs
1. `routers/partners.py`:
   - Mở rộng model `ContactCreate`, `ContactUpdate`:
     - Thêm `initial_debt_company: Optional[float] = 0.0`
     - Thêm `initial_debt_personal: Optional[float] = 0.0`
   - Endpoint `PUT /api/contacts/{id}/debt`:
     - Nhận `{ initial_debt_company: float, initial_debt_personal: float, note: str }`
     - Cập nhật cả 2 trường và đồng bộ trường tổng `debt = initial_debt_company + initial_debt_personal`.
2. `routers/oem.py`:
   - `GET /api/cashflow-debts/suppliers`:
     - Đọc `c.initial_debt_company` cộng vào `debt_company`.
     - Đọc `c.initial_debt_personal` cộng vào `debt_personal`.
     - Trả về chi tiết: `initial_debt_company`, `initial_debt_personal`, `debt_company`, `debt_personal`, `total_debt`.
   - `POST /api/cashflow-debts/pay-supplier`:
     - Hỗ trợ thanh toán nợ đầu kỳ:
       - Nếu số tiền thanh toán > 0:
         - Trừ trước vào các đơn PO/OEM thuộc quỹ tương ứng (nếu có).
         - Số tiền còn dư sẽ trừ trực tiếp vào `initial_debt_company` (nếu trả quỹ Cty) hoặc `initial_debt_personal` (nếu trả quỹ Cá nhân).
         - Cập nhật lại trường tổng `debt` trong bảng `contacts`.
         - Sinh phiếu chi sổ quỹ chuẩn xác (`cashbook`), ghi rõ nội dung.

## 4. Giao diện người dùng (Frontend)
1. **Modal Sửa Đối Tác (`templates/index.html` & `static/js/modules/contacts.js`)**:
   - Khi loại đối tác là `supplier`, hiển thị 2 ô nhập:
     - `🏢 Nợ Công Ty đầu kỳ (đ)`
     - `👤 Nợ Cá Nhân đầu kỳ (đ)`
2. **Modal Nhanh "✏️ Sửa nợ" (`static/js/modules/cashflow.js`)**:
   - Tạo modal trực quan hoặc prompt 2 ô nhập riêng biệt cho Quỹ Cty và Quỹ Cá Nhân, hiển thị tổng nợ tự động tính.
3. **Thanh toán nợ NCC (`openModalPaySupplierDebt`)**:
   - Hiển thị đúng số nợ của từng quỹ (Cty / Cá nhân) bao gồm cả nợ đầu kỳ.
   - Cho phép bấm thanh toán ngay cả khi số đơn nợ là 0.

## 5. Kế hoạch kiểm thử (Test Plan)
- Test thêm mới / sửa NCC với nợ đầu kỳ cty và cá nhân.
- Test endpoint điều chỉnh nợ 2 quỹ.
- Test endpoint `list_debt_suppliers` tổng hợp đúng số dư.
- Test thanh toán nợ trừ đúng vào quỹ cty/cá nhân và giảm nợ đầu kỳ.

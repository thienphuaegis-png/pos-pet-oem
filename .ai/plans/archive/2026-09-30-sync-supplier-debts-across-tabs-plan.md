# Implementation Plan: Đồng bộ nợ NCC toàn diện

- [ ] Task 1: Cập nhật API `GET /api/contacts` và `/export-excel` trong `routers/partners.py`
  - Đảm bảo trả đầy đủ `debt`, `total_debt`, `debt_company`, `debt_personal`, `initial_debt_company`, `initial_debt_personal`
  - Export Excel hiển thị đúng cột nợ Cty, nợ Cá nhân, tổng nợ
- [ ] Task 2: Cập nhật frontend `static/js/modules/contacts.js`
  - Sửa KPI tính nợ NCC đọc `(c.total_debt ?? c.debt ?? 0)`
  - Sửa bảng NCC hiển thị rõ ràng nợ 2 quỹ và tổng nợ
- [ ] Task 3: Đổi version cache trong `templates/index.html` thành `?v=20260930_02`
- [ ] Task 4: Chạy test kiểm thử `pytest tests/test_supplier_debt_split.py`
- [ ] Task 5: Đóng gói lại `POS_Mastercare.exe` & `GOI_CAP_NHAT_PORTABLE.zip`
- [ ] Task 6: Commit và push lên GitHub `main`

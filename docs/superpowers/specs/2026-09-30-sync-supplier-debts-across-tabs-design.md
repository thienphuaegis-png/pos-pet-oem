# Design: Đồng bộ nợ NCC giữa Tab Đối Tác, Dòng Tiền & File Excel

## 1. Vấn đề
- Tab "Đối tác" hiển thị nợ NCC = 0 đ và thẻ KPI nợ = 0 đ, dù tab "Dòng tiền & Nợ NCC" và file Excel có nợ.
- Nguyên nhân: API `GET /api/contacts` chưa đồng bộ đầy đủ các trường `debt`, `debt_company`, `debt_personal`, `total_debt` cho từng NCC; frontend `contacts.js` tính KPI bằng `c.debt`.
- File cache tĩnh `contacts.js?v=20260925_01` khiến trình duyệt không tải JS mới.

## 2. Giải pháp (Phương án 1)
- Backend `routers/partners.py`:
  - `GET /api/contacts`: Tự động tính toán tổng nợ = `nợ đơn PO/OEM + nợ đầu kỳ phân tách`. Gán trực tiếp cả `debt`, `total_debt`, `debt_company`, `debt_personal`, `initial_debt_company`, `initial_debt_personal`.
  - `GET /api/contacts/export-excel`: Thêm cột Nợ Quỹ Cty (VAT) và Nợ Quỹ Cá Nhân vào file Excel.
- Frontend `static/js/modules/contacts.js`:
  - KPI NCC tính bằng: `allSupp.reduce((sum, c) => sum + (c.total_debt ?? c.debt ?? 0), 0)`.
  - Bảng NCC đọc `c.debt_company`, `c.debt_personal`, `c.total_debt ?? c.debt`.
- Template `templates/index.html`:
  - Đổi cache-busting query string `?v=20260930_02` cho `contacts.js` và `cashflow.js`.

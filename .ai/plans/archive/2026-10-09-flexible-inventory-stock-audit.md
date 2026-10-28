# Implementation Plan: Flexible Inventory Stock Audit (Kiểm Kê Từng Phần & Theo Lựa Chọn)

## Overview
Cho phép người dùng kiểm kê kho linh hoạt theo nhóm danh mục hoặc từng mặt hàng/nguyên liệu tùy chọn, chỉ cân bằng các mặt hàng đã chọn và giữ nguyên toàn bộ các mặt hàng khác trong kho.

## Tasks

- [ ] Task 1: Chuẩn hóa Schema và Backend API Kiểm Kê Kho
  - Cập nhật `schemas.py`: Mở rộng `AuditItemIn` nhận `item_id`, `actual_qty`, `system_qty`, `diff_qty`, `note`.
  - Cập nhật `routers/inventory.py`: Xử lý `item_id` linh hoạt khi `product_id`/`ingredient_id` không truyền trực tiếp.
  - Viết test suite `tests/test_flexible_stock_audit.py` kiểm tra:
    - Gửi 1 phần danh sách (chỉ 2/5 sản phẩm) $\rightarrow$ chỉ cân bằng đúng 2 sản phẩm đó, 3 sản phẩm còn lại giữ nguyên số lượng.

- [ ] Task 2: Nâng cấp Giao diện Bảng Kiểm Kê Kho (`templates/index.html`)
  - Thêm checkbox `[✓]` chọn tất cả trên header.
  - Thêm cột Thao tác `[✕ Bỏ]` ở mỗi dòng để loại bỏ món không kiểm.
  - Thêm các nút: `[🎯 Chỉ chọn món có lệch]`, `[⚡ Chọn tất cả]`, `[✕ Bỏ chọn]`.
  - Cập nhật footer: Hiển thị "Đã chọn kiểm: X / Y mặt hàng (Khớp: A, Lệch: B)", nút Cân Bằng Kho hiển thị số lượng món đã chọn.

- [ ] Task 3: Cập nhật Logic Xử lý Kiểm Kê (`static/js/app.js`)
  - Quản lý trạng thái `is_selected` trên từng mặt hàng.
  - Cập nhật `renderAuditTable()` hiển thị checkbox và nút xóa món.
  - Bổ sung hàm `toggleAuditItemSelect`, `toggleSelectAllAuditItems`, `selectOnlyDiffAuditItems`, `removeAuditItemFromList`.
  - Cập nhật `updateAuditStats()` tính toán dựa trên các món được chọn.
  - Cập nhật `submitStockAudit()` chỉ gửi các item có `is_selected === true`.

- [ ] Task 4: Chạy kiểm thử tự động toàn diện và xác minh
  - Chạy `pytest tests/test_flexible_stock_audit.py`.
  - Chạy toàn bộ test suites hiện có.

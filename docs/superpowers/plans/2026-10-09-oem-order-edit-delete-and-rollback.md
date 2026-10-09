# Implementation Plan: OEM Order Edit, Delete and Rollback

## Overview
Cho phép sửa và xóa đơn gia công OEM ở mọi trạng thái (kể cả đã nhận hàng), hoàn tác đồng bộ tồn kho thành phẩm, nguyên liệu BOM xưởng và các phiếu chi trong Sổ Quỹ.

## Tasks

- [ ] Task 1: Cập nhật Backend API Sửa/Xóa Đơn OEM (`routers/oem.py` & `routers/cashbook.py`)
  - Bỏ chặn `RECEIVED` trong `PUT /api/oem/orders/{order_id}`.
  - Cập nhật `DELETE /api/oem/orders/{order_id}`:
    - Nếu đơn `RECEIVED`: Hoàn tác kho thành phẩm (`product_inventory`), hoàn trả kho nguyên liệu xưởng (`inventory`), xóa phiếu chi `cashbook`.
    - Nếu đơn `DEPOSITED`: Xóa phiếu chi cọc `PC-OEM` trong `cashbook`.
    - Xóa `oem_order_items` và `oem_orders`.
  - Cập nhật `routers/cashbook.py`: Xử lý khi xóa phiếu chi OEM trong sổ quỹ.
  - Viết test suite `tests/test_oem_order_edit_delete.py` kiểm tra:
    - Xóa đơn OEM ở trạng thái `RECEIVED` $\rightarrow$ Tồn kho thành phẩm giảm lại, tồn kho nguyên liệu xưởng tăng lại, phiếu chi cashbook bị xóa sạch.

- [ ] Task 2: Cập nhật Giao Diện Đơn Hàng OEM (`static/js/modules/productions.js` & `templates/index.html`)
  - Trong `renderOEMOrdersTable()`: Luôn hiển thị nút `[✏️ Sửa]` và `[🗑️ Xóa]` cho mọi đơn hàng.
  - Cập nhật hàm `deleteOEMOrder(orderId, orderCode)` cảnh báo hoàn tác chi tiết và gọi API DELETE.
  - Hoàn thiện hàm `openModalEditOEM(orderId)` nạp dữ liệu và mở modal sửa đơn.

- [ ] Task 3: Chạy kiểm thử tự động toàn diện và xác minh
  - Chạy `pytest tests/test_oem_order_edit_delete.py`.
  - Chạy toàn bộ test suites hiện có.
  - Rebuild `POS_Mastercare.exe` và commit & push.

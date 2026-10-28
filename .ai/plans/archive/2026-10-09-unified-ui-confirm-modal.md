# Implementation Plan: Unified UI Confirmation Modal

## Overview
Thay thế toàn bộ hộp thoại `confirm()` xấu của trình duyệt bằng Modal Xác Nhận chuẩn POS (backdrop blur, bo tròn 2xl, icon phân loại màu, typography đẹp).

## Tasks

- [ ] Task 1: Cập nhật `static/js/pos.js` cho chức năng Xóa Phiếu Thu Nạp Ví Spa
  - Chuyển `confirmDeleteTopupTx` sang dùng `await showConfirmModal(...)`.

- [ ] Task 2: Cập nhật `static/js/modules/contacts.js` cho chức năng Xóa Đối Tác / Khách Hàng
  - Chuyển `deleteContact` sang dùng `await showConfirmModal(...)`.

- [ ] Task 3: Cập nhật `static/js/modules/productions.js` cho chức năng Xóa Đơn OEM
  - Chuyển `deleteOEMOrder` sang dùng `await showConfirmModal(...)`.

- [ ] Task 4: Cập nhật `static/js/app.js` cho chức năng Xác Nhận Cập Nhật Máy Chủ và Xóa Kho / Nhóm Hàng
  - Cập nhật `triggerServerUpdate`, `deleteWarehouse`, `deleteCategory`.

- [ ] Task 5: Viết bài test xác thực và kiểm thử toàn diện
  - Viết `tests/test_unified_confirm_modals.py`.
  - Chạy `pytest`.
  - Rebuild `POS_Mastercare.exe`, commit & push.

# Implementation Plan: POS UX Wheel Guard, Format and Hotkeys

## Overview
Chặn cuộn chuột làm thay đổi số lượng, định dạng dấu chấm phân cách hàng nghìn cho ô tiền, để trống các ô giá/phụ thu không kế thừa, hỗ trợ đóng modal bằng phím ESC và bổ sung bảng phím tắt tiện ích chuẩn POS.

## Tasks

- [ ] Task 1: Cập nhật JavaScript cốt lõi (`static/js/app.js` & `static/js/pos.js`)
  - Thêm Global Wheel Guard chặn cuộn chuột làm đổi số trên `input[type="number"]`.
  - Thêm Global ESC Handler tự động tìm và đóng modal đang mở.
  - Thêm hệ thống phím tắt: `F1`, `F2`, `F3`, `F4`, `F8`, `F9`, `F10`, `ESC`, `?` (trợ giúp phím tắt).
  - Bổ sung helper `formatCurrencyInputRealtime` để gõ số tiền tự động có dấu chấm phân cách.

- [ ] Task 2: Cập nhật các ô nhập giá tiền & số lượng để trống mặc định
  - Modal tạo sản phẩm mới: Giá vốn (cost price), giá bán: để trống `value=""`, `placeholder="0"`.
  - Modal Tiếp nhận Spa: Tip thợ, phụ thu khác: để trống `value=""`, `placeholder="0"`.
  - Modal Gia công OEM: Đơn giá xưởng: nếu chưa có giá để trống `value=""`, `placeholder="0"`.

- [ ] Task 3: Bổ sung Modal Bảng Trợ Giúp Phím Tắt trên giao diện (`templates/index.html`)
  - Thêm nút `[ ⌨️ Phím tắt ]` trên thanh công cụ POS.
  - Thêm modal `#modal-pos-shortcuts-help` liệt kê trực quan các phím tắt.

- [ ] Task 4: Kiểm thử tự động toàn diện và xác minh
  - Viết `tests/test_pos_hotkeys_and_wheel_guard.py`.
  - Chạy `pytest`.
  - Rebuild `POS_Mastercare.exe`, commit & push.

# POS Bán Hàng & Mẫu In Tùy Chỉnh K80 Implementation Plan

**Goal:** Hoàn thiện trải nghiệm bán hàng POS tốc độ cao và cho phép tùy biến/in hóa đơn K80 bằng template động lưu trữ trong SQLite.

**Tech Stack:** FastAPI, SQLite, Vanilla HTML/JS, CSS Print Styles.

## Task 1: Bảng Cài Đặt Mẫu In Trong Database
- Bổ sung bảng `settings` (key-value) vào `database.py` để lưu trữ template in và thông tin cửa hàng.
- Nạp sẵn template K80 chuẩn KiotViet làm mặc định.

## Task 2: API Lấy & Lưu Mẫu In và Đơn Hàng Chi Tiết
- Thêm API `GET /api/settings/print-template` và `POST /api/settings/print-template`.
- Thêm API `GET /api/orders/{code}` trả về đầy đủ chi tiết đơn hàng (khách, nhân viên, danh sách sản phẩm) để render ra mẫu in.

## Task 3: Trình Biên Tập Mẫu In (Live Editor) Trên UI
- Tạo tab "Mẫu In Hóa Đơn" trên giao diện.
- Trình soạn thảo HTML template với danh sách Placeholders gợi ý.
- Khung Live Preview trực tiếp bên cạnh.

## Task 4: Tích Hợp In Hóa Đơn Sau Khi Bán
- Sau khi bấm "Thanh Toán", hệ thống lưu đơn và mở modal xem trước / gọi lệnh in `window.print()` theo template đã cấu hình.
- Nút "In Lại" đơn hàng bất kỳ lúc nào.

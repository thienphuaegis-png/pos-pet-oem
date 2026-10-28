# ARCHIVE: LEGACY PROJECT TRACKING (Khởi tạo dự án -> Phiên bản sơ khai)

Tài liệu lưu trữ nội dung cũ của `PROJECT_TRACKING.md` trước khi thống nhất chuyển toàn bộ sang `PROJECT_STATE.md` (Checkpoint AI) và `PROJECT_MAP.html` (Dashboard giao diện).

---

## 1. THÔNG TIN DỰ ÁN & MÔI TRƯỜNG
- **Thư mục dự án**: `D:/Projects_Hermes/pos-offline`
- **Địa chỉ trang Quản trị**: `http://127.0.0.1:8999`
- **Địa chỉ Màn hình Bán Hàng (POS)**: `http://127.0.0.1:8999/pos`
- **Khởi động**: `chay_ngay.bat` (tự động giải phóng cổng 8999 và chạy uvicorn reload)
- **Chia sẻ online test từ xa**: `chia_se_online.bat` (Cloudflare Tunnel)
- **Đóng gói file chạy**: `build_exe.bat`
- **Cơ sở dữ liệu**: SQLite cục bộ tại `data/pos.db` (35 bảng)
- **Công nghệ**: Python FastAPI, Uvicorn, SQLite3, HTML5 Canvas SPA, TailwindCSS, QRCode.js

---

## 2. NHẬT KÝ COMMITS & LỊCH SỬ SỬA LỖI (GIT LOG)

| Commit / Tag | Loại | Nội dung thực hiện |
| :--- | :---: | :--- |
| `FIX-POS` | Fix | Sửa nút Sidebar `index.html` trỏ trực tiếp link `/pos`, loại bỏ nhầm lẫn kích hoạt tab-pos phôi cũ |
| `OEM-CF` | Feature | Phân hệ Gia công OEM, nhận hàng trừ tem chai kho xưởng theo BOM, dự báo dòng tiền 2 quỹ Cty/Cá nhân |
| `PRICE-PETS`| Feature | Bảng giá đa cấp, Phân nhóm khách hàng, Danh bạ thú cưng & Import/Export Excel |
| `e325689` | Fix | Sửa lỗi tham số query kho hợp nhất & cập nhật kho |
| `5ae1a4a` | Feature | CRUD sản phẩm & nguyên liệu, modal xuất hủy kho, combo BOM |
| `146af24` | Fix | Kho hợp nhất hiển thị đầy đủ 435 mặt hàng và nhà cung cấp |
| `9408b8d` | Feature | Thêm cột nhà cung cấp cho sản phẩm, nguyên liệu và kho hợp nhất |
| `9d849a3` | Fix | Bổ sung hàm `escapeHtml` trong purchases giải quyết lỗi ReferenceError |
| `467e7f7` | Feature | Fuzzy search tiếng Việt không dấu, PO chờ nhận hàng & Lệnh Sản Xuất đa thành phẩm |
| `a4c92e1` | Feature | Quản lý kho đa kho trọn gói + Tinh gọn menu sidebar thành các sub-tabs con |
| `fe2b8a1` | Feature | Mẫu in A4 B2B đại lý (9 cột, 3 ô chân trang, 3 chữ ký) + Quản lý Presets mẫu in độc lập |

# Thiết kế: Server-side Injection Logo và Tên Ứng Dụng Màn Hình Đăng Nhập

**Ngày:** 2026-09-27  
**Mục tiêu:** Hiển thị tức thì (0ms, không chớp nháy FOUC) Logo (`shop_logo`) và Tên ứng dụng (`app_name`) do người dùng cài đặt ngay trên màn hình đăng nhập lúc mở trang.

---

## 1. Luồng xử lý Backend (`server.py` & `routers/settings.py`)
- **Truy vấn Cài Đặt tại Route `GET /` (`server.py`):**
  - Đọc `app_name` và `shop_logo` từ bảng `settings` trong SQLite `data/pos.db`.
  - Mặc định: `app_name` fallback về `"⚡ POS Offline"`.
  - Thay thế nội dung trong `templates/index.html`:
    - Thay thế text bên trong `#login-store-name`: `<div id="login-store-name"...>{app_name}</div>`.
    - Xử lý `#login-store-icon` và `#login-store-logo`:
      - Nếu có `shop_logo`: gán `src="{shop_logo}"`, `style="display:block;max-height:64px;max-width:200px;object-fit:contain"` cho `<img>`, và đặt `style="display:none;"` cho `<span>` icon `🐾`.
      - Nếu chưa có `shop_logo`: giữ `<span>` icon `🐾` hiển thị, ẩn `<img>` (`style="display:none"`).
- **Cache Invalidation:**
  - Cache dict settings trong bộ nhớ biến module Python để tránh đọc file/SQLite lặp lại.
  - Khi API `POST /api/settings/company` được gọi thành công, reset cache để request `GET /` tiếp theo lấy dữ liệu mới nhất.

---

## 2. Luồng xử lý Client (`static/js/auth.js` & `static/js/modules/productions.js`)
- **`static/js/auth.js` (`loadLoginStoreBranding`):**
  - Đổi logic lấy tên từ `settings.shop_name` sang `settings.app_name` (fallback `settings.shop_name || '⚡ POS Offline'`).
  - Đảm bảo khi logout mà không F5 trang thì màn hình login vẫn hiển thị đúng thương hiệu mới nhất.
- **`static/js/modules/productions.js` (`saveCompanySettings`):**
  - Cập nhật trực tiếp phần tử `#login-store-name` và `#login-store-logo` trên DOM ngay sau khi bấm Lưu cài đặt công ty.

---

## 3. Tiêu chí nghiệm thu (Acceptance Criteria)
1. Khi vào `http://127.0.0.1:8999/` từ tab ẩn danh / xóa cache: Logo ảnh và Tên ứng dụng hiển thị tức thì từ server, không có hiện tượng chớp chữ "POS Offline" hay chớp icon `🐾`.
2. Trường hợp chưa cấu hình logo: Hiển thị icon `🐾` dự phòng.
3. Khi đổi tên app/logo trong Cài Đặt và Đăng xuất: Thông tin mới được áp dụng chuẩn xác.
4. Kiểm thử tự động: Viết test backend xác minh endpoint `GET /` inject đúng `app_name` và `shop_logo` vào HTML response.
5. Toàn bộ test suite pytest & cú pháp JS đều PASS.

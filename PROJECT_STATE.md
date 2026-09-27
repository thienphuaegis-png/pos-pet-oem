# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-09-27 — Server-side Injection Logo & Tên Ứng Dụng Màn Hình Đăng Nhập (0ms FOUC-free)  
**Server:** `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db`)  
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`  
**Archive Log:** `docs/archive/STATE_2026_09.md` (lịch sử chi tiết các phiên trước)

---

## 1. Phiên Hiện Tại ✅ (2026-09-27)
- **Server-side Injection Màn Hình Đăng Nhập (`server.py`):** Route `GET /` đọc `app_name` và `shop_logo` từ SQLite, inject trực tiếp vào HTML response. Hiển thị 0ms tức thì, không giật/nháy FOUC.
- **Tự Động Ẩn/Hiện Icon 🐾 & Logo:** Nếu đã tải logo (`shop_logo`), tự động ẩn icon 🐾 và bung logo ảnh kích thước chuẩn; nếu chưa có logo thì giữ icon 🐾 dự phòng.
- **Cache Invalidation & Frontend Sync (`routers/settings.py`, `auth.js`, `productions.js`):** Invalidate cache server khi lưu cài đặt; cập nhật ngay DOM `#login-store-name` và `#login-store-logo` tại client.
- **Kế Thừa Phiên Trước:** Dải Lịch Ngang Spa, Sub-tab Hóa Đơn Spa, Cấn Trừ Ví Một Phần & Phân Tách Dòng Tiền Topup.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `tests/test_login_branding_injection.py`: **PASS 2/2** (Server injection & fallback).
- `tests/test_spa_render.js`: **PASS 18/18** (Render bảng Spa, dải lịch, K80, ví).
- `tests/test_checkpoint_integrity.py`: **PASS 4/4** (Toàn vẹn checkpoint & roadmap).
- `tests/test_html_integrity.py`: **PASS 3/3** (Toàn vẹn DOM 12 tabs chính).
- Cú pháp JS: `node -c static/js/auth.js && node -c static/js/modules/productions.js`: **PASS**.

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `server.py` | Hàm `index()` inject `app_name` và `shop_logo` trực tiếp vào HTML, cache memory |
| `routers/settings.py` | `update_company_settings` gọi `invalidate_branding_cache()` |
| `static/js/auth.js` | `loadLoginStoreBranding()` ưu tiên `settings.app_name` |
| `static/js/modules/productions.js` | `saveCompanySettings()` cập nhật ngay DOM login branding |
| `tests/test_login_branding_injection.py` | Bộ test backend kiểm tra injection & fallback logo |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] `bill-4`: Di chuyển bảng quản lý Gói Topup vào Tab Bảng Giá (`tab-price-lists`) dạng sub-tab.
- [ ] `bill-5`: Kiểm tra và chuẩn hóa mẫu in K80/A4 B2B trên các trình duyệt.
- [ ] `sys-1`: Bảng Quản Lý Hotel (Khách Sạn Chó Mèo) thiết kế schema & layout.
- [ ] `sys-5`: Đóng gói file chạy EXE độc lập (`build_exe.bat`) và test trên Windows sạch.
- [ ] `auth-1`: Quản lý nhân viên (Cài Đặt > Nhân Viên) và phân quyền ca làm việc.

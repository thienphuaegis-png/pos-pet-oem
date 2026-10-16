# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-10-16 — Khóa Bảo Vệ Toàn Bộ API Nghiệp Vụ (/api/*), Lọc Bí Mật Settings & Khắc Phục Lỗi Crash / Bot Nền
**Server:** `http://127.0.0.1:8998` — FastAPI + SQLite (`data/pos.db`), bind `0.0.0.0`
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`)
**Archive Log:** `docs/archive/STATE_2026_10.md` (phiên 2026-10-11), `docs/archive/STATE_2026_09.md`

---

## 1. Phiên Hiện Tại ✅ (2026-10-16)
- **Khóa Bảo Vệ API Cấp Hệ Thống (`server.py`):**
  - Gắn `dependencies=[Depends(get_current_user)]` lên toàn bộ 23 business sub-routers.
  - Mọi request không token tới `/api/*` trả `401 Unauthorized`. Các endpoint mở công khai: `/api/auth/login`, `/api/ping`, `/api/version`.
- **Bảo Mật Cấu Hình & Che Giấu Token (`routers/settings.py`, `server.py`):**
  - `GET /api/settings` lọc bỏ hoàn toàn `gemini_api_key` và `telegram_bot_token`.
  - Cấu hình logging `httpx` mức `WARNING` để ngăn rò rỉ token bot Telegram qua URL `getUpdates`.
- **Sửa Lỗi Crash & Ổn Định Test Suite (`routers/products.py`, `server.py`, `database.py`, `tests/conftest.py`):**
  - Sửa `NameError: datetime` trong `products.py` (`PUT /api/products/{id}`) và `server.py` (nhánh backup/pull server).
  - Khai báo `logger` trong `database.py` cứu `init_db()` khi sync sổ quỹ gặp ngoại lệ.
  - Bổ sung cờ `POS_DISABLE_BACKGROUND=1` trong `tests/conftest.py` ngăn pytest khởi động bot Telegram nền (chấm dứt lỗi 409 Conflict).
- **Hạ Tầng Tải File & In Ấn Kèm Token (`static/js/auth.js`):**
  - Viết 2 helper `downloadWithAuth(url, filename)` và `openWithAuth(url)` qua `fetch` (tự động gắn Bearer token qua interceptor).
  - Chuyển toàn bộ 14 chỗ gọi link `/api` trực tiếp trong app sang helper có xác thực.
- **Dọn Dẹp Bookmarklet Sàn (`templates/index.html`, `static/js/modules/marketplace.js`):**
  - Gỡ bỏ hoàn toàn bookmarklet cross-site, tập trung vào import Excel an toàn.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- **Lưới an toàn Auth (`tests/test_api_requires_auth.py`):** 314/314 endpoint tự động kiểm tra từ OpenAPI schema trả đúng 401 khi ẩn danh.
- **Toàn bộ Test Suite:** 620 passed, 10 skipped, 0 failed.
- **Kiểm tra điều hướng trực tiếp (`tests/test_authed_downloads.py`):** 0 vi phạm trên toàn bộ mã nguồn JS và HTML.

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `server.py` | Khóa router cấp `_LOGIN_REQUIRED`, chặn log httpx, fix import datetime |
| `routers/settings.py` | Ẩn `gemini_api_key` & `telegram_bot_token` khỏi `GET /api/settings` |
| `routers/products.py` | Fix import `datetime` khi update sản phẩm |
| `database.py` | Khai báo logger cho database resilience |
| `static/js/auth.js` | Thêm helper `downloadWithAuth` & `openWithAuth` |
| `static/js/modules/` | Cập nhật các nút xuất Excel / in phiếu (purchases, reports, contacts, productions, app, index.html) |
| `templates/index.html` | Cập nhật link tải mẫu, gỡ UI bookmarklet |
| `static/js/modules/marketplace.js` | Gỡ hàm bookmarklet không dùng được cross-origin |
| `tests/` | Thêm `auth_helpers.py`, `test_api_requires_auth.py`, `test_authed_downloads.py`, `test_settings_hide_secrets.py`, v.v. |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] Merge nhánh `fix/api-auth-lockdown` vào `main`.
- [ ] Rebuild exe `POS_Mastercare.exe` trước khi triển khai máy khách.
- [ ] Thu hồi (`/revoke`) token bot Telegram cũ trên `@BotFather` và cấp lại token mới.
- [ ] Cấp lại Gemini API key mới trên Google AI Studio.
- [ ] Giai đoạn 2: Phân quyền chi tiết `require_permission` / `require_role("owner")` cho các hành động xóa hàng loạt và thay đổi thiết lập hệ thống.

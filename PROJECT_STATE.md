# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-09-30 — Đóng Gói Portable Windows Chạy Ngầm Khay Hệ Thống, Auto-Backup Google Drive, Fix Import Excel & Script Cập Nhật Chuẩn ASCII  
**Server:** `http://127.0.0.1:8998` — FastAPI + SQLite (`data/pos.db`)  
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`  
**Archive Log:** `docs/archive/STATE_2026_09.md` (lịch sử chi tiết các phiên trước)

---

## 1. Phiên Hiện Tại ✅ (2026-09-30)
- **Đóng Gói Portable Không Cửa Sổ (Windowless) & System Tray (`sys-5`):**
  - PyInstaller `--noconsole` tích hợp icon khay hệ thống `pystray` (mở POS cục bộ, link online Ngrok, tự khởi động cùng Windows qua Registry, thoát sạch tiến trình).
  - Khắc phục lỗi `sys.stdout / sys.stderr is None` trên Windows GUI gây crash ngầm Uvicorn làm đứt kết nối 8998 (`connectex actively refused it`); chuyển hướng stdio vào `pos_debug.log`.
- **Tự Động Sao Lưu Lên Google Drive Qua Apps Script Webhook (`sys-6`):**
  - Tích hợp `backup_service.py` chạy ngầm định kỳ 1 giờ/lần, mã hóa multipart upload DB lên Google Drive của cửa hàng, tự dọn dẹp backup cục bộ quá 7 ngày.
- **Bảo Mật Quyền Ca & Tài Liệu (`sys-7`):**
  - Cho phép tài khoản Quản lý/Admin thao tác bán hàng không bắt buộc mở ca (`can_skip_shift = 1`), xóa sạch mật khẩu mặc định khỏi mọi file hướng dẫn `.txt`, `.md`.
- **Sửa Lỗi Tải Mẫu Import & Nhập Đối Tác Excel (`contacts-1`):**
  - Đảo thứ tự router tĩnh `/template-excel`, `/export-excel`, `/import-excel` lên trên `/{contact_id}` triệt tiêu lỗi `422 Unprocessable Entity`.
  - Nút **📥 Tải Mẫu** chuyển sang hàm JS động `downloadContactTemplate()`, đọc trực tiếp combobox và gán `&_t=...` kèm HTTP header `no-cache`, tải đúng mẫu Khách hàng hoặc Nhà cung cấp.
- **Bộ Kịch Bản Cập Nhật Độc Lập An Toàn (`sys-8`):**
  - Viết lại `CAP_NHAT_NHANH.bat` và `CAP_NHAT_TU_GITHUB.bat` chuẩn 100% ASCII không dấu, tự sao lưu `pos_backup_gan_nhat.db`, đóng gói `GOI_CAP_NHAT_NHANH.zip` (8.5 MB) và `POS_Mastercare_Portable.zip` (38.7 MB).
- **Tách Bạch Ví Spa Khỏi Tiền Phòng Khách Sạn (`wallet-1`):**
  - Bóc tách hạn mức cấn trừ ví chỉ cho dịch vụ Spa/Grooming, không cấn trừ tiền phòng lưu trú.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `tests/test_checkpoint_integrity.py`: **PASS 4/4** (Toàn vẹn Checkpoint Protocol & Roadmap).
- `tests/test_html_integrity.py`: **PASS 5/5** (14 tabs con trực tiếp, 15 nút điều hướng sidebar).
- `tests/test_spa_wallet_hotel_rules.py`: **PASS 4/4** (Ví Spa không cấn trừ tiền phòng khách sạn).
- `tests/test_hotel_system.py`: **PASS 14/14** (API & logic nghiệp vụ khách sạn thú cưng).
- `tests/test_auth.py`: **PASS 8/8** (Xác thực, phân quyền RBAC & ca làm việc).
- Verification runtime: Test kết nối HTTP GET/POST cổng 8998 trên binary `POS_Mastercare.exe` phản hồi HTTP 200 OK.
- Node.js syntax check: `node -c static/js/modules/contacts.js` PASS 0 error.

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `main.py` | Quản lý vòng đời chạy ngầm, System Tray `pystray`, redirect stdio `pos_debug.log`, autostart Windows |
| `server.py` | Bảo vệ logging stream handlers khi stdio là None |
| `backup_service.py` | Scheduler tự động đẩy bản sao lưu DB lên Google Drive qua Apps Script Webhook |
| `routers/partners.py` | Chuẩn hóa thứ tự route, thêm header no-cache cho `/template-excel`, sửa lỗi 422 |
| `templates/index.html` | Đổi nút Tải Mẫu thành click động, cập nhật modal import |
| `static/js/modules/contacts.js` | Hàm `downloadContactTemplate()`, sync tab đang chọn, chi tiết hóa thông báo lỗi |
| `CAP_NHAT_NHANH.bat` / `CAP_NHAT_TU_GITHUB.bat` | Bộ script cập nhật máy khách 100% thuần ASCII an toàn |
| `GOI_CAP_NHAT_NHANH.zip` | Gói nén cập nhật nhanh không ghi đè DB phục vụ gửi máy khách |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] `bill-5`: Kiểm tra và chuẩn hóa in ấn K80/A4 trên máy in vật lý tại quầy thực tế.
- [ ] `cloud-2`: Tích hợp đồng bộ dữ liệu thời gian thực giữa quầy offline và Supabase Cloud.
- [ ] `sys-4`: Chuẩn bị kiến trúc schema & hook cho chức năng AI trợ lý quầy.
- [ ] `test-1`: Dọn 6 test fail pre-existing trong các suite cũ.

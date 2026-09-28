# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-09-27 — Visual Print Designer & 12 Mẫu Nghiệp Vụ Thực Tế (bill-6)  
**Server:** `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db`)  
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`  
**Archive Log:** `docs/archive/STATE_2026_09.md` (lịch sử chi tiết các phiên trước)

---

## 1. Phiên Hiện Tại ✅ (2026-09-27)
- **Visual Print Designer & 12 Mẫu Nghiệp Vụ Thực Tế (bill-6):**
  - **Bổ sung 100% trường động vào Cài Đặt:** Thêm đầy đủ checkbox Spa (thông tin bé, tình trạng nhận, giờ hẹn trả, chữ ký gửi), Sổ Quỹ (hạng mục, quỹ két, số tiền lớn, 4 chữ ký kế toán, 2 chữ ký quỹ), Kiểm Kê (kho hàng, bảng 7 cột, tổng kết lệch, 3 chữ ký kiểm kê).
  - **Khắc phục lỗi trắng trang Canvas Preview:** Sửa dứt điểm `ReferenceError: isThermal is not defined` và `ReferenceError: renameCurrentPreset is not defined` tại `productions.js`, đảm bảo auto-render 0ms khi nạp trang.
  - **Chống tràn mép giấy in nhiệt K80/K58:** Clamp tọa độ/chiều rộng tối đa 270px (K80) và 195px (K58), tự động zoom fit vừa khung khi xem mẫu A4/A5.
  - **Đồng bộ 12 preset vào SQLite:** Script `tools/sync_print_presets.py` nạp đầy đủ elements cho cả 12 mẫu in (`a4_b2b`, `spa_intake_k80`, `spa_invoice_k80`, `cashbook_thu_k80`, `cashbook_thu_a4`, `cashbook_chi_k80`, `cashbook_chi_a4`, `stock_audit_a4`, ...).
- **Gói Topup Ví Spa Sang Tab Bảng Giá (`tab-price-lists` - bill-4):** Tích hợp sub-tab thứ 4 `#btn-subtab-pl-topup` vào Tab Bảng Giá, gỡ sạch menu thừa ở Cài Đặt.
- **Server-side Injection Màn Hình Đăng Nhập (`server.py` - ui-9):** Route `GET /` inject trực tiếp `app_name` và `shop_logo` vào HTML response, hiển thị 0ms tức thì, không giật FOUC.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `Node.js DOM Simulation`: **PASS 12/12 presets** (Render đầy đủ 6-13 elements/mẫu, HTML 6K-15K chars).
- `tests/test_print_templates_and_css.py`: **PASS 5/5** (Chuẩn hóa @page auto K80, A4 Thu/Chi, A4 Kiểm Kê).
- `tests/test_topup_packages_subtab.py`: **PASS 1/1** (DOM subtab topup & navigation).
- `tests/test_login_branding_injection.py`: **PASS 2/2** (Server injection & fallback).
- `tests/test_checkpoint_integrity.py`: **PASS 4/4** (Toàn vẹn checkpoint & roadmap).
- `tests/test_html_integrity.py`: **PASS 3/3** (Toàn vẹn DOM 12 tabs chính).

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `static/js/modules/productions.js` | Fix runtime error, auto-render canvas, đổi tên mẫu in, catalog trường in mới |
| `static/js/app.js` | Điều hướng an toàn `switchSettingsSubTab` gọi `loadSettings` |
| `templates/index.html` | Thêm checkbox trường Spa/Quỹ/Kiểm Kê vào Cài Đặt, bump `productions.js?v=20260927_06` |
| `tools/sync_print_presets.py` | Script đồng bộ chi tiết 12 preset nghiệp vụ vào SQLite |
| `data/pos.db` | Cập nhật key `print_blocks_config` trong bảng `settings` |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] `bill-5`: Kiểm tra và chuẩn hóa mẫu in K80/A4 B2B trên các trình duyệt.
- [ ] `sys-1`: Bảng Quản Lý Hotel (Khách Sạn Chó Mèo) thiết kế schema & layout.
- [ ] `sys-5`: Đóng gói file chạy EXE độc lập (`build_exe.bat`) và test trên Windows sạch.
- [ ] `auth-1`: Quản lý nhân viên (Cài Đặt > Nhân Viên) và phân quyền ca làm việc.
- [ ] `sys-4`: Chuẩn bị kiến trúc schema & hook cho chức năng AI trợ lý.

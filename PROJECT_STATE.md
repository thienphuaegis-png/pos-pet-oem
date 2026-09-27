# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-09-27 — Chuẩn Hóa Engine Preview/In Ấn & Mẫu In Thực Tế (bill-5) & Di Chuyển Gói Nạp (bill-4)  
**Server:** `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db`)  
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`  
**Archive Log:** `docs/archive/STATE_2026_09.md` (lịch sử chi tiết các phiên trước)

---

## 1. Phiên Hiện Tại ✅ (2026-09-27)
- **Chuẩn Hóa Engine Preview & In Ấn (bill-5):**
  - **Khắc phục tràn lề/vỡ khung Preview:** Tự động tính scale `(availW / sheetW)` trong modal `#modal-print`, giúp hóa đơn A4 ngang (1123px), A4 dọc (794px) hay K80 hiển thị vừa vặn 100% trong khung preview mà không sinh thanh cuộn ngang khó nhìn.
  - **Chuẩn hóa CSS in nhiệt `@page { size: auto; margin: 0mm; }`:** Khắc phục lỗi in ra trang trắng thừa hoặc không cắt giấy trên Chrome/Edge/Firefox cho máy in nhiệt K80/K58 tại POS và nạp ví.
  - **Mẫu In Phiếu Thu & Phiếu Chi (Sổ Quỹ):**
    - Mẫu in nhiệt K80 in nhanh tại quầy.
    - Mẫu in chứng từ A4/A5 chuẩn kế toán (theo TT 133/2016/TT-BTC) có hàm đọc số tiền thành chữ tiếng Việt (`numberToVietnameseWords`) và 4 chữ ký (Giám đốc, Kế toán trưởng, Người nộp/nhận, Thủ quỹ).
    - Tích hợp nút in tại từng dòng bảng Sổ Quỹ và trong Drawer chi tiết giao dịch.
  - **Mẫu In Phiếu Kiểm Kê Hàng Hóa (Kho Vận):**
    - Mẫu in A4 dọc chuẩn nghiệp vụ kho với bảng 7 cột và 3 chữ ký trách nhiệm (Trưởng ban, Thủ kho, Kế toán kho).
    - Tích hợp nút `In Phiếu Kiểm Kê (A4)` tại modal xem chi tiết và bảng lịch sử kiểm kê kho.
- **Gói Topup Ví Spa Sang Tab Bảng Giá (`tab-price-lists` - bill-4):** Tích hợp sub-tab thứ 4 `#btn-subtab-pl-topup` và container `#pl-subtab-topup` vào Tab Bảng Giá. Tự động tải danh sách gói khi chuyển tab. Gỡ sạch menu thừa ở Cài Đặt.
- **Server-side Injection Màn Hình Đăng Nhập (`server.py` - ui-9):** Route `GET /` đọc `app_name` và `shop_logo` từ SQLite, inject trực tiếp vào HTML response. Hiển thị 0ms tức thì, không giật/nháy FOUC.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `tests/test_print_templates_and_css.py`: **PASS 4/4** (Chuẩn hóa @page auto K80, A4 Phiếu Thu/Chi, A4 Phiếu Kiểm Kê).
- `tests/test_topup_packages_subtab.py`: **PASS 1/1** (DOM subtab topup & navigation).
- `tests/test_login_branding_injection.py`: **PASS 2/2** (Server injection & fallback).
- `tests/test_spa_render.js`: **PASS 18/18** (Render bảng Spa, dải lịch, K80, ví).
- `tests/test_checkpoint_integrity.py`: **PASS 4/4** (Toàn vẹn checkpoint & roadmap).
- `tests/test_html_integrity.py`: **PASS 3/3** (Toàn vẹn DOM 12 tabs chính).

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `templates/index.html` | Thêm subtab 4 `pl-subtab-topup` vào `tab-price-lists`, gỡ khỏi Cài Đặt, `switchPriceListSubTab` |
| `tests/test_topup_packages_subtab.py` | Test DOM subtab topup và điều hướng |
| `server.py` | Hàm `index()` inject `app_name` và `shop_logo` trực tiếp vào HTML, cache memory |
| `routers/settings.py` | `update_company_settings` gọi `invalidate_branding_cache()` |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] `bill-5`: Kiểm tra và chuẩn hóa mẫu in K80/A4 B2B trên các trình duyệt.
- [ ] `sys-1`: Bảng Quản Lý Hotel (Khách Sạn Chó Mèo) thiết kế schema & layout.
- [ ] `sys-5`: Đóng gói file chạy EXE độc lập (`build_exe.bat`) và test trên Windows sạch.
- [ ] `auth-1`: Quản lý nhân viên (Cài Đặt > Nhân Viên) và phân quyền ca làm việc.
- [ ] `sys-4`: Chuẩn bị kiến trúc schema & hook cho chức năng AI trợ lý.

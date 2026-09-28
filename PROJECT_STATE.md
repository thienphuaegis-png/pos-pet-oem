# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-09-27 — Visual Print Designer & 12 Mẫu Nghiệp Vụ Thực Tế (bill-6)  
**Server:** `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db`)  
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`  
**Archive Log:** `docs/archive/STATE_2026_09.md` (lịch sử chi tiết các phiên trước)

---

## 1. Phiên Hiện Tại ✅ (2026-09-27)
- **Bổ Sung Phân Hệ Quản Lý Hotel (Khách Sạn Thú Cưng) (sys-1):**
  - **Database & Data:** Khởi tạo bảng `hotel_rooms` và `hotel_bookings`, seed 16 phòng chuẩn (Khu Mèo gỗ C01-C08, Khu Chó inox D01-D06, Khu VIP máy lạnh V01-V02).
  - **Tiếp Nhận Đợt Hàng Loạt & Mẫu In K80 (Batch Intake & K80 Print):**
    - Mở rộng bảng `hotel_bookings` với các cột `batch_code`, `pet_weight_at_checkin`, `health_condition`, `deposit_amount`.
    - API `POST /api/hotel/checkin-batch` tiếp nhận đồng thời nhiều bé vào các buồng phòng khác nhau, tính tiền cọc, tự động cập nhật trạng thái phòng `occupied`.
    - Modal Check-in nâng cấp: Combobox tìm kiếm khách hàng đa từ (tên + SĐT), droplist bé tự động theo khách, bảng phân bổ bé vào phòng trống với cân nặng, sức khỏe, đồ gửi kèm.
    - Mẫu in K80 Phiếu Tiếp Nhận Hotel: Chuẩn in nhiệt 80mm có chi tiết từng bé, chi phí buồng phòng, tiền cọc, điều khoản cam kết và 2 chữ ký của Chủ nuôi & NV tiếp nhận.
  - **Giao diện 3 chế độ xem:** Lưới buồng phòng kết hợp Drawer trượt (Mẫu 2), Bảng danh sách phiếu lưu trú (Table view), và Lịch dòng thời gian Gantt theo tuần (Mẫu 3).
  - **Lịch sử lưu trú:** Tách phiếu đã checkout sang Sub-tab thứ 3 `[🏨 Lịch Sử Lưu Trú Hotel]` trong Tab Hóa Đơn (`tab-orders`).
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
- [x] `sys-1`: Bảng Quản Lý Hotel (Khách Sạn Chó Mèo) thiết kế schema & layout, 3 view, checkin/checkout.
- [ ] `bill-5`: Kiểm tra và chuẩn hóa mẫu in K80/A4 B2B trên các trình duyệt.
- [ ] `sys-5`: Đóng gói file chạy EXE độc lập (`build_exe.bat`) và test trên Windows sạch.
- [ ] `auth-1`: Quản lý nhân viên (Cài Đặt > Nhân Viên) và phân quyền ca làm việc.
- [ ] `sys-4`: Chuẩn bị kiến trúc schema & hook cho chức năng AI trợ lý.

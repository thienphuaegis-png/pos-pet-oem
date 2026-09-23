# PROJECT STATE — POS Offline (Spa Thú Cưng & Bán Lẻ Đa Kênh)

**Checkpoint:** 2026-09-23 — Ca Làm Việc + Z-Report + Đếm Tiền + Chuẩn Hóa POS & Bảng Giá Spa  
**Server:** `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db`)  
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`  

---

## Phiên Này ✅ (2026-09-23)

### 1. Ca Làm Việc, Đóng Mở Ca & Z-Report
- **Mở ca & Kết ca:**
  - Sidebar gom gọn thành 1 nút container `#shift-action-container`, tự động đảo trạng thái giữa `▶ Mở Ca` (xanh emerald) và `⏹ Kết Ca` (hổ phách) theo `currentShift`.
  - Tải trạng thái ca tức thì khi mở app hoặc F5 (`loadCurrentShift()` trong `auth.js`).
- **Thống kê két & Z-Report:**
  - Backend API `GET /api/shifts/current/summary` & `POST /api/shifts/{id}/close`: tính toán tiền mặt ban đầu, doanh số bán lẻ, chuyển khoản/thẻ, tiền chi sổ quỹ, tính két lý thuyết `expected_cash = start_cash + cash_sales - cash_expenses`.
  - In phiếu kết ca Z-Report chuẩn 80mm tái sử dụng `#print-modal`.
- **Popup đếm tiền mặt theo mệnh giá VNĐ:**
  - Modal `#modal-cash-counter` hỗ trợ 10 mệnh giá (500k -> 1k), nhập số tờ tự nhân thành tiền thời gian thực, phím Enter chuyển nhanh dòng tiếp theo.
  - Nút chuyển tiếp thông minh: `Điền vào Mở Ca` hoặc `Điền vào Kết Ca` tự động điền số tiền đếm vào ô input tương ứng.

### 2. Sửa Lỗi UI, Xếp Lớp Modal & In Lại Hóa Đơn
- **Phân cấp hiển thị (Z-Index Hierarchy):**
  - Modal cơ sở / ca làm việc: `z-50`
  - Bảng đếm tiền mặt: `z-[70]`
  - Modal in hóa đơn / Z-Report: `z-[80]`
  - Sửa dứt điểm lỗi đè khuất giữa bảng đếm tiền và modal ca, lỗi phiếu in bị chìm dưới modal kết ca.
- **Sửa triệt để lỗi không đóng được modal in:**
  - Bổ sung `style.display = 'none'` vào `closePrintModal()`, xóa sạch xung đột inline style.
  - Hỗ trợ click vùng tối bên ngoài (backdrop click) và phím `Escape` đóng modal tức thì.
- **Khắc phục lỗi in lại hóa đơn từ Lịch sử mua hàng:**
  - Sửa bug `printCurrentViewedOrder()`: lưu tạm biến `code` trước khi gọi `closeModalOrderView()` tránh bị null khi gọi `showPrintModal()`.
  - Thêm validation chặn rỗng và kiểm tra `res.ok` trong `pos.js`.

### 3. Tối Ưu Màn Hình POS & Cột Giá Đại Lý
- Phân bổ lại cấu trúc bảng giỏ hàng POS với độ rộng linh hoạt: `Xóa (36px)`, `STT (36px)`, `Mã hàng (80px)`, `Tên hàng hóa (1fr)`, `ĐVT (48px)`, `SL (96px)`, `Đơn giá (230px)`, `Thành tiền (110px)`.
- Đưa tag `🏷️ Giá Đại Lý` / bảng giá riêng lên cùng dòng ngang với đơn giá: `[Giá gốc] Giá bán [🏷️ Giá Đại Lý] ✏️` (không bị rớt dòng xuống dưới).

### 4. Bảng Giá Dịch Vụ Spa Theo Cân Nặng (Pet Nha Trang)
- **Import 79 mức giá thực tế** từ file `bang_gia_spa_pet_nha_trang.xlsx` vào `pet_service_pricing`, xóa sạch 22 dòng dữ liệu mẫu cũ.
- **5 Nhóm phân loại nghiệp vụ chuẩn:**
  1. `Gói Combo Chó` (24 mức giá, 8 mốc cân: 0-2kg, >2-6kg, >6-10kg, >10-20kg, >20-30kg, >30-40kg, >40-50kg, >=50kg).
  2. `Dịch Vụ Lẻ Chó` (40 mức giá, 8 mốc cân: Tắm massage, Vệ sinh tai, Cắt móng cạo bàn, Cạo lông, Cắt tạo kiểu).
  3. `Spa Mèo` (3 mức giá: Combo tắm vệ sinh mèo <2kg, 2-6kg, >6kg).
  4. `Nhuộm Lông` (4 mức giá: 1 Màu / Nhiều Màu theo vị trí).
  5. `Trị Liệu & Phụ Thu` (8 mức giá: Tắm trị liệu/nấm da 3 mốc cân, gỡ rối, tẩy lông, cắt tỉa đầu, đánh răng).
- **Đồng bộ hóa giao diện:**
  - Dropdown lọc danh mục bảng giá hỗ trợ đủ 5 nhóm mới.
  - Form tiếp nhận phiếu dịch vụ (`modal-create-service-ticket`) gom nhóm `optgroup` chuẩn và hàm `autoCalculateServicePrice()` tự động nhảy giá đúng dải cân nặng của thú cưng.

---

## Kết Quả Kiểm Thử (Verification Suite) 🧪

1. `tests/test_pet_pricing_import.py`: **PASS 6/6** (Đủ 79 bản ghi, 5 danh mục, giá Chó/Mèo/Nhuộm chuẩn, API `/api/pet-services/pricing` 200 OK).
2. `tests/test_shift_close.py`: **PASS** (Tóm tắt ca, tính két lý thuyết và chốt ca thành công).
3. `tests/test_html_integrity.py`: **PASS 3/3** (Toàn vẹn cấu trúc DOM và 12 tab con trực tiếp của main content area).
4. `node -c static/js/app.js && node -c static/js/pos.js && node -c static/js/shifts.js`: **PASS** (Cú pháp JS sạch).

---

## Files Đã Chỉnh Sửa / Tạo Mới

| File | Thay đổi |
|---|---|
| `routers/shifts.py` | Bổ sung hàm `_calc_shift_summary`, endpoint `/current/summary` và logic chốt ca |
| `templates/index.html` | Cấu trúc nút ca `#shift-action-container`, modal `#modal-cash-counter` (z-[70]), phân bổ lại cột giỏ hàng POS, optgroup dịch vụ Spa |
| `static/js/shifts.js` | Quản lý ca, đếm tiền mặt 10 mệnh giá, liên thông mở/kết ca, in Z-Report, export hàm ra `window` |
| `static/js/pos.js` | Tối ưu đóng modal in `closePrintModal()`, kiểm tra `orderCode`, cập nhật render giỏ hàng POS hàng ngang |
| `static/js/app.js` | Sửa bug mất mã đơn khi in lại hóa đơn, đồng bộ bộ lọc bảng giá Spa và tính giá theo cân nặng |
| `static/js/auth.js` | Tự động gọi `loadCurrentShift()` khi khôi phục phiên đăng nhập |
| `scripts/import_pet_pricing.py` | Script import 79 mức giá từ file Excel vào SQLite `pet_service_pricing` |
| `docs/superpowers/specs/2026-09-23-pet-spa-pricing-import-design.md` | Tài liệu đặc tả phân loại bảng giá dịch vụ |
| `tests/test_pet_pricing_import.py` | Test suite kiểm thử tự động bảng giá dịch vụ Spa |
| `tests/test_shift_close.py` | Test suite kiểm thử đóng mở ca và Z-Report |
| `PROJECT_STATE.md` | Cập nhật checkpoint bàn giao |

---

## Việc Tiếp Theo

- [ ] Tab UI quản lý nhân viên (Cài Đặt > Nhân Viên)
- [ ] Tab UI lịch sử ca + duyệt ca (cho role `accountant`)
- [ ] Báo cáo doanh thu và chênh lệch két theo ca trong tab Báo Cáo
- [ ] Bắt buộc đổi mật khẩu ở lần đầu đăng nhập

# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-10-11 — Chuẩn Hóa VietQR Dropdown Ngân Hàng, Sửa Lỗi Thanh Toán Bank Ra Tiền Mặt, Căn Lề Trái/Giữa/Phải Thiết Kế Mẫu In & Cố Định Mã Tạm Tính
**Server:** `http://127.0.0.1:8000` / `http://127.0.0.1:8998` — FastAPI + SQLite (`data/pos.db` & `C:/POS`)
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2` & Sync to `C:/POS`
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`)
**Archive Log:** `docs/archive/STATE_2026_09.md`

---

## 1. Phiên Hiện Tại ✅ (2026-10-11)
- **Chuẩn Hóa Ngân Hàng & Chặn Thanh Toán Thiếu Thông Tin (`static/js/banks.js`, `static/js/modules/productions.js`, `templates/index.html`):**
  - Tạo `static/js/banks.js` định nghĩa danh sách 26 ngân hàng chuẩn NAPAS/VietQR (mã BIN, tên ngắn, tên đầy đủ).
  - Thay ô nhập tự do thành combobox/dropdown chọn ngân hàng tại Modal Tài Khoản Thanh Toán & Cài Đặt VietQR.
  - Chặn submit thanh toán Chuyển khoản nếu tài khoản nhận chưa có mã ngân hàng hợp lệ hoặc thiếu số tài khoản.
- **Sửa Lỗi Backend Ghi Cứng 'cash' Khi Thanh Toán 1 Hình Thức & Rebuild Exe (`routers/pos.py`, `schemas.py`, `POS_Mastercare.exe`):**
  - Lưu đúng `payment_method` (`transfer`, `card`, `wallet`, `cash`) vào `order_payments` và `cashbook` thay vì ép cứng `cash`.
  - Rebuild lại `POS_Mastercare.exe` sạch (31MB) để máy chủ chạy bản đóng gói nhận được thay đổi backend Python.
- **Hiển Thị Tên Ngân Hàng Đầy Đủ Trên Hóa Đơn (`static/js/banks.js`, `static/js/pos.js`, `static/js/modules/productions.js`):**
  - Hiển thị format: `Ngân hàng TMCP Tiên Phong (TPBank)` thay vì chỉ hiện mã tắt `TPB`.
- **Đồng Bộ Căn Lề Mẫu In & Cố Định Mã Tạm Tính (`static/js/modules/productions.js`, `static/js/pos.js`):**
  - Khắc phục lỗi căn lề Trái/Giữa/Phải trên Designer không ăn ra bản in thật: Tự động cập nhật toạ độ `x` của khối theo lề trang in và điều chỉnh `align` đồng bộ.
  - Logo được gắn `width: 100%; object-fit: contain` hỗ trợ căn giữa/trái/phải mượt mà.
  - Hoán đổi toạ độ `y` khi sắp xếp thứ tự khối (▲/▼ và Drag-Drop) để bản in thật tuân thủ đúng thứ tự trực quan.
  - Cố định mã `draft_code` trên từng tab giỏ hàng để tránh lệch mã khi in lại hóa đơn tạm tính nhiều lần.
- **Đổi Hàng & Trả Hàng (Return & Exchange) Chuẩn Bán Lẻ (`database.py`, `routers/pos.py`, `templates/index.html`):**
  - Tạo bảng `order_returns` và `order_return_items`, bảo toàn hóa đơn gốc (`orders`), sinh mã chứng từ `RET-YYYYMMDD-xxxx`.
  - Modal 2 cột trực quan, tính toán cấn trừ công nợ, hoàn kho, hạch toán Sổ Quỹ.
- **Tách Dòng Sản Phẩm Làm Quà Tặng (0 đ) Tại Quầy (`static/js/pos.js`):**
  - Nút `🎁 Tách tặng` khi SL >= 2, sinh dòng quà tặng giá 0 đ (`is_manual_gift: true`).
- **Tự Động Đếm & Bump Phiên Bản Động:**
  - Bump phiên bản lên `v3.6.1`.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `tests/test_pos_bank_select_and_transfer.py`: **PASS 2/2**
- `tests/test_pos_print_template_and_bank_sync.py`: **PASS 3/3**
- `tests/test_print_autoflow_and_reorder.py`: **PASS 1/1**
- `tests/test_print_designer_2col_and_clean_canvas.py`: **PASS 2/2**
- `tests/test_html_integrity.py`: **PASS 5/5**
- `tests/test_order_return_exchange.py`: **PASS 9/9**
- `tests/test_pos_split_gift_item.py`: **PASS 2/2**
- Node sandbox runner kiểm tra logic render và map mã VietQR chính xác 100%.

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `static/js/banks.js` | Danh mục 26 ngân hàng VietQR NAPAS & helper display name |
| `static/js/modules/productions.js` | Đồng bộ toạ độ x/y căn lề Designer, combobox ngân hàng tài khoản |
| `static/js/pos.js` | Cố định `draft_code`, chặn thanh toán thiếu STK, tên ngân hàng đầy đủ |
| `templates/index.html` | Combobox chọn ngân hàng trong modal tài khoản thanh toán |
| `templates/pos.html` | Thêm thẻ chọn ngân hàng thụ hưởng đồng bộ với index.html |
| `POS_Mastercare.exe` | Rebuild exe mới (31MB) chứa backend fix payment_method |
| `version.json` | Cập nhật version `v3.6.1` |
| `PROJECT_STATE.md` | Checkpoint phiên làm việc |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] Chạy `CAP_NHAT.bat` trên máy chủ và xác nhận in thử đơn chuyển khoản.
- [ ] Kiểm tra báo cáo tổng hợp dòng tiền sau các giao dịch đổi/trả hàng.
- [ ] Tích hợp đồng bộ dữ liệu thời gian thực giữa quầy offline và Supabase Cloud.

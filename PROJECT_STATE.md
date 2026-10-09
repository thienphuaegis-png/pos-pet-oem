# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-10-09 — Quản Lý Phiếu Nạp Ví Spa, Kiểm Kê Từng Phần, Sửa/Xóa Đơn OEM, Phiên Bản Động & Trải Nghiệm POS (Wheel Guard, Formatter, ESC & Hotkeys)
**Server:** `http://127.0.0.1:8998` / `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db` & `C:/POS`)
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2` & Sync to `C:/POS`
**Archive Log:** `docs/archive/STATE_2026_09.md` (lịch sử chi tiết các phiên trước)

---

## 1. Phiên Hiện Tại ✅ (2026-10-09)
- **Quản Lý, Xem, Sửa, Xóa Phiếu Nạp Ví Spa Hoàn Tác 100% (`routers/topup.py`, `static/js/modules/spa.js`, `static/js/pos.js`):**
  - Bổ sung trọn bộ API `GET`, `PUT`, `DELETE /api/topup/transactions` quản lý giao dịch nạp tiền ví Spa.
  - Tích hợp sub-tab "Hóa Đơn Nạp Ví Spa" trong Tab Quản Lý Hóa Đơn và nút Sửa/Xóa trong popup Lịch Sử Ví Khách Hàng.
  - Hỗ trợ đổi số tiền, chọn tài khoản ngân hàng hoặc két tiền mặt nhận tiền; khi xóa/sửa hoàn tác đồng bộ 100% số dư ví, điểm thưởng loyalty và phiếu thu trong sổ quỹ.
- **Kiểm Kê Kho Từng Phần Linh Hoạt (`routers/inventory.py`, `static/js/app.js`):**
  - Cho phép kiểm kê linh hoạt từng nhóm hàng hoặc các sản phẩm chọn lọc thay vì bắt buộc kiểm toàn bộ kho.
  - Checkbox chọn từng dòng hàng, lọc nhanh "Chỉ xem dòng lệch", cân bằng kho riêng biệt cho các mặt hàng đã chọn.
- **Nhập Hàng: Để Trống Ô Số Lượng & Thực Trả NCC (`static/js/modules/purchases.js`, `templates/index.html`):**
  - Để trống `value=""`, `placeholder="0"` cho ô số lượng và thực trả NCC thay vì điền sẵn 1 và 0.
  - Bổ sung validate số lượng > 0 chống lưu phiếu rác.
- **Huy Hiệu Trạng Thái BOM & Tab Lọc Nhanh (`routers/products.py`, `static/js/modules/productions.js`, `templates/index.html`):**
  - Tự động đếm và trả về `bom_count` trong API danh sách sản phẩm.
  - Hiển thị badge nổi bật `⚡ Đã có BOM (X tp)` và bộ 3 tab lọc nhanh "Tất cả" / "Đã có BOM" / "Chưa có BOM" trong quản lý công thức BOM.
- **Mở Khóa Sửa & Xóa Đơn Đặt Gia Công OEM Trạng Thái `RECEIVED` (`routers/oem.py`, `routers/cashbook.py`, `static/js/modules/productions.js`):**
  - Cho phép chỉnh sửa hoặc xóa đơn gia công OEM ở mọi trạng thái kể cả sau khi đã nhận hàng nhập kho.
  - Tự động hoàn tác trừ tồn kho thành phẩm đã nhận, hoàn lại tồn kho nguyên liệu xưởng và hủy phiếu chi liên quan trong sổ quỹ.
- **Hệ Thống Phiên Bản Động, Auto Cache-Busting & Cập Nhật Máy Chủ 1-Chạm (`version.json`, `version_helper.py`, `server.py`, `templates/index.html`):**
  - Tự động đọc commit hash, ngày build từ Git và `version.json`.
  - Tự động làm mới cache trình duyệt (`.js?v=hash_date`).
  - Modal Changelog xem lịch sử cập nhật ở chân sidebar kèm tính năng đọc Git Log tự động và nút "⚡ Cập Nhật Ngay".
- **Chuẩn Hóa Modal Xác Nhận Thay Thế Popup Trình Duyệt (`static/js/app.js`, `static/js/pos.js`...):**
  - Chuyển đổi toàn bộ `window.confirm()` sang `showConfirmModal` chuẩn giao diện POS (backdrop blur, icon phân loại màu, nút Xác Nhận & Hoàn Tác).
- **Tính Giá Dịch Vụ Spa Tức Thì 0ms & Dải Cân Nặng Thông Minh (`routers/promotions.py`, `static/js/modules/spa.js`):**
  - So khớp `COLLATE NOCASE` cho tên dịch vụ, tính giá ngay tức thì 0ms ở phía client khi gõ kg hoặc chọn dịch vụ.
  - Tự động fallback lên mức trần cao nhất khi cân nặng vượt mốc tối đa của bảng giá.
- **Nâng Cấp Trải Nghiệm POS: Wheel Guard, Formatter Tiền Tệ, ESC & Hotkeys:**
  - Wheel Guard: Chặn cuộn chuột làm thay đổi số lượng trên các ô nhập số lượng, tiền tệ và kiểm kê kho.
  - Formatter thời gian thực: Tự động thêm dấu chấm phân cách hàng nghìn (`1.500.000`), để trống các ô giá vốn, giá bán, phụ thu, tip thợ.
  - ESC Closer: Phím `ESC` đóng nhanh mọi modal, dropdown tìm kiếm và popup đang mở.
  - Bảng phím tắt thu ngân: F1 (+ Hóa đơn), F2 (Đổi tab), F3 (Tìm hàng/Barcode), F4 (Tìm khách), F8 (Đổi PT thanh toán), F9 (Thanh toán & In), F10 (Đếm tiền két), `?` (Mở bảng trợ giúp phím tắt).
- **Bộ Kiểm Thử Tự Động (TDD):**
  - Pass 100% toàn bộ 31 test cases (`test_pos_hotkeys_and_wheel_guard.py`, `test_spa_auto_pricing.py`, `test_unified_confirm_modals.py`, `test_dynamic_version.py`, `test_ping_endpoint.py`, `test_oem_order_edit_delete.py`, `test_bom_status_badges.py`, `test_purchase_empty_inputs.py`, `test_flexible_stock_audit.py`, `test_topup_transactions_management.py`...).
- **Đóng Gói & Đồng Bộ:**
  - Re-compile `POS_Mastercare.exe` (onefile PyInstaller).
  - Đã đẩy toàn bộ commit lên remote GitHub `main` (`commit 961297d`).

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `tests/test_pos_hotkeys_and_wheel_guard.py`: **PASS 1/1**
- `tests/test_spa_auto_pricing.py`: **PASS 1/1**
- `tests/test_unified_confirm_modals.py`: **PASS 1/1**
- `tests/test_dynamic_version.py`: **PASS 5/5**
- `tests/test_ping_endpoint.py`: **PASS 5/5**
- `tests/test_oem_order_edit_delete.py`: **PASS 2/2**
- `tests/test_bom_status_badges.py`: **PASS 2/2**
- `tests/test_purchase_empty_inputs.py`: **PASS 1/1**
- `tests/test_flexible_stock_audit.py`: **PASS 2/2**
- `tests/test_topup_transactions_management.py`: **PASS 2/2**
- `tests/test_topup_points_and_cashbook_sync.py`: **PASS 4/4**
- `tests/test_cashbook_edit_delete.py`: **PASS 1/1**
- `tests/test_sync_doc_types_and_presets.py`: **PASS 1/1**
- `tests/test_print_autoflow_and_reorder.py`: **PASS 1/1**
- `tests/test_kiotviet_print_templates_ui.py`: **PASS 2/2**
- **Tổng cộng: 31/31 passed.**

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `version_helper.py` & `version.json` | Helper đọc thông tin phiên bản động, commit Git, ngày build và trích xuất nhật ký Git thời gian thực |
| `server.py` | Route `/api/version`, auto cache-busting querystring hash cho các script tĩnh |
| `static/js/app.js` | Wheel Guard toàn cục, auto format tiền tệ, universal ESC modal closer, bảng phím tắt, showConfirmModal |
| `static/js/pos.js` | Phím tắt bán hàng F1, F2, F3, F4, F8, F9, sửa/xóa giao dịch nạp ví Spa |
| `static/js/modules/spa.js` | Tính giá Spa tức thì 0ms, so khớp dải cân thông minh, quản lý danh sách phiếu nạp ví |
| `routers/topup.py` | API nạp ví, sửa/xóa hoàn tác ví, điểm và sổ quỹ |
| `routers/inventory.py` | API kiểm kê kho từng phần theo checkbox |
| `routers/oem.py` | Mở khóa sửa/xóa đơn gia công OEM trạng thái RECEIVED và hoàn tác kho |
| `routers/promotions.py` | Backend tính giá Spa dải cân linh hoạt không phân biệt hoa thường |
| `templates/index.html` | UI modal phím tắt, modal changelog phiên bản, bộ lọc BOM, ô nhập tiền tệ và placeholder |
| `POS_Mastercare.exe` | Binary portable onefile biên dịch mới nhất |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] `ecomm-sync`: Nghiên cứu kịch bản kéo đơn sàn TMĐT (Shopee/TikTok Shop) tự động trừ tồn kho.
- [ ] `bill-5`: Kiểm tra và chuẩn hóa in ấn K80/A4 trên máy in vật lý tại quầy thực tế.
- [ ] `cloud-2`: Tích hợp đồng bộ dữ liệu thời gian thực giữa quầy offline và Supabase Cloud.


---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `routers/cashbook.py` | API analytics đa chiều & export excel báo cáo kinh doanh |
| `routers/pos.py` | Dynamic SQL bộ lọc hóa đơn, lưu points_earned, hoàn điểm & dọn order_payments khi xóa đơn |
| `services/telegram_bot.py` | Sửa reply_markup editMessageText, hoàn tiền ví, thu hồi điểm, hạ hạng khi hủy đơn, đồng bộ order_payments |
| `static/js/chart.umd.min.js` | Bundle Chart.js v4.4 phục vụ render biểu đồ offline 100% |
| `static/js/modules/reports_analytics.js` | Module render 5 tab báo cáo, 4 biểu đồ Canvas và xuất Excel |
| `static/js/modules/productions.js` | Thanh lọc hóa đơn nâng cao, custom confirm modal xóa đơn |
| `static/js/pos.js` | Bảng giỏ hàng 2 tầng, tránh chồng chéo số lượng & đơn giá |
| `templates/index.html` | UI tab reports mới, toolbar filter hóa đơn, nhúng chart.umd.min.js |
| `templates/pos.html` | Đồng bộ lưới grid cart table |
| `POS_Mastercare.exe` | Binary portable onefile biên dịch mới nhất |
| `C:\POS` | Thư mục chạy thực tế đồng bộ 100% |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] `ecomm-sync`: Nghiên cứu kịch bản kéo đơn sàn TMĐT (Shopee/TikTok Shop) tự động trừ tồn kho.
- [ ] `bill-5`: Kiểm tra và chuẩn hóa in ấn K80/A4 trên máy in vật lý tại quầy thực tế.
- [ ] `cloud-2`: Tích hợp đồng bộ dữ liệu thời gian thực giữa quầy offline và Supabase Cloud.


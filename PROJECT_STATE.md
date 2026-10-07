# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-10-07 — Telegram ChatOps, Bảng Giỏ Hàng POS, Báo Cáo Kinh Doanh Đa Chiều & Bộ Lọc Hóa Đơn Server-Side  
**Server:** `http://127.0.0.1:8998` / `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db` & `C:/POS`)  
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2` & Sync to `C:/POS`  
**Archive Log:** `docs/archive/STATE_2026_09.md` (lịch sử chi tiết các phiên trước)

---

## 1. Phiên Hiện Tại ✅ (2026-10-07)
- **Đồng Bộ Bảng Giỏ Hàng POS & Sửa Chồng Chéo Cột (`templates/pos.html`, `templates/index.html`, `static/js/pos.js`):**
  - Khắc phục triệt để lỗi lệch cột giữa Header và Row trên Desktop; đồng bộ chung hệ lưới CSS Grid.
  - Tách ô ĐƠN GIÁ thành 2 tầng phân cấp: Dòng trên là giá bán thực tế (in đậm) + Badge Giá riêng + Icon bút; Dòng dưới là giá gốc gạch ngang + mức giảm đỏ.
  - Tinh chỉnh bề rộng lưới: `34px 34px 85px minmax(130px, 1fr) 48px 100px 175px 120px` đảm bảo không bị lấn/chồng lên nút `[+]` của cột SL.
- **Hoàn Thiện Nghiệp Vụ Telegram ChatOps Bot (`services/telegram_bot.py`):**
  - Khắc phục lỗi nuốt nút bấm inline: bổ sung `reply_markup` cho API `editMessageText` khi gọi callback query 1-touch.
  - Nghiệp vụ Hủy đơn: Hoàn kho hàng hóa, hoàn BOM nguyên liệu, trừ nợ khách, hoàn tiền ví Spa (`spa_wallet_transactions`), thu hồi điểm tích lũy (`points_earned`), hạ hạng thành viên và xóa phiếu thu sổ quỹ.
  - Nghiệp vụ Đổi thanh toán: Cập nhật đồng bộ cả `cashbook.account_id` và `order_payments` (`method` + `account_id`).
  - Bảo vệ Bot Token trong test suite tránh bị ghi đè token giả.
- **Hệ Thống Báo Cáo Phân Tích Kinh Doanh Đa Chiều & Dashboard Biểu Đồ Trực Quan (`tab-reports`):**
  - Sticky Filter Bar với 5 nút chọn nhanh (`Hôm nay`, `Hôm qua`, `7 ngày`, `Tháng này`, `Tháng trước`) + bộ chọn ngày tùy chỉnh.
  - 4 thẻ KPI động: Doanh thu, Thực thu, Công nợ, Số đơn & Giá trị đơn TB (AOV).
  - Tích hợp 5 Sub-Tabs:
    - `📊 Tab 1: Tổng Quan & Biểu Đồ`: 4 biểu đồ Chart.js (Timeline, Nguồn thu Doughnut, Kênh thanh toán Bar ngang, Top nhân viên).
    - `💳 Tab 2: Doanh Thu & Thanh Toán`: Bảng chi tiết từng kênh thanh toán kèm tỷ trọng %.
    - `📦 Tab 3: Hàng Hóa vs 💆 Dịch Vụ`: Bóc tách doanh thu hàng bán lẻ vs dịch vụ Spa / Hotel.
    - `👤 Tab 4: Báo Cáo Nhân Viên`: Doanh số, thực thu, số đơn, tính hoa hồng từng người.
    - `🏆 Tab 5: Top Món Bán Chạy`: Xếp hạng 20 sản phẩm/dịch vụ bán chạy nhất.
  - Hỗ trợ xuất file Excel báo cáo kinh doanh chuẩn kế toán (`GET /api/reports/export-excel`).
  - Tích hợp bundle thư viện `Chart.js v4.4` offline cục bộ tại `static/js/chart.umd.min.js`.
- **Thanh Bộ Lọc Hóa Đơn Nâng Cao Server-Side (`templates/index.html`, `static/js/modules/productions.js`, `routers/pos.py`):**
  - Nâng cấp API `GET /api/orders` truy vấn động đa tiêu chí: mốc thời gian, hình thức thanh toán, nhân viên tạo đơn, khách hàng, có chứa sản phẩm/dịch vụ, trạng thái công nợ và từ khóa.
  - Thiết kế thanh bộ lọc 2 hàng khoa học, kèm nút `[🔍 Lọc Đơn]` và `[✕ Xóa Lọc]`.
- **Chuẩn Hóa Hộp Thoại Xác Nhận Hủy Đơn Chuẩn Design System Mastercare:**
  - Thay thế hoàn toàn popup browser `confirm()` và `alert()` bằng `window.showConfirmModal` và `window.showToast` (màu đỏ nổi bật, thông báo 4 tác vụ hoàn tác, không dính domain ngrok).
- **Bộ Kiểm Thử Tự Động (TDD):**
  - Pass 100% toàn bộ 21 test cases (`test_order_advanced_filters.py`, `test_reports_analytics.py`, `test_points_and_tier_upgrade.py`, `test_pos_mobile_responsive.py`, `test_telegram_chatops.py`).
- **Đóng Gói & Đồng Bộ:**
  - Re-compile `POS_Mastercare.exe` (onefile).
  - Tự động sao chép toàn bộ mã nguồn sang thư mục chạy thực tế `C:\POS`.
  - Đã đẩy toàn bộ commit lên remote GitHub `main`.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `tests/test_order_advanced_filters.py`: **PASS 5/5**
- `tests/test_reports_analytics.py`: **PASS 3/3**
- `tests/test_points_and_tier_upgrade.py`: **PASS 1/1**
- `tests/test_pos_mobile_responsive.py`: **PASS 2/2**
- `tests/test_telegram_chatops.py`: **PASS 10/10**

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


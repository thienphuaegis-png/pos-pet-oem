# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-09-30 — Tách Bạch Ví Spa khỏi Tiền Phòng Khách Sạn (Wallet-1), Tab Hướng Dẫn Nghiệp Vụ (Docs & Wiki), 14 Tabs Tailwind UI & Lucide Icons  
**Server:** `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db`)  
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`  
**Archive Log:** `docs/archive/STATE_2026_09.md` (lịch sử chi tiết các phiên trước)

---

## 1. Phiên Hiện Tại ✅ (2026-09-30)
- **Tách Bạch Ví Spa Khỏi Tiền Phòng Khách Sạn (`wallet-1`):**
  - `routers/pos.py`: loại trừ danh mục hotel/khách sạn/lưu trú/phòng khỏi `t_spa` khi tính trần trừ ví trong `create_order`.
  - `routers/hotel.py`: `get_checkout_summary` bóc tách `room_payable`, `spa_total`, `max_spa_wallet_deduction` (KHÔNG bao gồm tiền phòng); `checkout_hotel_guest` chặn trừ ví khi `spa_total == 0`, clamp về `min(spa_wallet_amount, max_spa_wallet_deduction)`, ghi `spa_wallet_transactions`.
  - `schemas.py`: thêm `use_spa_wallet`, `spa_wallet_amount` vào `HotelBookingCheckout`.
  - `templates/index.html`: modal `#modal-hotel-checkout` có cảnh báo "🚫 Không áp dụng Ví Spa cho tiền phòng" + checkbox/input trừ ví Spa.
  - `static/js/modules/hotel.js`: nạp `checkout-summary` đầy đủ (room/spa/deposit/grand total, danh sách vé spa), thêm `onToggleCheckoutWallet`, `onWalletDeductInput`, gửi `use_spa_wallet`/`spa_wallet_amount` khi submit checkout.
  - `tests/test_spa_wallet_hotel_rules.py`: 4/4 PASS.
- **Bổ Sung Tab Hướng Dẫn Nghiệp Vụ Trực Quan (`tab-guide` - guide-1):**
  - Vị trí: Đặt ngay trên Tab Cài Đặt (`tab-settings`) với icon Lucide `book-open` (nâng sidebar lên 15 nút).
  - Kiến trúc Docs & Wiki: Sub-sidebar 7 phân hệ lớn (POS, Spa, Hotel, Ví, Quỹ, Kho, Mạng LAN).
  - 100% Vector SVG Flowchart: Vẽ toàn bộ 7 sơ đồ luồng luân chuyển dữ liệu và dòng tiền chạy offline độc lập.
  - Tích hợp quy trình chuẩn SOP 4 bước, thẻ phím tắt quầy (F1-F9) và mẹo xử lý sự cố thực tế.
  - Hàm điều hướng `switchGuideSubTab(subId)` trong `app.js` chuyển đổi 0ms không giật trang.
- **Chuẩn Hóa Giao Diện Toàn Hệ Thống Sang Tailwind CSS & Lucide Icons:**
  - Gỡ bỏ 100% emoji thô trên toàn bộ 14 tabs chính, thay bằng hệ thống biểu tượng vector SVG Lucide.
- **Phân Hệ Khách Sạn Thú Cưng (Pet Hotel Management System):**
  - Hoàn tất 16 phòng lưu trú, tiếp nhận theo lô (`checkin-batch`), mẫu in K80 tiếp nhận, đối soát tiền cọc.
- **Triển Khai Mạng Cục Bộ & Tự Động Dò Máy Chủ LAN (Multi-Site Deploy):**
  - Bộ kịch bản `.bat`, PowerShell `find_server.ps1` tự dò IP và sinh mã QR truy cập quầy.
- **Đồng Bộ Đám Mây & PostgreSQL Adapter (Supabase Migration):**
  - Bộ script di chuyển dữ liệu sang Supabase PostgreSQL, sẵn sàng triển khai kiến trúc Hybrid Cloud.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `tests/test_html_integrity.py`: **PASS 5/5** (14 tabs con trực tiếp, 15 nút điều hướng sidebar).
- `tests/test_checkpoint_integrity.py`: **PASS 4/4** (Toàn vẹn Checkpoint Protocol & Roadmap).
- `tests/test_hotel_system.py`: **PASS 14/14** (API & logic nghiệp vụ khách sạn thú cưng).
- `tests/test_spa_wallet_hotel_rules.py`: **PASS 4/4** (Ví Spa không cấn trừ tiền phòng khách sạn).
- `tests/test_auth.py`: **PASS 8/8** (Xác thực, phân quyền RBAC & ca làm việc).
- `tests/test_shift_close.py`: **PASS 1/1** (Đối soát két và đóng ca).
- `tests/test_fixed_print_bold_configs.py`: **PASS 4/4** (Cấu hình in đậm trường mẫu in).
- Ghi chú: `tests/test_cashbook_api.py`, `test_flow_code_generation.py`, `test_loyalty_frontend.py`, `test_pet_pricing_table.py` có 6 fail pre-existing (không liên quan phiên này, đã verify bằng git stash trước/sau).

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `templates/index.html` | Thêm nút sidebar `Hướng Dẫn` & khối `#tab-guide` với 7 phân hệ và SVG Flowcharts; modal `#modal-hotel-checkout` bổ sung cảnh báo & trừ ví Spa |
| `static/js/app.js` | Hàm `switchGuideSubTab(subId)` điều hướng danh mục tài liệu |
| `static/js/modules/hotel.js` | `openHotelCheckoutModal` nạp checkout-summary đầy đủ, `onToggleCheckoutWallet`, `onWalletDeductInput`, `submitHotelCheckout` gửi tham số ví Spa |
| `routers/hotel.py` | `get_checkout_summary` bóc tách hạn mức ví; `checkout_hotel_guest` trừ ví chỉ cho dịch vụ Spa |
| `routers/pos.py` | Loại trừ dịch vụ hotel khi tính trần `t_spa` |
| `schemas.py` | Thêm `use_spa_wallet`, `spa_wallet_amount` vào `HotelBookingCheckout` |
| `tests/test_spa_wallet_hotel_rules.py` | Test PASS 4/4 quy tắc ví spa không trừ tiền phòng |
| `tests/test_html_integrity.py` | Kiểm tra toàn vẹn 14 tabs DOM & 15 nút sidebar Lucide |
| `docs/superpowers/specs/2026-09-30-guide-tab-docs-wiki-design.md` | Bản thiết kế chi tiết Docs & Wiki Layout |
| `docs/superpowers/plans/2026-09-30-guide-tab-docs-wiki-plan.md` | Kế hoạch triển khai chi tiết |
| `docs/superpowers/plans/2026-09-30-spa-wallet-no-hotel-room-plan.md` | Kế hoạch tách bạch ví Spa khỏi tiền phòng khách sạn |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] `sys-5`: Đóng gói file chạy EXE độc lập (`build_exe.bat`) và test trên Windows sạch.
- [ ] `bill-5`: Kiểm tra và chuẩn hóa in ấn K80/A4 trên máy in vật lý tại quầy.
- [ ] `cloud-2`: Tích hợp đồng bộ dữ liệu thời gian thực giữa quầy offline và Supabase Cloud.
- [ ] `sys-4`: Chuẩn bị kiến trúc schema & hook cho chức năng AI trợ lý quầy.
- [ ] `test-1`: Sửa 6 test fail pre-existing (`test_cashbook_api`, `test_flow_code_generation`, `test_loyalty_frontend`, `test_pet_pricing_table`) — không chặn phiên này nhưng cần dọn sau.

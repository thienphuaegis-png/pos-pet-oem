# PROJECT STATE — POS Offline (Spa Thú Cưng & Bán Lẻ Đa Kênh)

**Checkpoint:** 2026-09-24 — Nhóm Hàng Hóa, Lọc Danh Mục & Giảm Giá Theo Nhóm Vào Bảng Giá / Khuyến Mãi  
**Server:** `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db`)  
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`  

---

## Phiên Này ✅ (2026-09-24)

### 1. Phân Loại Nhóm Hàng Hóa (Product Categories)
- **Cơ sở dữ liệu & Model:**
  - Bảng `products`: Bổ sung cột `category TEXT DEFAULT 'Khác'`. Auto-migration trong `database.py`.
  - Schema Pydantic: `ProductCreate` & `ProductUpdate` hỗ trợ trường `category`.
  - Endpoint `GET /api/products/categories`: Danh sách nhóm hàng duy nhất dùng cho dropdowns / datalist.
  - Endpoint `GET /api/products?category=...`: Lọc sản phẩm theo nhóm.
  - Hỗ trợ nhập/xuất Excel: Cột "Nhóm hàng" tự động mapping khi import hoặc export.
  - Bảng Tồn kho tổng hợp (`GET /api/inventory/unified`): Trả về trường `category` cho cả sản phẩm và nguyên liệu.

### 2. Giảm Nhanh Theo Nhóm Vào Bảng Giá & Ma Trận Giá
- **Áp dụng chiết khấu theo nhóm vào Bảng giá:**
  - `POST /api/price-lists/{id}/bulk-discount`: Cho phép nhận `category` để chỉ giảm % cho nhóm sản phẩm được chọn (thay vì toàn bộ shop).
  - Ma trận giá `GET /api/price-lists/{id}/matrix?category=...`: Hỗ trợ lọc theo nhóm hàng và hiển thị tag nhóm trực tiếp trên từng dòng sản phẩm.
- **Áp dụng khuyến mãi hàng loạt theo nhóm:**
  - `POST /api/promotions/{id}/items/bulk-by-category`: Tự động thêm toàn bộ sản phẩm thuộc 1 nhóm vào chương trình khuyến mãi với mức giảm định sẵn (% hoặc số tiền).

### 3. Giao Diện (UI / UX Hiện Đại & Quản Lý Nhóm Tái Sử Dụng Chuẩn KiotViet)
- **Bảng DB `product_categories` & Router `routers/categories.py`:**
  - Bảng riêng quản lý nhóm hàng hóa 1 cấp (`id, name UNIQUE, description, sort_order`).
  - Hỗ trợ đổi tên nhóm: tự động đồng bộ tên mới sang toàn bộ sản phẩm thuộc nhóm.
  - Hỗ trợ xóa nhóm: bảo vệ nhóm mặc định `Khác`, tự động chuyển sản phẩm của nhóm bị xóa về `Khác`.
- **Modal Thêm / Sửa Hàng Hóa:**
  - Dropdown `<select id="modal-prod-category">` nạp động danh mục.
  - Nút `[+]` cạnh dropdown mở popup mini `#modal-quick-add-category` thêm nhanh nhóm mới và tự động gán ngay vào hàng hóa.
- **Thanh lọc & Tối ưu Giao diện:**
  - Tối giản hàng lọc: Bỏ thanh pill ngang tránh trùng lặp; dùng dropdown `Nhóm hàng: [Tất cả nhóm v]` kết hợp nút icon `[⚙️]` kế bên để mở modal Quản lý nhóm khi cần.
- **Modal Quản Lý Nhóm Hàng Hóa (`#modal-category-manager`):**
  - Mở từ nút icon `[⚙️]` cạnh dropdown nhóm hàng.
  - Thêm mới nhóm, sửa trực tiếp tên nhóm (inline edit), xóa nhóm có xác nhận an toàn.
- **Tab Bảng Giá (Ma Trận Giá):**
  - Thanh công cụ "⚡ Giảm nhanh": Thêm dropdown chọn phạm vi (Tất cả nhóm hoặc Nhóm cụ thể) kèm ô nhập % giảm.
  - Bộ lọc Ma trận giá: Thêm dropdown lọc nhanh theo Nhóm hàng cạnh thanh tìm kiếm.
  - Bảng ma trận bổ sung cột "Nhóm Hàng".
- **Cơ sở dữ liệu & Phân cấp nhóm khách hàng:**
  - Bảng `contacts`: Thêm `points` (tích lũy trọn đời xét thăng hạng) và `spa_wallet_balance` (số dư ví nạp trả trước cho Spa).
  - Bảng `customer_segments`: Thêm `min_points`, `allow_points`, `price_list_id`. Phân định rõ nhóm Khách Lẻ (`allow_points=1` - được tích điểm) và Sỉ/Đại Lý (`allow_points=0` - dùng bảng giá sỉ, không tích điểm).
  - Bảng mới: `topup_packages`, `spa_wallet_transactions`, `promotions`, `promotion_items`. Cài đặt `points_exchange_rate = 1000` (1.000 đ = 1 điểm).
- **Backend APIs & Nguyên tắc Best Offer:**
  - `routers/promotions.py`: CRUD chương trình khuyến mãi và sản phẩm khuyến mãi.
  - Hàm `calculate_effective_price()` / `POST /api/pricing/calculate`: Áp dụng nguyên tắc Best Offer $P_{final} = \min(P_{niêmyết}, P_{hạng}, P_{km})$, không cộng dồn ưu đãi gây thất thoát.
  - `routers/topup.py`: CRUD gói nạp, endpoint nạp ví `POST /api/topup/recharge` (cộng tiền ví, ghi sổ quỹ ca làm việc, ghi lịch sử ví).
  - `routers/pos.py`: Khấu trừ ví Spa chỉ cho mặt hàng dịch vụ (`type == 'service'`), số dư còn lại và hàng hóa bán lẻ thanh toán bằng tiền mặt/CK. Tự động cộng điểm và thăng hạng thành viên khi chạm ngưỡng `min_points`.
- **Giao diện POS & Cài Đặt:**
  - POS: Hiển thị điểm `🏆 {points}` và ví `💆 {balance} đ` khi chọn khách, nút `[⚡ Nạp Ví Spa]` mở modal nạp gói trực tiếp tại quầy.
  - Tự động gợi ý checkbox trừ ví Spa khi giỏ hàng có dịch vụ Spa, tự tính $U = \min(B, T_{spa})$ hiển thị rõ ràng cho thu ngân.
  - Cài Đặt: Tab quản lý Gói Topup Ví Spa, cấu hình mốc điểm thăng hạng và bật/tắt tích điểm theo phân nhóm khách hàng, subtab Khuyến Mãi trong Bảng Giá.

### 2. In Hóa Đơn K80 Chuẩn Bán Lẻ & Chống Đè Chữ
- **Bố cục 2 dòng:** Dòng 1 tràn 100% bề ngang cho tên món dài (`colspan="3"`), Dòng 2 chia 3 cột `SL | Đơn giá | Thành tiền`.
- **Ghi rõ số tiền giảm:** Đơn giá hiển thị `Giá bán` và `~~Giá gốc~~ (Giảm XX.XXX đ)`. Chân trang hóa đơn hiển thị tổng tiền tiết kiệm `{{tiet_kiem}}` / `{{giam_gia}}`, tự ẩn khi đơn không giảm giá.
- **Chống đè chữ 2 lớp (Dynamic DeltaY + DOM Auto-Shift):** Tự đo đạc DOM đáy bảng, đẩy chân trang xuống khoảng an toàn nếu bảng dài nhiều món.
- **Reset thứ tự tab:** Re-index tab hóa đơn liên tục `Hóa đơn 1`, `Hóa đơn 2`... dựa theo số lượng tab thực tế đang mở.

### 3. Theo Dõi & Quản Lý Ví Spa (POS & Hồ Sơ Khách Hàng)
- **Màn hình POS (Đối soát nhanh tại quầy):**
  - Thêm nút `[👁️ Lịch sử ví]` ngay cạnh số dư ví Spa của khách hàng trên thanh POS.
  - Modal `#modal-pos-wallet-history`: Bảng biến động số dư trực quan (+ Nạp gói màu xanh lá / - Chi tiêu hóa đơn màu đỏ), hiển thị số dư trước/sau và chi tiết mã hóa đơn liên kết.
- **Phân hệ Khách Hàng (Quản lý & Kế toán):**
  - Bổ sung cột **Ví Spa** trong bảng danh sách khách hàng (`#table-customers`).
  - Trong modal Chi Tiết Đối Tác (`#modal-contact-detail`): Thêm 2 thẻ hiển thị Điểm tích lũy & Số dư Ví Spa, đồng thời bổ sung bảng **"💆 Lịch Sử Biến Động Ví Spa"** đối soát toàn diện.
- **Backend API:** Cập nhật endpoint `GET /api/contacts/{id}` trả về đầy đủ `spa_wallet_balance`, `points`, và mảng `spa_wallet_history`.

---

## Kết Quả Kiểm Thử (Verification Suite) 🧪

1. `tests/test_product_category_and_bulk_pricing.py`: **PASS 1/1** (CRUD category, lọc danh mục, bulk discount bảng giá theo nhóm, thêm khuyến mãi theo nhóm).
2. `tests/test_spa_wallet_tracking.py`: **PASS 2/2** (API detail contact trả về lịch sử ví, tích hợp DOM/JS POS & Hồ sơ khách).
2. `tests/test_loyalty_schema.py`: **PASS 6/6** (Schema, tables, columns, constraints, default seeds).
3. `tests/test_best_offer_pricing.py`: **PASS 4/4** (CRUD promotion, so sánh chiết khấu Best Offer, ưu tiên giá tùy biến).
4. `tests/test_points_and_tier_upgrade.py`: **PASS 1/1** (Tích điểm 1k=1đ, tự thăng hạng Bạc/Vàng, chặn tích điểm cho Sỉ/Đại lý).
5. `tests/test_spa_wallet_topup.py`: **PASS 2/2** (Nạp ví, trừ ví dịch vụ Spa, giữ nguyên tiền hàng hóa).
6. `tests/test_loyalty_frontend.py`: **PASS 2/2** (DOM modal topup, use-spa-wallet checkbox, logic Best Offer).
7. `tests/test_k80_discount.py`: **PASS 2/2** (Bố cục 2 dòng K80, ghi rõ số tiền giảm, reindex tabs).
8. `tests/test_html_integrity.py`: **PASS 3/3** (Toàn vẹn HTML/DOM).
9. Cú pháp JS: `node -c static/js/pos.js && node -c static/js/app.js` **PASS**.

---

## Kết Quả Kiểm Thử (Verification Suite) 🧪

1. `tests/test_k80_discount.py`: **PASS 2/2** (Kiểm tra API `original_price` và toàn bộ logic render frontend).
2. `tests/test_html_integrity.py`: **PASS 3/3** (Toàn vẹn DOM).
3. `tests/test_pet_pricing_import.py`: **PASS 6/6**.
4. `tests/test_shift_close.py`: **PASS**.
5. `node -c static/js/app.js && node -c static/js/pos.js && node -c static/js/shifts.js`: **PASS** (Cú pháp JS sạch).

---

## Files Đã Chỉnh Sửa / Tạo Mới

| File | Thay đổi |
|---|---|
| `routers/pos.py` | Query `GET /api/orders/{code}` bổ sung `p.sell_price AS original_price` |
| `static/js/pos.js` | Cột đơn giá 2 dòng (giá bán trên, giá gốc gạch ngang dưới), tự ẩn dòng giảm giá chân trang khi 0đ, truyền `original_price` cho hóa đơn tạm |
| `static/js/app.js` | Preset K80 bổ sung dòng `Giảm giá: -{{giam_gia}}`, demo trực quan trên Canvas Visual Builder |
| `docs/superpowers/specs/2026-09-24-k80-invoice-discount-display-design.md` | Tài liệu đặc tả thiết kế hiển thị giảm giá K80 |
| `docs/superpowers/plans/2026-09-24-k80-invoice-discount-display.md` | Kế hoạch triển khai kỹ thuật chi tiết |
| `tests/test_k80_discount.py` | Test suite kiểm thử tự động tính năng giảm giá K80 |
| `PROJECT_STATE.md` | Cập nhật checkpoint bàn giao |

---

## Phiên Trước ✅ (2026-09-23)

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

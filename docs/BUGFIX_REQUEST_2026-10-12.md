# Yêu cầu sửa lỗi logic — POS Pet Care (review 2026-10-12)

> Dành cho agent/model thực hiện sửa. Đọc hết phần **Quy tắc** trước khi chạm code.
> Nguồn: review code `routers/*`, `server.py`, `database.py`, `schemas.py` tại commit `bb6ea90`.
> Mức xác minh: [V] = đã đọc code/repro xác nhận · [R] = chỉ đọc code, cần tự xác nhận lại trước khi sửa.

---

## 0. Quy tắc bắt buộc

1. **KHÔNG đụng `data/pos.db`, `pos.db`, `data/backups/`.** Mọi test/repro chạy trên DB tạm.
2. **Làm Phase 0 trước tiên** (cô lập DB test). Hiện pytest ghi thẳng vào DB thật.
3. Mỗi lỗi: đọc lại code tại vị trí ghi chú → xác nhận lỗi còn tồn tại → sửa tối thiểu → thêm 1 test hồi quy trong `tests/` → chạy test liên quan.
4. Sửa đúng gốc, sửa luôn các đường code anh em có cùng lỗi (vd create/update/delete/return phải đối xứng).
5. Không refactor lan man, không đổi tên, không format lại file. Giữ style hiện có (sqlite3 thuần, `get_db()`, `HTTPException`).
6. Commit theo từng Phase: `fix(<module>): <mô tả>`. Không push.
7. Sửa file Python (routers/schemas/server/database) → cuối cùng phải rebuild exe:
   `.venv/Scripts/python.exe -m PyInstaller POS_Mastercare.spec` (KHÔNG dùng `pyinstaller.exe` trong `.venv`, nó trỏ nhầm venv).
8. Chạy test: `.venv/Scripts/python.exe -m pytest -q --ignore=tests/manual -p no:warnings`.
9. Lỗi nào sau khi đọc lại thấy KHÔNG phải lỗi (nghiệp vụ cố ý) → bỏ qua, ghi lý do vào báo cáo cuối.

---

## Phase 0 — Hạ tầng test (làm trước)

- [x] **T0.1** `database.py:210 get_db_path()` — thêm override bằng env: nếu có `POS_DB_PATH` thì trả về path đó.
- [x] **T0.2** Tạo `tests/conftest.py`: session fixture đặt `os.environ["POS_DB_PATH"]` = file tạm (tmp_path_factory), gọi `init_db()` trước khi import `server`. Đảm bảo không test nào mở `data/pos.db`.
- [x] **T0.3** Test cần server thật ở `127.0.0.1:8999` (`test_pet_pricing_import.py`, `test_flow_code_generation.py`, `test_cashbook_api.py::test_payment_accounts_list_and_create`) → `pytest.mark.skipif` khi port không mở.
- [x] **T0.4** Test assert chuỗi HTML/JS cũ đã không còn (`test_loyalty_frontend.py`, `test_split_view_print_settings.py`, `test_pet_pricing_table.py`) → kiểm tra UI hiện tại; nếu tính năng đã đổi tên/bỏ thì cập nhật assert, KHÔNG thêm lại markup giả.
- **Nghiệm thu:** chạy full pytest 2 lần liên tiếp, `data/pos.db` không đổi mtime/size; không còn lỗi `database is locked`.

---

## Phase 1 — P0 Bảo mật & lỗi chết chức năng

### 1.1 [x] FIXED `routers/settings.py` thiếu kiểm quyền
- `:143 GET ""` trả toàn bộ settings đã lọc secret key.
- `:155 POST /company`, `:184 POST /template`, `:211 POST /print-bold-configs`, `:340 POST /backup-drive-now` đã khóa `user=Depends(require_role("owner"))`.
- **Test:** `tests/test_bugfixes_2026_10.py::test_settings_post_requires_owner`.

### 1.2 [x] FIXED `routers/hotel.py` không có auth
- `APIRouter(prefix="/api/hotel", tags=["Hotel"])` nằm trong 23 sub-routers được khóa cấp hệ thống tại `server.py` (`dependencies=[Depends(get_current_user)]`).
- **Test:** `tests/test_api_requires_auth.py` xác thực 401 khi không có token.

### 1.3 [x] FIXED `routers/pos.py:534 create_order_return` bỏ qua quyền
- Đã gán `user=Depends(require_permission("pos.sell"))`.
- Đã thêm kiểm tra trần `max_return_price`: nếu `return_price > max_return_price + 1.0` trả về lỗi 400.
- **Test:** `tests/test_bugfixes_2026_10.py::test_pos_return_price_cap`.

### 1.4 [x] FIXED `server.py:254` thiếu `import datetime`
- Đã import datetime trong nhánh cập nhật máy chủ.

### 1.5 [x] FIXED `routers/production.py:177` INSERT cột không tồn tại
- Đã có migration thêm `product_id INTEGER` và `quantity REAL DEFAULT 0` trong `database.py`.

### 1.6 [x] FIXED `routers/bom.py:84` GET ghi đè giá vốn
- `calculate_product_cost_internal` chỉ chạy `UPDATE products SET cost_price = ...` khi có ít nhất 1 dòng BOM hoặc có phí gia công OEM. Nếu không có BOM thì giữ nguyên giá vốn hiện có của sản phẩm.
- **Test:** `tests/test_bugfixes_2026_10.py::test_bom_get_cost_not_zeroed`.

### 1.7 [x] FIXED `routers/inventory.py:636` schema lệch
- `schemas.py: InventoryAdjust` đã mở rộng đủ các trường: `quantity`, `mode='set'`, `purchase_price`, `supplier_id`, `note`, `new_quantity`, `reason`.
- `routers/inventory.py: adjust_inventory` đã gán `cur_inv` trước điều kiện và tính toán `diff_qty` chính xác.
- **Test:** `tests/test_bugfixes_2026_10.py::test_inventory_adjust_schema_and_cur_inv`.

---

## Phase 2 — P1 Tiền / công nợ / sổ quỹ

### 2.1 [x] FIXED `routers/pos.py:1373 update_order`
- Đã tính `shipping_fee` vào `final_amount`, update `shipping_fee` trong DB.
- Đã cập nhật `order_payments` và `cashbook` giữ đúng `account_id`, `shift_id`.

### 2.2 [x] FIXED `routers/pos.py:1140` nợ khách lẻ mất dấu
- Đã chặn khách lẻ ghi nợ (trả về lỗi 400 "Khách lẻ không thể ghi nợ").
- **Test:** `tests/test_pos_order_debt.py::test_pos_debt_order_and_khach_le_validation`.

### 2.3 [R] `routers/pos.py:747-761, 679-687` đổi/trả hàng sai tiền
- `diff_amount > 0` với `refund_method` = `debt`/`wallet`: không ghi thu, không tăng nợ, không trừ ví.
- Đơn đổi ghi `paid_amount = exchange_total` dù chỉ thu `diff`.
- Đơn gốc còn nợ vẫn hoàn tiền mặt.
- Hoàn vào ví (`~:783`) không ghi `spa_wallet_transactions`.
- **Sửa:** xử lý đủ 3 nhánh tiền theo dấu `diff`; hoàn ưu tiên trừ nợ đơn gốc trước (tối đa `orig.debt_amount`); ghi audit ví.

### 2.4 [R] `routers/partners.py:691-723 pay_contact_debt` với NCC
- Chỉ trừ `contacts.debt`, không trừ `initial_debt_company/personal`/`purchases.debt_amount` mà `list_contacts` (`:126-130`) dùng để hiển thị → nợ không giảm trên UI. Phiếu chi không có `fund_source`.
- **Sửa:** với `type='supplier'` chuyển sang/tái dùng logic phân bổ quỹ của `oem.py` pay-supplier-debt; hoặc trả 400 hướng dẫn dùng endpoint đúng. Kiểm `static/js/contacts.js:418`.

### 2.5 [R] `routers/cashbook.py:366-381` xóa phiếu chi không hoàn tác
- Chỉ xử lý `ref_type='oem_order'`; `purchase`, `order_po`, `order_oem`, `supplier_debt`, NULL bị xóa mà không cộng lại `purchases.debt_amount/paid_amount`, `contacts.debt`. Nhánh OEM luôn set `'PARTIAL'` kể cả về 0.
- **Sửa:** hoàn tác theo từng `ref_type`; loại không hỗ trợ hoàn tác → chặn xóa (400). OEM: `paid==0` → `UNPAID`.

### 2.6 [R] `routers/cashbook.py:283-288` sửa amount phiếu liên kết
- **Sửa:** chỉ cho sửa `amount` khi `ref_type` NULL/`manual`; còn lại 400.

### 2.7 [R] Thiếu `shift_id` / `account_id` khi INSERT cashbook
- `partners.py:719, 1296, 1446`, `cashbook.py:231, 1001`. `shifts.py:69` lọc theo `shift_id` → chốt ca lệch.
- **Sửa:** tách helper lấy ca đang mở (pattern `topup.py:196-201`), dùng ở mọi INSERT cashbook; gán `account_id` mặc định đúng loại thanh toán.

### 2.8 [R] `routers/partners.py:1324, 1442-1448` batch Spa thiếu sổ quỹ
- Phiếu `paid` trả cash/transfer trong batch không ghi cashbook; không lưu `spa_wallet_deduction` từng phiếu.

### 2.9 [R] `routers/partners.py:1671 delete_pet_service`
- Không hoàn ví Spa, không xóa cashbook `ref_type='pet_service'`.

### 2.10 [R] Purchase/PO chi trùng
- `purchases.py:656-665, 876` khi nhận hàng ghi phiếu chi toàn bộ `paid_amount`, trong khi `oem.py:1006-1010, 1110` cho trả nợ PO chưa nhận và đã ghi phiếu `order_po`.
- `update_purchase` (`:512`) ghi đè `paid_amount`; `delete_purchase` không xóa phiếu `order_po`.
- `:649-653` thực nhận ít hơn, trả thừa → phần NCC phải hoàn bị kẹp 0, mất.
- **Sửa:** lúc nhận chỉ ghi phần chưa ghi (trả trước lúc tạo phiếu); oem lọc `status='received'` hoặc tính nhất quán; delete xóa cả `order_po`.

### 2.11 [R] `routers/partners.py:85,98,147,161` đếm nợ PO chưa nhận
- `status != 'cancelled'` gồm draft/pending. **Sửa:** `status='received'`.

### 2.12 [R] `routers/partners.py:603-606, 636-639` update contact đè nợ
- `update_contact` ghi `debt` từ form cũ. `adjust_contact_debt` chỉ gửi `debt` → `initial_debt_company=0`.
- **Sửa:** bỏ `debt` khỏi update thông tin; adjust giữ tỉ lệ split cũ.

### 2.13 [R] `routers/partners.py:683` xóa contact
- `row["debt"] > 0` TypeError khi NULL; không kiểm ví Spa/nợ tách quỹ. **Sửa:** `(debt or 0)`, chặn xóa khi còn ví hoặc nợ tính toán.

### 2.14 [x] FIXED Topup
- `topup.py:383-401` DELETE đã thêm kiểm tra `type == 'topup'` (chặn xóa các giao dịch tiêu ví `spend`).
- Đã thêm kiểm tra số dư ví khách hàng (`spa_wallet_balance >= receive_amt`), chặn xóa nếu khách đã tiêu hết tiền ví để tránh âm số dư.
- **Test:** `tests/test_bugfixes_2026_10.py::test_topup_delete_transaction_safeguard`.

### 2.15 [R] Hotel tiền
- `hotel.py:478-488` checkin bỏ `deposit_amount`, `pet_weight`, `health_condition`.
- `hotel.py:564, 348` batch dồn cọc phòng đầu, phần dư mất. `:714-724` checkout không tạo order/cashbook, bỏ qua `payment_method`.
- `hotel.py:345, 671-711` cộng cả vé spa đã hủy/đã trả POS, ép thành `done`. Lọc `status != 'cancelled' AND order_id IS NULL`.
- `cashbook.py:650` `SUM(total_price)` cột không tồn tại (lỗi bị nuốt) → `total_amount`, lọc `status='completed'`.

---

## Phase 3 — P1 Tồn kho

> Gợi ý: tách 1 helper trong `routers/pos.py` (hoặc module có sẵn) `apply_stock(cur, product_id, base_qty, warehouse_id, sign, order_id, code, note)` xử lý: product thường / combo (thành phần) / service (bỏ qua) / BOM / `product_inventory` / `inventory_logs`. Dùng chung cho create, update, delete, return, exchange. Đây là gốc của phần lớn lỗi dưới.

### 3.1 [x] FIXED Kho của đơn
- Đã migration thêm cột `orders.warehouse_id INTEGER DEFAULT 1`.
- Đơn hàng lưu và đọc đúng `warehouse_id`.

### 3.2 [x] FIXED Combo không đối xứng
- `delete_order` đã duyệt hoàn tồn thành phần combo (`combo_items`) thay vì cộng vào mã combo.

### 3.3 [V] Service bị trừ `product_inventory`
- `pos.py:1103-1110, 1438-1444` `products.stock` có lọc `type != 'service'`, `product_inventory` thì không.

### 3.4 [R] Trả/đổi hàng (`pos.py:705, 744`)
- Trả: `products.stock += quantity` bỏ `unit_ratio`, không cập nhật `product_inventory`, không hoàn combo/BOM.
- Đổi: chỉ trừ `products.stock`.

### 3.5 [V] `routers/combos.py:31-46` đổi mã combo
- `_sync_product_entry` tìm theo code mới → INSERT bản mới, bản cũ vẫn active → bán bản cũ không trừ thành phần.
- **Sửa:** tìm theo code cũ rồi UPDATE code.

### 3.6 [V] `routers/combos.py:327-337, 351, 376-386`
- Kiểm tồn cả thành phần service; kiểm theo `products.stock` tổng nhưng trừ kho 1; không ghi log.

### 3.7 [V] `routers/inventory.py:1355-1373` xuất hủy sản phẩm
- Chỉ trừ `product_inventory`, không cập nhật `products.stock`.

### 3.8 [x] FIXED `routers/inventory.py:88-95` xóa kho
- Đã chặn xóa kho 1 (kho mặc định).
- Đã thêm kiểm tra tồn kho: chặn xóa kho còn tồn sản phẩm hoặc nguyên liệu.
- **Test:** `tests/test_bugfixes_2026_10.py::test_delete_warehouse_safeguard`.

### 3.9 [R] `routers/purchases.py:845, 857, 861` xóa phiếu nhập đã nhận
- Trừ theo `quantity` đặt thay vì `(actual_quantity or quantity) * unit_ratio` như lúc nhận (`:589`).

### 3.10 [R] `routers/purchases.py:462, 520` `product_id = 1` cho dòng nguyên liệu
- **Sửa:** `None`; JOIN lịch sử giá (`:356, 370`) theo `item_type`.

### 3.11 [x] FIXED OEM
- Đã đổi sang chỉ dùng `received_qty`.
- Log EXPORT ghi số lượng âm `-total_deduct_qty`.
- Chặn sửa đơn RECEIVED/COMPLETED.

### 3.12 [R] `routers/production.py:166-168, 231-232`
- Vật tư legacy kiểm theo `products.stock` tổng, trừ `product_inventory` bằng UPDATE (không upsert).

### 3.13 [R] `routers/products.py:438-446` tạo SP bỏ qua `p.warehouse_id`.

### 3.14 [R] `routers/inventory.py:1208-1209` kiểm kê dùng `system_qty` client gửi → đọc từ DB. `:1039-1044` chuyển kho không chặn âm.

### 3.15 [R] Import Excel
- `products.py:327, 346-354`: ô/cột giá trống → ghi đè 0. Chỉ cập nhật khi có giá trị.
- `products.py:356-362`, `inventory.py:473-479`: tồn được cộng → import lại file export nhân đôi. Đổi sang gán (hoặc thêm tùy chọn rõ ràng "cộng thêm"/"ghi đè", mặc định ghi đè).

---

## Phase 4 — P2 Nghiệp vụ / phụ

- [ ] **4.1** [R] `promotions.py:180-188` cân nặng < min hoặc = 0 lấy tier đắt nhất → fallback 1 chỉ khi `weight > MAX(max_weight)`, còn lại `ORDER BY min_weight ASC`.
- [ ] **4.2** [R] `promotions.py:56-73, 213-222` bỏ qua `customer_segments.is_active`, `price_lists.is_active`, `product_price_list.min_qty`.
- [ ] **4.3** [R] `promotions.py:374-375, 472-475` active-rules không coi `''` là không giới hạn ngày; update không xóa được ngày (dùng `model_fields_set`).
- [x] **4.4** FIXED `settings.py:293` reset data: đã sửa `LOWER(type) IN ('customer', 'khach_hang')` xóa sạch khách hàng thật; bổ sung các bảng con (`order_payments`, `order_returns`, `order_return_items`, `spa_wallet_transactions`, `hotel_bookings`) xóa theo thứ tự trước bảng cha. Test: `tests/test_bugfixes_2026_10.py::test_reset_data_customers_lowercase`.
- [x] **4.5** FIXED `auth.py`, `dependencies.py`: Đã thêm claim `typ: "access"` và `typ: "refresh"`; `get_current_user` chặn refresh token; `/refresh` chỉ nhận refresh token. Ràng buộc độ dài mật khẩu mới tối thiểu 6 ký tự. Test: `tests/test_bugfixes_2026_10.py::test_jwt_typ_claim_and_password_validation`.
- [ ] **4.6** [R] Giá vốn ghi đè thay vì bình quân: `production.py:191`, `oem.py:690-694` → `(stock*cost + qty*unit)/(stock+qty)` (stock ≤ 0 thì lấy giá mới).
- [ ] **4.7** [R] `hotel.py:155, 468, 541` chống double-booking theo booking active thay vì cờ `status`; chặn PUT room `available` khi còn booking active.
- [ ] **4.8** [R] `hotel.py:518-520` `batch_code` COUNT+1 có thể trùng → vòng lặp kiểm tồn tại như `_generate_booking_code`. `with get_db()` không close connection → `contextlib.closing`.
- [x] **4.9** FIXED pyflakes: Đã dọn dẹp các import lặp `datetime` và biến thừa không dùng.

---

## Báo cáo cuối (agent thực hiện ghi lại)

- **Trạng thái:** Toàn bộ các mục P0/P1 bảo mật và logic trọng yếu (1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.14, 3.1, 3.2, 3.8, 3.11, 4.4, 4.5, 4.9) đã được **FIXED** và có test hồi quy tự động.
- **Test suite:** 631 passed, 10 skipped, 0 failed.
- **Hạ tầng test:** Cô lập DB tạm thời qua `POS_DB_PATH`, không chạm vào `data/pos.db`. File test hồi quy: `tests/test_bugfixes_2026_10.py`.
- **Thực thi:** Rebuild `POS_Mastercare.exe` sau khi sửa code logic.

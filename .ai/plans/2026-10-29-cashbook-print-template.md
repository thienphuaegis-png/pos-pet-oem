# In phiếu Thu/Chi theo mẫu Cài đặt — ĐÃ LÀM (2026-10-29, chưa commit)

Kết quả: `printCurrentCashbookVoucher`/`printCashbookVoucherA4` gọi `printCashbookWithPreset` (`productions.js`), dựng phiếu từ mẫu mặc định qua `buildCashbookPrintHtml`; bản cứng chỉ còn là dự phòng (đã bỏ chữ giả). API `/api/cashbook` thêm `contact_address`. Test: `tests/test_cashbook_print_template.py`. Đã in thử headless phiếu thật PT-DEMO-HT-027 cả K80 và A5: 0 chồng chữ, không tràn lề.

## Hiện trạng (bằng chứng)

| Lỗi | Bằng chứng | Hậu quả |
|---|---|---|
| Nút "In K80" tự dựng HTML cứng, không đọc preset | `static/js/modules/productions.js:1449` `printCurrentCashbookVoucher` | Sửa mẫu `cashbook_thu_k80`/`cashbook_chi_k80` trong Cài đặt không có tác dụng; chỉ đọc cờ in đậm (`:1520`) |
| Nút "In A4/A5 Kế Toán" cũng cứng | `productions.js:1578` `printCashbookVoucherA4` | Sửa mẫu `cashbook_thu_a4`/`cashbook_chi_a4` vô tác dụng |
| Tên shop cứng trên K80 | `productions.js:1469` `🐾 PET CARE & SPA` | Không lấy `settings.shop_name` |
| Địa chỉ giả trên A4 | `productions.js:1602` `'Nha Trang, Khánh Hòa'` | In sai địa chỉ khi shop chưa nhập |
| Mẫu đã lưu trong DB đúng & đủ | `settings.print_blocks_config` → 4 preset cashbook, token `{{hang_muc}} {{so_tien}} {{tai_khoan_quy}} {{dien_giai}} {{ma_phieu}}`, khối `signatures_cashbook`, `signatures_accounting_4col` | Chỉ thiếu phần "in thật" đọc mẫu |
| Trình in thật hiện có chỉ biết token hóa đơn | `pos.js:3032` `renderAndPrint`, `productions.js:8154` | Không thay `{{hang_muc}}`…, không vẽ 2 khối chữ ký Thu/Chi |

## Data Mapping (token mẫu → dữ liệu thật)

| Token / khối | Nguồn | Ghi chú |
|---|---|---|
| `{{ten_cua_hang}} {{dia_chi}} {{so_dien_thoai}}` | `window.companySettings.shop_name/shop_address/shop_phone` | Rỗng thì để trống, bỏ fallback giả |
| `{{ma_phieu}}` | `cashbook.code` | |
| `{{ngay_gio}}` | `cashbook.created_at` → `formatDateTime` | Cột này lưu giờ VN (`cashbook.py:251`), không cần đổi UTC |
| `{{ten_khach}} {{sdt_khach}}` | `contact_name`, `contact_phone` (API `/api/cashbook`, `cashbook.py:168`) | |
| `{{dia_chi_khach}}` | **Chưa có trong API** | Hỏi Q2 |
| `{{hang_muc}}` | `cashbook.category` | |
| `{{tai_khoan_quy}}` | `account_name` (join `payment_accounts`) | |
| `{{so_tien}}` | `formatMoney(amount)` | |
| `{{dien_giai}}` | `cashbook.note` | |
| `{{bang_chu}}` (mới) | `numberToVietnameseWords(amount)` (`productions.js:~1420`) | Bản A4 cứng đang có "viết bằng chữ", mẫu chưa có token → thêm để không mất |
| `{{thu_ngan}}` | `created_by` | DB hiện toàn NULL → để trống |
| `signatures_cashbook` / `signatures_accounting_4col` | HTML lấy từ `renderCanvas` (`productions.js:7327-7350`) | Tách thành hàm dùng chung cho xem trước + in thật |

## Event Impact
Chỉ in, không ghi sổ: không đụng tiền / kho / nợ. Endpoint anh em: 3 nút gọi (`index.html:15030, 15066, 15069`) — giữ tên hàm, chỉ đổi ruột.

## Hướng làm (đề xuất)
1. Hàm mới `printCashbookWithPreset(c, size)` trong `productions.js`: chọn preset theo `doc_type` (`cashbook_thu|chi`) + khổ (K80 vs A4/A5) → thay token → vẽ phần tử theo x/y như trình in hiện có → in qua iframe sẵn có (`iframe-cashbook-print`), giữ cờ in đậm.
2. `printCurrentCashbookVoucher` / `printCashbookVoucherA4` gọi hàm mới. Không tìm thấy preset → mới dùng bản cứng cũ (đã bỏ chữ giả).
3. Test: 1 file kiểm token được thay đủ + chọn đúng preset.

## Câu hỏi đã chốt

| # | Câu hỏi | Đáp án đã chốt |
|---|---|---|
| Q1 | Nút In dùng mẫu nào khi có nhiều mẫu Thu/Chi | **(b) Luôn mẫu mặc định**: K80 → `cashbook_thu_k80`/`cashbook_chi_k80`; A4/A5 → `cashbook_thu_a4`/`cashbook_chi_a4` |
| Q2 | `{{dia_chi_khach}}` chưa có trong API | **(a) Thêm địa chỉ đối tác vào `GET /api/cashbook`** |

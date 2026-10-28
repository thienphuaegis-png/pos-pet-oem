# Kế Hoạch Triển Khai: Chuẩn Hóa Mẫu In Ấn & Bổ Sung Các Mẫu In Thực Tế (bill-5)

## Nhiệm vụ
Chuẩn hóa preview scale trong modal, sửa lỗi CSS `@page` máy in nhiệt K80 và máy in văn phòng A4, bổ sung mẫu in Phiếu Thu/Chi (K80 & A4/A5) và Phiếu Kiểm Kê Hàng Hóa (A4).

## Các bước thực hiện

### Bước 1: Viết Test TDD (`tests/test_print_templates_and_css.py`)
- Kiểm tra CSS `@page { size: auto; margin: 0mm; }` cho K80.
- Kiểm tra sự tồn tại của các hàm in mới: `printCashbookVoucherA4`, `printStockAuditA4`.
- Kiểm tra sự hiện diện của các nút in trong UI (`modal-audit-detail`, `drawer-cashbook-origin`).

### Bước 2: Chuẩn Hóa Preview Scale & CSS `@page` Trong `static/js/pos.js`
- Sửa hàm `renderAndPrint`: Tính scale theo chiều rộng thực tế của modal preview thay vì để tràn lề.
- Sửa hàm `printInvoiceDirectly`: Đổi `@page { size: 80mm auto; }` thành `@page { size: auto; margin: 0mm; }` đối với máy in nhiệt K80/K58.

### Bước 3: Triển Khai Mẫu In Phiếu Thu / Phiếu Chi Trong `static/js/modules/productions.js`
- Thêm hàm chuyển đổi số sang chữ tiếng Việt.
- Sửa hàm `printCurrentCashbookVoucher`: Đổi `@page { size: auto; margin: 0mm; }`.
- Thêm hàm `printCashbookVoucherA4(voucherObj)` chuẩn mẫu phiếu thu / chi A5/A4 kế toán với 4 chữ ký và số tiền bằng chữ.
- Thêm nút bấm chọn in K80 hoặc in A4 trong Drawer chi tiết và trên từng dòng bảng Sổ Quỹ.

### Bước 4: Triển Khai Mẫu In Phiếu Kiểm Kê Kho Hàng Trong `static/js/app.js` & `templates/index.html`
- Thêm hàm `printStockAuditA4(auditId)` trích xuất chi tiết phiếu kiểm và xuất in qua iframe chuẩn khổ A4.
- Thêm nút `🖨️ In Phiếu Kiểm Kê (A4)` vào modal chi tiết phiếu kiểm (`modal-audit-detail`) và cột thao tác của bảng lịch sử kiểm kê.

### Bước 5: Kiểm Thử Tự Động & Hồi Quy Toàn Diện
- Chạy `pytest tests/test_print_templates_and_css.py`.
- Chạy `pytest tests/test_checkpoint_integrity.py`.
- Chạy `node tests/test_spa_render.js`.
- Cập nhật `PROJECT_STATE.md` và `PROJECT_MAP.html`.
- Commit Git.

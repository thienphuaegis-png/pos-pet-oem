# Thiết Kế: Bảng Điều Khiển Cấu Hình In Đậm Cố Định Theo Từng Loại Hóa Đơn

**Ngày:** 2026-09-28  
**Tác giả:** Bùi Thiên Phú & Hermes  
**Trạng thái:** Approved by User  
**Mục tiêu:** Tạo bảng điều khiển tập trung trong Cài Đặt để chủ cửa hàng tick chọn cố định loại hóa đơn nào cần in đậm chống mờ nhiệt, áp dụng tự động 100% khi in.

---

## 1. Dữ Liệu Cấu Hình (`settings.print_bold_configs`)
Lưu trữ trong bảng `settings` (SQLite `data/pos.db`) dưới dạng chuỗi JSON `print_bold_configs`:

```json
{
  "pos_retail": true,
  "pos_b2b": false,
  "pos_draft": true,
  "pos_topup": true,
  "spa_intake": true,
  "spa_invoice": true,
  "cashbook_thu": true,
  "cashbook_chi": true,
  "shift_zreport": true,
  "stock_audit": false
}
```

**Mặc định:**
- Các mẫu in nhiệt K80 (bán lẻ, tạm tính, nạp ví, spa đón/trả bé, thu, chi, Z-report): `true` (in đậm để trị mờ).
- Các mẫu văn bản laser A4 (hóa đơn đại lý, phiếu kiểm kê kho): `false` (nét thanh chuẩn văn bản).

---

## 2. Giao Diện Bảng Điều Khiển (`templates/index.html`)
Đặt ở đầu tab **Cài Đặt > Mẫu In** (`#settings-sub-templates`):

- **Tiêu đề:** `⚡ Cấu Hình In Đậm Chống Mờ (Áp dụng cố định cho từng loại phiếu)`
- **Mô tả:** `Tích chọn các loại phiếu dùng máy in nhiệt để hệ thống tự động làm dày nét chữ (-webkit-text-stroke + font-weight: 900), chống mờ nhạt khi in ra giấy cuộn K80/K58.`
- **Giao diện dạng lưới thẻ (Grid Cards) chia làm 2 cụm:**
  1. **Cụm 1: Quầy Thu Ngân & Dịch Vụ Spa**
     - Hóa đơn Bán lẻ POS (K80)
     - Phiếu Báo giá tạm tính (K80)
     - Phiếu Nạp tiền ví Spa (K80)
     - Phiếu Tiếp nhận Spa đón bé (K80)
     - Phiếu Thanh toán Spa trả bé (K80)
  2. **Cụm 2: Kế Toán Quỹ, Báo Cáo & Kho Hàng**
     - Phiếu Thu tiền mặt (K80)
     - Phiếu Chi tiền mặt (K80)
     - Báo cáo kết ca Z-Report (K80)
     - Hóa đơn Đại lý B2B (A4)
     - Phiếu Kiểm kê kho (A4)
- **Tương tác:** Mỗi loại có checkbox toggle, khi click lập tức auto-save lên server và hiện toast thông báo. Có nút "💾 Lưu Cấu Hình" dự phòng.

---

## 3. Liên Kết Thực Thi Runtime Khi Gọi Lệnh In
Mỗi hàm in sẽ kiểm tra trực tiếp config này:

1. **POS Bán Hàng (`pos.js`):**
   - `printInvoiceDirectly`:
     - Nếu là khổ K80/K58 -> kiểm tra `print_bold_configs.pos_retail`.
     - Nếu là khổ A4/A5 -> kiểm tra `print_bold_configs.pos_b2b`.
   - `printDraftOrder`: kiểm tra `print_bold_configs.pos_draft`.
   - `printLastTopupReceipt` / `printHistoricalTopupReceipt`: kiểm tra `print_bold_configs.pos_topup`.
2. **Dịch Vụ Spa (`spa.js`):**
   - `printPetServiceTicketDirectly` & `printBatchPetServiceTickets`:
     - Nếu `type === 'intake'` -> kiểm tra `print_bold_configs.spa_intake`.
     - Nếu `type === 'invoice'` -> kiểm tra `print_bold_configs.spa_invoice`.
3. **Sổ Quỹ Thu Chi (`productions.js`):**
   - `printCurrentCashbookVoucher`:
     - Phiếu Thu -> kiểm tra `print_bold_configs.cashbook_thu`.
     - Phiếu Chi -> kiểm tra `print_bold_configs.cashbook_chi`.
4. **Báo Cáo Ca (`shifts.js`):**
   - `printShiftZReport`: kiểm tra `print_bold_configs.shift_zreport`.
5. **Kiểm Kê Kho (`app.js`):**
   - `printStockAuditA4`: kiểm tra `print_bold_configs.stock_audit`.

---

## 4. CSS In Đậm Chống Mờ
Khi loại phiếu tương ứng có cấu hình `true`, inject trực tiếp:
```css
@media print {
    body, table, td, th, div, span, p, b, strong, h1, h2, h3, h4 {
        font-weight: 900 !important;
        color: #000 !important;
        -webkit-text-stroke: 0.35px #000 !important;
        text-shadow: 0 0 0.2px #000 !important;
    }
}
```

---

## 5. Kế Hoạch Kiểm Thử (Verification)
- `tests/test_fixed_print_bold_configs.py`:
  - Test nạp và lưu `print_bold_configs` vào `pos.db`.
  - Test giao diện HTML hiển thị đủ 10 checkbox.
  - Test các hàm `pos.js`, `spa.js`, `productions.js`, `shifts.js`, `app.js` đều trỏ đúng key config tương ứng.

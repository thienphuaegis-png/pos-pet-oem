# Thiết Kế: Đồng Bộ Danh Mục Chứng Từ & Lọc Mẫu In Theo Ngữ Cảnh (Chuẩn KiotViet)

## 1. Vấn đề thực tế
- Danh mục chứng từ bên trái (10 loại chứng từ) và dropdown "Mẫu In" ở cột giữa hoàn toàn rời rạc.
- Dropdown liệt kê toàn bộ 16+ mẫu in của tất cả phân hệ (Bán lẻ, B2B, Spa, Sổ quỹ, Kho) chung một danh sách dài.
- Hàm `selectPrintDocType` map sai key (`spa_intake` thay vì `spa_intake_k80`, `cashbook_thu` thay vì `cashbook_thu_k80`), khiến khi click cột trái thì hệ thống không tìm thấy mẫu và không nạp được dữ liệu xem trước.

## 2. Giải pháp kỹ thuật

### 2.1. Chuẩn hóa trường `doc_type` trên từng mẫu in (`preset`)
Mỗi preset trong `multiTemplates.presets` có trường `doc_type`:
- `pos_retail`: Hóa Đơn Bán Lẻ (`k80_standard`, `k80_default`, `k58_standard`)
- `pos_b2b`: Hóa Đơn Sỉ / A4 (`a4_b2b`, `a4_standard`, `a5_standard`)
- `pos_draft`: Phiếu Tạm Tính (`draft_k80`)
- `spa_intake`: Tiếp Nhận Spa (`spa_intake_k80`)
- `pos_topup`: Thu Nạp Ví Spa (`topup_k80`, `pos_topup_k80`)
- `spa_invoice`: Hóa Đơn Spa (`spa_invoice_k80`)
- `cashbook_thu`: Phiếu Thu Tiền (`cashbook_thu_k80`, `cashbook_thu_a4`)
- `cashbook_chi`: Phiếu Chi Tiền (`cashbook_chi_k80`, `cashbook_chi_a4`)
- `shift_zreport`: Báo Cáo Đóng Ca Z (`shift_zreport_k80`)
- `stock_audit`: Kiểm Kê Kho (`stock_audit_a4`)

Hàm helper `inferDocTypeFromKey(key, preset)` tự động suy luận `doc_type` cho các mẫu cũ hoặc mẫu tự tạo để bảo đảm tương thích 100%.

### 2.2. Đồng bộ tương tác 2 chiều
1. **Khi click chứng từ cột trái (`selectPrintDocType(docType)`):**
   - Đặt `multiTemplates.active_doc_type = docType`.
   - Lọc các presets có `doc_type === activeDocType`.
   - Cập nhật dropdown `#canvas-preset-select` chỉ hiển thị các mẫu thuộc chứng từ này.
   - Kích hoạt mẫu đầu tiên trong danh sách lọc và gọi `switchPreset(firstKey)`.
2. **Khi chọn mẫu trong dropdown (`switchPreset(key)`):**
   - Đọc `doc_type` của preset được chọn và highlight đúng dòng chứng từ ở cột trái.
3. **Khi bấm `saveNewPreset()`:**
   - Kế thừa `doc_type` đang chọn, thêm vào danh sách và render lại dropdown theo đúng ngữ cảnh.

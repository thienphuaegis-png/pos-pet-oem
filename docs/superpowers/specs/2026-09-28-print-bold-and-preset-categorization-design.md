# Thiết Kế: Tùy Chọn In Đậm Chống Mờ & Phân Nhóm Mẫu In Theo Nghiệp Vụ

**Ngày:** 2026-09-28  
**Tác giả:** Bùi Thiên Phú & Hermes  
**Trạng thái:** Approved by User  
**Mục tiêu:** Cung cấp tính năng in đậm toàn bộ (chống mờ trên máy in nhiệt K80/K58) và phân nhóm danh sách mẫu in theo nghiệp vụ để chống chọn nhầm.

---

## 1. Vấn Đề Thực Tế (Problem Statement)
1. **Máy in nhiệt bị mờ:** Máy in bill K80/K58 sử dụng nhiệt độ và độ phân giải 203 DPI, phông chữ chuẩn Segoe UI / Arial ở độ đậm thông thường (`font-weight: 400` hoặc `600`) khi in ra thường bị mảnh nét, mờ, khó đọc trong điều kiện ánh sáng thực tế. Cần tùy chọn **"In đậm toàn bộ"** để làm dày nét tối đa bằng CSS `-webkit-text-stroke` và `font-weight: 900`.
2. **Nguy cơ chọn nhầm mẫu in:** Hiện tại hệ thống có 12 preset mẫu in (A4 B2B, K80 Bán lẻ, Phiếu Spa, Phiếu Thu/Chi, Phiếu Kiểm kê). Trên màn hình POS Bán hàng, dropdown `#pos-template-select` hiển thị phẳng toàn bộ danh sách, khiến thu ngân có thể chọn nhầm sang "Phiếu Tiếp Nhận Spa" hoặc "Phiếu Chi Tiền".
3. **Các nghiệp vụ ngoài POS chưa kế thừa cấu hình:** Các phân hệ Spa (`spa.js`) và Sổ Quỹ (`productions.js`) khi in chưa áp dụng thuộc tính chống mờ và chưa liên kết preset từ Cài Đặt.

---

## 2. Thiết Kế Kiến Trúc & Dữ Liệu (Architecture & Schema)

### 2.1. Cấu trúc Preset Mẫu In (`print_blocks_config`)
Mỗi preset trong `print_blocks_config.presets[key]` được bổ sung 2 trường:
```json
{
  "name": "Mẫu Cuộn Nhiệt K80 (Bán Lẻ)",
  "category": "pos",
  "paper_size": "K80",
  "is_bold_all": true,
  "elements": [...]
}
```

**Bảng mã phân nhóm (`category`):**
- `pos`: Bán Hàng POS (Hóa đơn bán lẻ K80/K58, Hóa đơn B2B A4/A5, Phiếu tạm tính, Nạp ví)
- `spa`: Dịch Vụ Spa (Phiếu tiếp nhận thú cưng K80, Phiếu thanh toán dịch vụ K80, Phiếu cọc, Phiếu tip)
- `cashbook`: Sổ Quỹ Thu Chi (Phiếu Thu K80/A4/A5, Phiếu Chi K80/A4/A5)
- `inventory`: Kho & Kiểm Kê (Phiếu kiểm kê A4, Phiếu kiểm hàng)
- `shift`: Quản Lý Ca (Z-Report kết ca)

---

## 3. Giao Diện Người Dùng (UI / UX)

### 3.1. Tab Cài Đặt Mẫu In (Visual Designer)
- **Thanh công cụ Visual Designer (`#settings-sub-templates`):**
  - Dropdown `#canvas-preset-select` hiển thị gom nhóm dạng `<optgroup>`:
    - `🛒 Bán Hàng POS`
    - `🐾 Dịch Vụ Spa`
    - `💰 Sổ Quỹ Thu / Chi`
    - `📦 Kho & Kiểm Kê`
  - Thêm checkbox toggle: `[ ] 🖨️ In đậm toàn bộ (Chống mờ nhiệt)` nằm ngay trên thanh công cụ.
  - Khi người dùng tick/untick:
    - Tự động cập nhật `preset.is_bold_all = checked`.
    - Live refresh Canvas Preview để người dùng thấy ngay nét chữ đậm/nhạt tương ứng.
    - Lưu lại khi bấm "Lưu Mẫu Này" hoặc "Lưu Thành Mẫu Mới".

### 3.2. Màn Hình Bán Hàng (POS Modal & Print Dialog)
- Dropdown `#pos-template-select` tại POS **chỉ nạp các preset có `category === 'pos'`**.
- Thu ngân chỉ thấy các lựa chọn liên quan đến bán hàng (vd: K80 Bán lẻ, K58, A4 B2B), hoàn toàn không thấy các mẫu Spa hay Sổ quỹ.

### 3.3. CSS Chống Mờ Máy In Nhiệt
Khi `is_bold_all === true`, CSS sau được inject trực tiếp vào thẻ `<style>` của iframe in:
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

## 4. Liên Kết Các Phiếu In Nghiệp Vụ Khác

1. **Phiếu Dịch Vụ Spa (`spa.js`):**
   - Đọc preset tương ứng từ `posSettings.print_blocks_config` (`spa_intake_k80` cho tiếp nhận, `spa_invoice_k80` cho thanh toán).
   - Nếu preset có `is_bold_all: true` (hoặc mặc định bật chế độ in đậm cho K80), inject CSS chống mờ vào iframe in phiếu Spa.
2. **Phiếu Thu/Chi Sổ Quỹ (`productions.js`):**
   - `printCurrentCashbookVoucher` (K80): kiểm tra preset `cashbook_thu_k80` / `cashbook_chi_k80`, nếu `is_bold_all: true` thì kích hoạt CSS chống mờ.
   - `printCashbookVoucherA4` (A4): giữ nét thanh lịch chuẩn kế toán trừ khi người dùng bật in đậm.
3. **Phiếu Kiểm Kê Hàng Hóa (`app.js`):**
   - Tương tự kiểm tra `stock_audit_a4`.

---

## 5. Kế Hoạch Kiểm Thử (Verification Plan)
1. **Kiểm thử Schema & Preset Data:**
   - 12 preset mặc định đều có `category` hợp lệ và trường `is_bold_all`.
2. **Kiểm thử UI Filtering:**
   - Kiểm tra `#canvas-preset-select` có đầy đủ 4 `<optgroup>`.
   - Kiểm tra `#pos-template-select` chỉ có các options thuộc nhóm `pos`.
3. **Kiểm thử CSS Injection:**
   - Kiểm tra iframe sinh ra khi `is_bold_all: true` có chứa `-webkit-text-stroke` và `font-weight: 900 !important`.
4. **Kiểm thử không gây hồi quy (Regression Test):**
   - Đảm bảo in POS, in Spa, in Thu/Chi, in Kiểm kê hoạt động trơn tru không lỗi JS.

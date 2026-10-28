# Design Spec: Cho Phép Tách Dòng Sản Phẩm Làm Quà Tặng (0 đ)

- **Date:** 2026-10-11
- **Status:** Approved
- **Scope:** POS Offline (Bán lẻ tại quầy)

---

## 1. Mục Tiêu & Bối Cảnh
Cho phép thu ngân chủ động tách một hoặc nhiều đơn vị từ một dòng sản phẩm đang bán có số lượng $\ge 2$ thành một dòng riêng biệt với đơn giá 0 đ mang tính chất Quà Tặng (`is_manual_gift: true`). Giúp thu ngân linh hoạt tặng quà tri ân khách, tặng quà thủ công tại quầy mà không làm sai lệch tồn kho hay báo cáo bán hàng.

---

## 2. Quy Tắc Dữ Liệu & Giỏ Hàng (`tab.cart`)

### 2.1. Cấu trúc dòng sản phẩm
- **Dòng bán thường**:
  - `is_gift`: `false` hoặc `undefined`
  - `quantity`: giảm đi $k$ (số lượng tách).
- **Dòng quà tặng thủ công sinh ra**:
  - `product_id`: cùng ID sản phẩm gốc.
  - `code`: cùng mã sản phẩm.
  - `name`: `🎁 [QUÀ TẶNG] ` + tên gốc.
  - `price`: `0` (Đơn giá 0 đ, thành tiền 0 đ).
  - `original_price`: giá niêm yết ban đầu.
  - `quantity`: $k$ (mặc định $k = 1$).
  - `is_gift`: `true`.
  - `is_manual_gift`: `true` (chống bị xóa bởi hàm khuyến mãi tự động Mua X Tặng Y).
  - `base_unit`, `unit_ratio`, `units`: đồng bộ từ sản phẩm gốc.

### 2.2. Xử lý gộp / Quét trùng Barcode
- Khi quét mã vạch hoặc bấm thêm sản phẩm, chỉ tìm dòng bán thường (`!item.is_gift`) để tăng số lượng, không gộp vào dòng quà tặng.
- Có nút **`🔄 Gộp lại`** trên dòng quà tặng để hoàn tác chuyển số lượng về lại dòng bán thường.

---

## 3. UI/UX & Tương Tác Giỏ Hàng

1. **Hiển thị nút `🎁 Tách Tặng`**:
   - Xuất hiện trên dòng bán thường khi `item.quantity >= 2`.
   - Bấm vào: Tách 1 món thành dòng quà tặng (nếu `quantity <= 3`), hoặc mở popup nhỏ cho chọn số lượng tách nếu số lượng lớn.
2. **Giao diện dòng quà tặng**:
   - Badge nổi bật: `🎁 QUÀ TẶNG` màu xanh lá.
   - Đơn giá hiển thị gạch ngang giá gốc và ghi `0 đ`.
   - Nút `🔄 Gộp lại`: click vào sẽ trả lại số lượng cho dòng bán thường và xóa dòng quà tặng.
3. **Bảo toàn khi tính khuyến mãi tự động**:
   - `syncBuyXGetYPromotionsInCart`: chỉ filter xóa `item.is_gift && !item.is_manual_gift`. Giữ nguyên các dòng có `is_manual_gift: true`.

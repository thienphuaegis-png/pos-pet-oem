# Thiết Kế Chi Tiết: Phân Hệ Đặt Hàng Gia Công OEM & Dự Báo Dòng Tiền Đa Quỹ

**Ngày tạo:** 18/09/2026  
**Trạng thái:** Đã thống nhất qua Brainstorming  

---

## 1. Bối cảnh & Nghiệp vụ thực tế
- Đặt sản xuất hàng hóa tại nhà máy gia công (OEM / Subcontracting).
- Nhà máy chiết rót + cung cấp dịch vụ/nước cốt, tính theo đơn giá thành phẩm (có chiết khấu và thuế VAT 8%).
- Doanh nghiệp tự cung cấp vật tư phụ: Vỏ chai, nắp, tem nhãn theo hương, màng seal, thùng carton.
- Vật tư phụ gửi sang lưu tại kho xưởng, cần theo dõi số lượng tồn kho còn lại để chủ động gửi thêm.
- Khi đặt và giao hàng thực tế thường có chênh lệch số lượng (ví dụ đặt 1.500 chai nhưng nhận 1.491 chai).
- Tách biệt 2 nguồn tiền:
  - **Quỹ Công Ty (`COMPANY`)**: Dùng cho OEM, hóa đơn VAT, thanh toán ngân hàng công ty.
  - **Quỹ Cá Nhân (`PERSONAL`)**: Dùng cho nhập hàng lẻ, mua phôi/thùng chợ, tiền mặt, tài khoản cá nhân.
- Dự báo dòng tiền:
  - Hàng chưa nhận: Dự báo tiền cần chuẩn bị theo ngày hẹn giao hàng (trừ hao sớm/trễ ±1 ngày).
  - Hàng đã nhận: Chuyển thành công nợ thực tế nếu chưa thanh toán ngay.

---

## 2. Mô hình Dữ Liệu (Database Schema)

### 2.1. Quản lý kho nhà máy
- Bảng `warehouses`: thêm cờ `is_oem INTEGER DEFAULT 0` để nhận diện kho nhà máy gia công.

### 2.2. Đơn đặt gia công OEM (`oem_orders`)
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `code`: TEXT UNIQUE (Mã đơn: OEM-YYYYMM-XXX)
- `partner_id`: INTEGER (Nhà máy gia công trong bảng `contacts`)
- `oem_warehouse_id`: INTEGER (Kho xưởng nhận NVL của mình)
- `dest_warehouse_id`: INTEGER (Kho nhận thành phẩm khi xưởng giao, mặc định Kho Tổng = 1)
- `status`: TEXT ('DRAFT', 'DEPOSITED', 'RECEIVED', 'COMPLETED', 'CANCELLED')
- `expected_delivery_date`: TEXT (Ngày dự kiến nhận hàng)
- `fund_source`: TEXT DEFAULT 'COMPANY' ('COMPANY' hoặc 'PERSONAL')
- `vat_percent`: REAL DEFAULT 8.0 (Thuế VAT)
- `discount_percent`: REAL DEFAULT 0.0 (Chiết khấu %)
- `deposit_amount`: REAL DEFAULT 0.0 (Tiền cọc đợt 1)
- `deposit_date`: TEXT (Ngày chuyển cọc)
- `total_raw_amount`: REAL DEFAULT 0.0 (Tổng tiền theo đơn giá niêm yết)
- `total_final_amount`: REAL DEFAULT 0.0 (Tổng tiền sau CK + VAT)
- `remaining_payment`: REAL DEFAULT 0.0 (Tiền còn lại phải thanh toán)
- `payment_status`: TEXT DEFAULT 'UNPAID' ('UNPAID', 'PARTIAL', 'PAID')
- `note`: TEXT
- `created_at`: TEXT
- `updated_at`: TEXT

### 2.3. Chi tiết đơn đặt OEM (`oem_order_items`)
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `order_id`: INTEGER (FK -> oem_orders.id)
- `product_id`: INTEGER (Thành phẩm gia công)
- `ordered_qty`: REAL (Số lượng đặt dự kiến)
- `received_qty`: REAL DEFAULT 0.0 (Số lượng thực nhận khi xưởng giao)
- `unit_price`: REAL (Đơn giá gia công niêm yết trước CK/VAT)
- `final_unit_cost`: REAL DEFAULT 0.0 (Đơn giá gia công ròng đã trừ CK + cộng VAT)
- `full_cost_per_unit`: REAL DEFAULT 0.0 (Tổng giá vốn 1 đơn vị = final_unit_cost + chi phí tem/chai theo BOM)

### 2.4. Sổ quỹ & Công nợ mở rộng (`cashbook` & `contacts`)
- Thêm cột `fund_source TEXT DEFAULT 'COMPANY'` vào bảng `cashbook` ('COMPANY' hoặc 'PERSONAL').
- Cập nhật số dư công nợ chi tiết theo `fund_source`.

---

## 3. Luồng Tính Toán & Tự Động Hóa

### 3.1. Tính đơn giá gia công ròng (sau CK và VAT)
Với mỗi dòng sản phẩm:
$$\text{Đơn giá ròng} = \text{Đơn giá niêm yết} \times (1 - \frac{\text{Discount \%}}{100}) \times (1 + \frac{\text{VAT \%}}{100})$$

### 3.2. Tính Giá Vốn Thành Phẩm Chuẩn
Khi nhận hàng:
$$\text{Giá vốn 1 SP} = \text{Đơn giá ròng} + \sum (\text{Định lượng NVL trong BOM} \times \text{Giá vốn NVL tại thời điểm nhận})$$
Hệ thống tự động cập nhật giá vốn này vào bảng `products.cost_price`.

### 3.3. Trừ Tồn Kho Nguyên Liệu
- Tăng tồn kho Thành phẩm tại `dest_warehouse_id` theo `received_qty`.
- Với mỗi NVL vật lý trong BOM của sản phẩm:
  $$\text{Lượng NVL tiêu hao} = \text{received_qty} \times \text{BOM quantity}$$
  Trừ trực tiếp trong `inventory` tại `oem_warehouse_id`.

### 3.4. Dòng Tiền & Công Nợ
1. **Lúc Cọc 50%**:
   - Ghi 1 phiếu chi trong `cashbook` với `fund_source = 'COMPANY'`, `ref_type = 'oem_deposit'`.
2. **Lúc Nhận Hàng (Chưa trả hết)**:
   - Số tiền còn lại chuyển thành công nợ nhà máy trong hệ thống.
3. **Dự Báo Dòng Tiền**:
   - Truy vấn các đơn `oem_orders` và `purchases` đang ở trạng thái chờ nhận hàng.
   - Gom theo `expected_delivery_date` với khoảng biến thiên $\pm 1$ ngày.
   - Lọc rạch ròi theo `fund_source`: `COMPANY` (Quỹ Công ty) vs `PERSONAL` (Quỹ Cá nhân).

# Thiết Kế Phân Tách Công Nợ Nhà Cung Cấp Theo Đơn Có Thuế (Quỹ Cty) & Không Thuế (Quỹ Cá Nhân)

## 1. Mục tiêu
- Phân biệt rõ ràng đơn hàng có thuế (VAT) và không có thuế (Không VAT).
- Tách công nợ NCC thành 2 rổ:
  - 🏢 `debt_company`: Tổng nợ các đơn có thuế (VAT).
  - 👤 `debt_personal`: Tổng nợ các đơn không có thuế.
- Ràng buộc thanh toán:
  - Thanh toán bằng `Quỹ Công Ty` chỉ được cấn trừ vào các đơn CÓ THUẾ.
  - Thanh toán bằng `Quỹ Cá Nhân` chỉ được cấn trừ vào các đơn KHÔNG THUẾ. Tuyệt đối không cấn trừ vào đơn có thuế.

## 2. Quy chuẩn nhận diện hóa đơn
- Đơn `purchases`:
  - `has_vat = (vat_rate > 0 or vat_amount > 0)`
- Đơn `oem_orders`:
  - `has_vat = (vat_percent > 0 or fund_source == 'COMPANY')`

## 3. Backend API
1. `GET /api/cashflow-debts/suppliers`:
   - Trả về thêm:
     - `debt_company`: tổng nợ các đơn có thuế.
     - `debt_personal`: tổng nợ các đơn không thuế.
     - `debt_total`: tổng công nợ.
2. `GET /api/cashflow-debts/suppliers/{id}/orders`:
   - Trả về thêm cờ:
     - `has_vat: bool`
     - `vat_percent: float`
     - `fund_source_required: 'COMPANY' | 'PERSONAL'`
3. `POST /api/cashflow-debts/pay-supplier`:
   - Tham số: `supplier_id, amount, fund_source, note`
   - Nếu `fund_source == 'COMPANY'`: FIFO chỉ trừ các đơn `has_vat == True`.
   - Nếu `fund_source == 'PERSONAL'`: FIFO chỉ trừ các đơn `has_vat == False`.
   - Báo lỗi nếu số tiền trả vượt quá nợ của rổ quỹ tương ứng.
4. `POST /api/cashflow-debts/pay-order`:
   - Đơn có VAT $\to$ Bắt buộc `fund_source == 'COMPANY'`.
   - Đơn không VAT $\to$ Bắt buộc `fund_source == 'PERSONAL'`.

## 4. Giao diện Frontend
- Bảng công nợ NCC:
  - Cột `🏢 Nợ Cty (Có VAT)`
  - Cột `👤 Nợ Cá Nhân (Không VAT)`
  - Cột `Tổng Nợ`
- Popup Lập phiếu trả nợ NCC:
  - Hiển thị rõ số dư nợ theo Quỹ Cty và Quỹ Cá Nhân.
  - Chọn Quỹ Cty $\to$ Hiển thị hạn mức nợ có thuế, nút "Trả hết nợ có thuế".
  - Chọn Quỹ Cá Nhân $\to$ Hiển thị hạn mức nợ không thuế, nút "Trả hết nợ không thuế".
- Popup Chi tiết đơn nợ:
  - Cột `Thuế VAT`: Badge `🏢 VAT X%` hoặc `👤 Không VAT`.
  - Nút `Trả đơn này`: tự động chọn đúng nguồn quỹ và khóa lại.

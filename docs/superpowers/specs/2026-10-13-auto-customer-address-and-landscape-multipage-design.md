# Thiết Kế: Tự Động Hiển Thị Địa Chỉ Khách Hàng & Ngắt Đa Trang Hóa Đơn A4 Ngang

## 1. Mục Tiêu
- Khách hàng có lưu địa chỉ trong hệ thống (như DogHouse Petshop) phải **tự động hiển thị địa chỉ** trên hóa đơn xem trước và khi in mà người dùng không cần phải vào màn hình thiết kế để kéo thả/bật tắt thủ công.
- Đảm bảo dữ liệu khách hàng được nạp đầy đủ thuộc tính `address` vào giỏ hàng POS (`tab.customer.address`) khi chọn khách tại quầy.
- Với khổ giấy A4 Ngang (A4-landscape) có chiều cao trang 794px:
  - Khi đơn hàng dài (>20 mặt hàng), nội dung vượt quá 1 trang landscape: Preview và bản in hiển thị đầy đủ, không bị cắt cụt ở dòng 21, chân trang tự động dạt sang trang 2 sạch sẽ kèm phân trang rõ ràng.

## 2. Giải Pháp Chi Tiết

### A. Tự động nạp và hiển thị Địa Chỉ Khách Hàng
1. **Trong `static/js/pos.js` - `selectCustomerForActiveTab(customerId)`**:
   - Bổ sung `address: cust.address || ''` vào `tab.customer`.
2. **Trong `renderAndPrint(ord, isDraft)`**:
   - Map `dia_chi_khach: ord.customer_address || ord.address || (tab && tab.customer ? tab.customer.address : '') || ''`.
   - Nếu `dia_chi_khach` có giá trị nhưng danh sách `effectiveElements` của preset hiện tại chưa có phần tử `customer_address`:
     - Tự động chèn phần tử `customer_address` (`catalog_key: 'customer_address'`, `text: 'Địa chỉ: {{dia_chi_khach}}'`) ngay dưới dòng Khách Hàng.
     - Tọa độ Y tự động tính bằng `custElem.y + 18` (hoặc chèn kế tiếp trong luồng header), đảm bảo không đè lên bảng hay các trường khác.
     - Bảng `table_b2b` và các phần tử phía dưới tự động dời xuống tương ứng nếu cần.
3. **Migrate dữ liệu preset trong database**:
   - Chạy script cập nhật các preset A4/B2B đang có trong DB (`settings.print_blocks_config`): chèn `customer_address` nếu chưa có.

### B. Xử lý Preview và In Đa Trang cho Khổ A4 Ngang (A4-Landscape)
1. **Khung Preview trong POS (`#print-area`)**:
   - Không đặt `overflow: hidden` cố định trên `.print-container` và `.print-inner` trong chế độ xem trước nếu chiều cao vượt quá 1 trang (`canvasH > nominalH`).
   - Cho phép cuộn dọc tự nhiên để người dùng xem trọn vẹn từ dòng 1 đến dòng cuối cùng và toàn bộ chân trang (Bank, QR, Chữ ký).
2. **Cơ chế in qua Iframe**:
   - `A4 landscape` có chiều cao 1 trang là ~794px. Nếu đơn hàng >20 món (như 35 món, cao ~1370px):
     - Không ép co kéo tỉ lệ siêu nhỏ (`scale`) gây vỡ nét.
     - Cho phép ngắt trang tự nhiên (`page-break-after: auto`).
     - Trang 1 chứa Header + Bảng (dòng 1-21).
     - Trang 2 chứa phần tiếp theo của Bảng (dòng 22-35) + Khối Chân Trang (`b2b_footer_boxes`, `signatures_3col`).
     - Khối chân trang được bảo vệ bởi `page-break-inside: avoid` để luôn đi cùng nhau không bị xé đôi giữa 2 trang.

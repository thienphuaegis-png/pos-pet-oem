# Thiết Kế: Sửa Lỗi Hiển Thị Địa Chỉ Khách Hàng Khi In Lại & Chống Tràn Cắt Trang Khi In Hóa Đơn Lớn (A4 Landscape / Multi-Page)

## 1. Bối cảnh & Hiện trạng lỗi
- **Lỗi 1 (Địa chỉ khách hàng không hiển thị)**:
  - Khi người dùng in lại hóa đơn (hoặc từ danh sách đơn hàng), module `productions.js` có các hàm trùng tên (`showPrintModal`, `renderAndPrint`) nhưng lại là code cũ: `printData` thiếu `dia_chi_khach`, thiếu cơ chế auto-inject khối `customer_address`.
  - Trên preset `preset_1789369697524` ("Hóa Đơn A4 - Ngang Đại Lý (Mẫu Mới)"), tọa độ của phần tử SĐT (`elem_1789369630956` tại `y = 177.5`) và phần tử Địa chỉ (`elem_addr_...` tại `y = 180`) bị đè sát nhau (cách nhau chỉ 2.5px), dẫn đến va chạm tọa độ hoặc bị che khuất.
  - Cần thống nhất 100% các thao tác "In lại hóa đơn" về duy nhất engine in chuẩn của `pos.js` (`window.showPrintModal`, `window.renderAndPrint`), đồng thời đảm bảo `printData.dia_chi_khach` luôn được map đầy đủ từ `ord.customer_address || ord.address || ''`.
- **Lỗi 2 (Preview đầy đủ nhưng khi in bị cắt trang / chỉ in được 1 của 1)**:
  - Khi xem trước trong modal `#print-area`, modal hỗ trợ cuộn dọc nên hiển thị trọn vẹn 35 dòng sản phẩm và 3 ô chân trang.
  - Khi bấm "Xác Nhận In Hóa Đơn", hàm `printInvoiceDirectly` tạo `iframe` và nhúng `.print-container`. Tuy nhiên:
    1. Thẻ `body` của iframe mang inline style `display: flex; justify-content: center; align-items: flex-start;`. Trong Blink/Chromium print engine, flex container **không bao giờ hỗ trợ phân trang (no page-break in flex context)**, làm trình duyệt khóa cứng chỉ in đúng 1 trang đầu tiên.
    2. Thẻ `.print-inner` trong template HTML mang inline style `page-break-inside: avoid; break-inside: avoid;` khiến toàn bộ tờ in bị chống ngắt trang.
    3. Toàn bộ các khối trong mẫu in đang được định vị bằng `position: absolute`. Khi nội dung vượt quá chiều cao trang A4 ngang (210mm ~ 794px), các phần tử vượt quá 794px bị rơi ra ngoài vùng in của trang 1 và bị cắt cụt.

## 2. Giải pháp kỹ thuật chi tiết

### 2.1. Thống nhất Engine In & Đồng bộ trường Địa Chỉ (`pos.js` & `productions.js`)
1. **Loại bỏ các hàm in cũ trùng lặp trong `productions.js`**:
   - Chuyển `showPrintModal` và `renderAndPrint` trong `productions.js` gọi thẳng `window.showPrintModal` / `window.renderAndPrint` của `pos.js`.
   - Bổ sung `dia_chi_khach` vào `printData` ở mọi nơi tạo dữ liệu in.
2. **Chuẩn hóa toạ độ Header trong `preset_1789369697524` và logic auto-inject**:
   - Nếu khách có địa chỉ, đảm bảo dòng `Địa chỉ: {{dia_chi_khach}}` hiển thị rõ ràng dưới dòng Tên khách hàng / SĐT, không đè toạ độ `y` lên dòng SĐT.
   - Khi có dòng địa chỉ, bảng hàng hóa (`e10`) và các phần tử bên dưới tự động dời xuống một khoảng an toàn (ít nhất 20px).

### 2.2. Xử lý Multi-Page Printing cho Hóa Đơn Lớn (> 20 dòng trên A4 ngang / > 35 dòng trên A4 dọc)
1. **Loại bỏ `display: flex` trên `body` khi in trong `printInvoiceDirectly`**:
   - Đổi `body` của iframe sang `display: block; margin: 0 auto; text-align: center;`. Thẻ `.print-container` dùng `margin: 0 auto; display: block;` để căn giữa mà không tạo flex context ngăn cản ngắt trang.
2. **Gỡ bỏ triệt để `page-break-inside: avoid` trên container và inner**:
   - Xóa `page-break-inside: avoid; break-inside: avoid;` trên `.print-inner` trong cả CSS lẫn inline style khi in khổ A4/A5.
3. **Cơ chế phân trang thực tế (Multi-Page Split Engine)**:
   - Khi hóa đơn vượt chiều cao trang 1 (ví dụ >18 dòng đối với A4 ngang, hoặc tổng chiều cao nội dung `maxContentBottom > 720px` cho landscape):
     - Không dùng layout tuyệt đối (`position: absolute`) monolithic đơn lẻ cố định chiều cao.
     - Phân tách trang in thành luồng in tự nhiên (flowable paged layout):
       - Header (Logo, Tên shop, Thông tin đơn, Khách hàng) ở đầu trang 1.
       - Bảng hàng hóa (`table_b2b`): `thead` có `display: table-header-group` (tự lặp lại ở đầu trang tiếp theo), `tbody tr` có `page-break-inside: avoid; break-inside: avoid;`.
       - Khối chân trang (`b2b_footer_boxes`, `signatures_3col`, `footer_msg`): gom vào khối footer có `page-break-inside: avoid; break-inside: avoid;` để không bị xé đôi giữa trang và luôn nằm liền mạch ở chân trang cuối cùng.
   - Nhờ vậy, hóa đơn 35 món sẽ tự động in sang **Trang 1: Header + 18-20 dòng sản phẩm đầu; Trang 2: Thead lặp lại + các dòng sản phẩm còn lại + 3 Ô Chân Trang + 3 Chữ Ký**.

## 3. Kế hoạch kiểm thử & Tiêu chuẩn nghiệm thu (Acceptance Criteria)
1. **AC 1 (Địa chỉ khách hàng)**: Đơn hàng đại lý DogHouse Petshop khi xem trước và khi in phải hiển thị đầy đủ `Địa chỉ: 236 Thủ Khoa Huân...`.
2. **AC 2 (In lại hóa đơn từ mọi nơi)**: Bấm "In lại hóa đơn" từ danh sách đơn hàng / lịch sử / POS đều mở đúng modal chuẩn của `pos.js` với đầy đủ thông tin địa chỉ và preset active.
3. **AC 3 (Multi-page Không bị cắt chân trang)**: Hóa đơn 35 dòng khi bấm "Xác Nhận In Hóa Đơn" trên A4 ngang phải ra 2 trang hoàn chỉnh (Trang 1 gồm bảng hàng, Trang 2 gồm phần hàng còn lại + 3 ô chân trang thanh toán + 3 chữ ký). Không còn bị khóa "1 của 1" và không bị mất tổng kết tiền/chữ ký.

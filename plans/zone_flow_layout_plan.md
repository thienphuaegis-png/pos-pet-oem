# Implementation Plan: Zone-Based Flow Layout (Phân Vùng Cứng & Kéo/Đổi Thứ Tự Khối)

**Goal:** Chuyển đổi hoàn toàn cơ chế Canvas định vị tọa độ tự do (absolute coordinate) sang mô hình **Zone-based Flow Layout (3 Phân Vùng có dòng chảy tự nhiên)**. Thành phần thuộc vùng nào thì chỉ nằm trong vùng đó, tự động xếp theo thứ tự, hỗ trợ kéo thả chuột trượt lên/xuống và nút bấm ▲ / ▼ để hoán đổi vị trí (vd: Logo nằm trên hoặc dưới Tên cửa hàng).

**Architecture:**
1. **Dữ liệu Mẫu In (`zoneLayout`)**:
   - `header`: Mảng các khối thuộc đầu trang `[logo, shop_name, shop_address, shop_phone, title, order_code, datetime, customer...]`
   - `body`: Khối bảng hàng hóa `[table]` (tự động co dãn theo số món, hiển thị cấu hình cột)
   - `footer`: Mảng các khối cuối trang `[totals, qr, footer_msg, signatures...]`
2. **Hành vi Thêm Khối (Add Item)**:
   - Mỗi thành phần trong Catalog được gán cứng `zone`: `'header'`, `'body'`, `'footer'`.
   - Khi bấm thêm (ví dụ Logo): Nó được chèn vào `header` (mặc định ở vị trí đầu tiên index 0), không bao giờ nhảy sang khu vực khác.
3. **Thao tác Đổi Thứ Tự (Reorder)**:
   - **Kéo thả chuột (Drag to Reorder)**: HTML5 Drag & Drop hoặc Mouse Move trong phạm vi container của từng Zone. Kéo trượt khối lên/xuống sẽ hoán đổi vị trí trực tiếp trên tờ giấy.
   - **Nút bấm 1-click**: Nút `▲ Lên Trên` và `▼ Xuống Dưới` trong Bảng thuộc tính bên phải để di chuyển chính xác.
4. **Hiển thị & In ấn (Print Engine)**:
   - Sử dụng Flex/Grid/Block flow tự nhiên. Khi bảng hàng hóa có 5 hay 50 món, khu vực Body tự dãn dài, tự động đẩy toàn bộ khu vực Footer xuống một cách hoàn hảo, không bao giờ bị đè chữ.

## Tasks
- [ ] Task 1: Định nghĩa cấu trúc `zoneLayout` và catalog thành phần theo vùng trong `templates/index.html`.
- [ ] Task 2: Cập nhật UI 3 Vùng trên tờ giấy hiển thị rõ ràng, hỗ trợ kéo trượt đổi thứ tự (drag & drop reorder).
- [ ] Task 3: Thêm các nút điều khiển ▲ Lên / ▼ Xuống trong Bảng thuộc tính bên phải.
- [ ] Task 4: Cập nhật Render Engine in thử và in đơn hàng theo dòng chảy tự nhiên.
- [ ] Task 5: Kiểm thử cú pháp, thao tác hoán đổi vị trí và in thử.

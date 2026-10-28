# Thiết Kế: Đại Tu Trình Thiết Kế Mẫu In (Layout 2 Cột, Header 2 Bên, Ẩn Nút Rác, Tùy Biến Bảng Tự Do)

- **Ngày phê duyệt:** 2026-10-10
- **Tác giả:** Hermes Agent
- **Người phê duyệt:** Bùi Thiên Phú (Chủ shop)
- **Mục tiêu chính:**
  1. Thu gọn cây "Danh Mục Chứng Từ" thành 1 Dropdown nhóm (`<optgroup>`), chuyển layout từ 3 cột chật chội sang 2 cột rộng rãi.
  2. Dọn sạch giao diện Preview tờ giấy: Ẩn hoàn toàn các nút `▲ Lên` / `▼ Xuống` ở trạng thái bình thường; chỉ khi click chọn khối mới hiện viền active và bộ điều khiển.
  3. Bố cục Header linh hoạt: Cho phép Logo và Thông tin shop nằm song song trên cùng một hàng (Logo bên trái, Thông tin shop bên phải hoặc ngược lại), hỗ trợ căn Trái / Giữa / Phải.
  4. Mở khóa tùy biến Bảng hàng hóa: Không cố định nội dung, cho phép bật/tắt cột và chỉnh sửa tên tiêu đề các cột (`Mã hàng/SKU`, `ĐVT`, `Đơn giá`, `Chiết khấu`, `Thành tiền`, `Ghi chú`).

---

## 1. Thiết Kế Chi Tiết Từng Phần

### A. Tái Cấu Trúc Layout Workspace (Từ 3 Cột sang 2 Cột Rộng Rãi)
- **Trước**: Cột 1 (Cây danh mục 220px) + Cột 2 (Cấu hình khối 340px) + Cột 3 (Canvas Preview).
- **Sau**:
  - Chuyển "Danh Mục Chứng Từ" thành Dropdown trên thanh công cụ:
    `<select id="print-doc-type-select">` với 4 nhóm optgroup:
    * `── ĐƠN HÀNG ──` (Hóa Đơn Bán Lẻ, Hóa Đơn Sỉ / A4, Phiếu Tạm Tính)
    * `── DỊCH VỤ SPA ──` (Tiếp Nhận Spa, Thu Nạp Ví Spa, Hóa Đơn Spa)
    * `── SỔ QUỸ ──` (Phiếu Thu Tiền, Phiếu Chi Tiền, Báo Cáo Đóng Ca Z)
    * `── KHO & KIỂM KÊ ──` (Kiểm Kê Kho)
  - Giải phóng 220px, chỉ còn **2 Cột**:
    - **Cột Trái (360px)**: Bật/tắt khối, chuyển đổi mẫu in, chỉnh sửa thuộc tính khối được chọn.
    - **Cột Phải (Chiếm toàn bộ không gian còn lại)**: Canvas xem trước rộng rãi, có thước đo và thanh thu phóng.

### B. Dọn Rác Giao Diện Bản Xem Trước (Clean Canvas Preview)
- Trên mỗi khối trong `#paper-canvas`:
  - Ẩn hoàn toàn div `.element-action-bar` chứa nút `▲ Lên`, `▼ Xuống` khi chưa chọn.
  - Khi click vào khối (`isSel === true`):
    - Khối viền nét đứt màu xanh `border: 1.5px dashed #0284c7;`.
    - Xuất hiện thanh điều khiển nổi nhỏ gọn phía trên góc phải: `[▲ Lên]` `[▼ Xuống]` `[Căn Trái]` `[Căn Giữa]` `[Căn Phải]` `[🗑️ Xóa]`.
  - Giúp bản xem trước phản ánh chính xác 100% hình ảnh hóa đơn thật khi in ra giấy.

### C. Bố Cục Header Song Song (Logo & Thông Tin Shop Cùng Hàng)
- Hỗ trợ khối phức hợp `header_grid_2col`:
  - Cho phép chia 2 cột: Cột Trái chứa Logo (hoặc Text), Cột Phải chứa Tên Shop, Địa chỉ, Hotline (hoặc ngược lại).
  - Khổ A4 đại lý hoặc K80 đều có thể chọn layout Logo cạnh thông tin shop thay vì bắt buộc logo nằm đè lên trên.

### D. Tùy Biến Bảng Hàng Hóa Linh Hoạt
- Trong bảng B2B/Đại lý (`table_b2b`) và bảng K80:
  - Cho phép tùy chỉnh cấu hình cột:
    ```json
    "columns_config": {
      "code": {"show": true, "title": "Mã hàng"},
      "name": {"show": true, "title": "Tên sản phẩm"},
      "unit": {"show": true, "title": "ĐVT"},
      "price": {"show": true, "title": "Đơn giá"},
      "discount": {"show": true, "title": "CK"},
      "quantity": {"show": true, "title": "SL"},
      "subtotal": {"show": true, "title": "Thành tiền"},
      "note": {"show": true, "title": "Ghi chú"}
    }
    ```
  - Khi chọn khối bảng, bên panel thuộc tính hiển thị form checkbox bật/tắt từng cột và input đổi tên tiêu đề cột.

---

## 2. Tiêu Chí Nghiệm Thu (Acceptance Criteria)
1. Cột cây danh mục 220px biến mất, thay bằng dropdown nhóm optgroup hoạt động mượt mà.
2. Bản xem trước không còn hiện nút ▲ Lên / ▼ Xuống rải rác trên mọi dòng; chỉ click vào khối mới hiện công cụ.
3. Có thể thiết lập Logo và Thông tin shop nằm ngang cùng 1 hàng.
4. Có thể bật/tắt và đổi tên các cột trong bảng hàng hóa.
5. Toàn bộ test suite in ấn pass 100%.

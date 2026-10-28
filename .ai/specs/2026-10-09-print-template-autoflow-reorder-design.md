# Thiết Kế: Mẫu In Auto-Flow Tự Động Dồn Dòng & Di Chuyển Thứ Tự (Chống Chồng Đè Chữ)

## 1. Vấn đề thực tế
- Các khối nội dung trên canvas mẫu in trước đây sử dụng tọa độ cố định (`left`, `top` pixel tuyệt đối).
- Khi đổi khổ giấy (A4 sang K80) hoặc khi bật/tắt các trường (Logo, Khách hàng, VietQR), các khối bên dưới không dồn dòng mà đứng yên ở vị trí cũ, gây ra hiện tượng chồng đè chữ lên nhau.
- Thao tác kéo thả bị lệch khi phóng to/thu nhỏ (Zoom) và bị khống chế cứng trên khổ K80.

## 2. Giải pháp kỹ thuật

### 2.1. Bố cục luồng dọc tự động (Vertical Flow Layout)
- Bỏ cơ chế tọa độ tĩnh tuyệt đối (`position: absolute; top: ...`).
- Sử dụng mô hình khối luồng tự nhiên (`position: relative; display: flex/block; flex-direction: column`):
  - Khối Cửa Hàng (Logo, Tên shop, Địa chỉ, Hotline)
  - Khối Tiêu Đề & Thông Tin Chứng Từ (Số HĐ, Ngày giờ)
  - Khối Khách Hàng (Tên khách, SĐT, Điểm tích lũy, Thú cưng)
  - Khối Bảng Chi Tiết Mặt Hàng / Dịch Vụ
  - Khối Tổng Tiền & Thanh Toán (Tổng tiền, Chiết khấu, Phải thu, Khách đưa, Tiền thừa)
  - Khối VietQR & Thông Tin Tài Khoản
  - Khối Lời Cảm Ơn & Chân Trang
- Khi ẩn bất kỳ khối nào, các khối bên dưới tự động dồn lên trên mượt mà.

### 2.2. Cơ chế di chuyển & đổi thứ tự (Re-order)
- Mỗi khối có thuộc tính thứ tự hiển thị `order_index`.
- Hỗ trợ 2 phương thức đổi vị trí:
  1. Nút bấm nhanh **▲ Lên trên** và **▼ Xuống dưới** trên bảng thuộc tính khi chọn khối.
  2. Kéo thả HTML5 Drag & Drop (hoặc pointer drag) giữa các khối.
- Cập nhật tức thời vị trí trên khung xem trước và lưu vào mảng `elements` của template.

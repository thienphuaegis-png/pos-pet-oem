# Implementation Plan: Tự Động Đẩy/Dãn Các Khối Phía Dưới Theo Độ Dài Bảng Hàng Hóa

## Nguyên Nhân Gốc (Root Cause)
- Các phần tử đang được định vị bằng tọa độ tuyệt đối cố định `top: ${e.y}px` (absolute positioning).
- Khi danh sách món trong đơn hàng dài ra (từ 2 món lên 10, 20 món), bảng `table` dài thêm hàng trăm pixel nhưng các khối phía dưới (Tổng tiền, Giảm giá, QR, Chữ ký, Lời cảm ơn) vẫn giữ nguyên tọa độ `y` ban đầu, dẫn đến việc bảng hàng hóa đè lên các khối phía dưới hoặc bị che khuất.

## Giải Pháp Kỹ Thuật (Architecture)
1. Xác định tọa độ đáy mặc định của bảng hàng hóa khi thiết kế: `baseTableBottom = tableElem.y + baseTableHeight`.
2. Khi in hóa đơn thật (hoặc in thử):
   - Đưa HTML bảng hàng hóa vào để trình duyệt đo đạc chiều cao thực tế: `actualTableHeight`.
   - Tính toán độ dôi ra: `deltaY = Math.max(0, actualTableHeight - baseTableHeight)`.
3. Đối với tất cả các khối nằm ở phía dưới bảng (`e.y >= tableElem.y`):
   - Tự động cộng thêm độ dôi: `renderY = e.y + deltaY`.
4. Bỏ thuộc tính `overflow: hidden` và `height` cố định trên thẻ bọc hóa đơn in để trang giấy tự động dãn dài theo nội dung (hoặc sang trang thứ 2 nếu in A4 dài).

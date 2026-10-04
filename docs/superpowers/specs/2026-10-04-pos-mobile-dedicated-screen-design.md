# Thiết Kế Chi Tiết: Giao Diện POS Mobile Chuyên Dụng (/pos/m)

- **Ngày:** 2026-10-04
- **Đường dẫn mục tiêu:**
  - Route mới: `/pos/m` (FastAPI route trong `routers/orders.py` hoặc `server.py`).
  - Template mới: `templates/pos_mobile.html`.
  - Static logic: `static/js/pos_mobile.js` (tinh gọn, dùng chung API `/api/products`, `/api/orders`, `/api/contacts`).
  - Tự động chuyển hướng: Khi người dùng truy cập `/pos` từ trình duyệt di động (kiểm tra `User-Agent` hoặc chuyển hướng qua JS nếu màn hình `< 768px`), tự động mở `/pos/m` (có nút bấm chuyển về Desktop nếu muốn).

---

## 1. Nguyên Tắc Thiết Kế UI/UX Cho Mobile Touch

1. **Chống tràn ngang tuyệt đối (Zero Horizontal Overflow):**
   - Không dùng `grid-template-columns` cố định pixel.
   - Thẻ sản phẩm dạng danh sách dọc 1 cột hoặc lưới 2 cột co giãn linh hoạt (`w-full`, `min-w-0`).
   - Font chữ chuẩn mobile: tiêu đề 16px, tên món 14px, giá 15px bold, phụ đề 12px (không dùng text 9px-10px như bản desktop thu nhỏ).
2. **Kích thước vùng chạm chuẩn Apple HIG & Google Material:**
   - Mọi nút bấm (`+`, `-`, nút xóa, nút thanh toán) tối thiểu 44px x 44px.
   - Khoảng cách giữa các nút an toàn để không bấm nhầm khi đứng quầy bán nhanh.
3. **Thanh toán & Giỏ hàng dạng Bottom Sheet toàn màn hình:**
   - Đáy màn hình luôn có thanh Floating Dock:
     - Số lượng món + Tổng tiền nổi bật.
     - Nút "Xem giỏ / Thanh toán" to rõ màu xanh.
   - Khi chạm vào Dock: Sheet trượt lên chiếm toàn màn hình, hiển thị danh sách món đã chọn, chọn khách hàng, chọn phương thức (Tiền mặt / VietQR), và nút "Hoàn tất đơn hàng".

---

## 2. Luồng Xử Lý (Workflow)

```
[Mở trình duyệt trên ĐT] -> Vào /pos -> Nhận diện Mobile -> Vào /pos/m
         │
         ├── 1. Chọn món / Quét mã barcode
         │      - Tìm kiếm tức thời (gõ tên / mã)
         │      - Lọc theo phân loại (Spa, Thức ăn, Cát, Dịch vụ)
         │      - Chạm nút [+] trên thẻ -> Giỏ hàng tăng số lượng ngay
         │
         ├── 2. Xem giỏ & Chỉnh sửa (Floating Dock)
         │      - Bấm vào Dock đáy màn hình -> Sheet trượt lên
         │      - Tăng / Giảm / Xóa món trong giỏ
         │      - Nhập giảm giá / Chọn khách hàng
         │
         └── 3. Thanh toán
                - Tiền mặt / Chuyển khoản VietQR
                - Bấm "Xác Nhận Thanh Toán" -> Tạo đơn qua /api/orders
                - Hiện thông báo thành công + Mở modal in bill (nếu cần)
```

---

## 3. Ràng buộc kỹ thuật
- Tận dụng 100% các API hiện có:
  - `GET /api/products`
  - `GET /api/contacts?type=customer`
  - `POST /api/orders`
  - `GET /api/payment-accounts`
  - `GET /api/price-lists`
- Không ảnh hưởng đến `/pos` trên máy tính.

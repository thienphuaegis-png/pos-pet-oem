# Thiết Kế: Hiển Thị Giảm Giá Trên Hóa Đơn Cuộn K80

**Ngày:** 2026-09-24  
**Trạng thái:** Đã duyệt bởi người dùng (Brainstorming Approved)  
**Phạm vi:** POS Offline Petcare 2 — In hóa đơn nhiệt K80  

---

## 1. Mục Tiêu
Cung cấp khả năng hiển thị chiết khấu / giảm giá trực quan, rõ ràng trên mẫu hóa đơn nhiệt K80 (chiều rộng 72-80mm / 270px) ở cả 2 cấp độ:
1. **Cấp độ từng món (Item-level)**: Hiển thị giá gốc gạch ngang và giá bán thực tế tại cột Đơn giá.
2. **Cấp độ hóa đơn (Bill-level)**: Hiển thị dòng tổng chiết khấu/giảm giá ở phần chân trang (tự ẩn nếu 0đ để tiết kiệm giấy in).

---

## 2. Chi Tiết Thiết Kế Giao Diện & Hành Vi

### 2.1. Bảng Hàng Hóa (Item-level Discount)
- **Cấu trúc cột:** Giữ nguyên 4 cột chuẩn: `Tên sản phẩm | SL | Đơn giá | Thành tiền`.
- **Cột Đơn giá:**
  - **Trường hợp có giảm giá (`original_price > price`):**
    - Dòng 1 (trên): Giá bán thực tế (ví dụ: `100.000 đ`, font đậm).
    - Dòng 2 (dưới): Giá gốc gạch ngang (ví dụ: `<span style="text-decoration: line-through; font-size: 9px; color: #666;">120.000 đ</span>`).
  - **Trường hợp không giảm giá (`original_price <= price` hoặc bằng nhau):**
    - Chỉ hiển thị 1 dòng giá bán bình thường.
- **Cột Tên sản phẩm & Thành tiền:** Giữ nguyên vẹn, không bị vỡ cột.

### 2.2. Chân Trang Hóa Đơn (Bill-level Discount)
- **Vị trí:** Đặt giữa `Tổng tiền hàng` và `KHÁCH TRẢ`.
- **Nội dung:**
  ```text
  Tổng tiền:          240.000 đ
  Giảm giá:           -40.000 đ
  KHÁCH TRẢ:          200.000 đ
  ```
- **Quy tắc hiển thị:**
  - Nếu `discount > 0`: Hiển thị dòng `Giảm giá: -XX.XXX đ` (hoặc định dạng tiền âm/dấu trừ rõ ràng).
  - Nếu `discount == 0`: Tự động ẩn dòng Giảm giá (không tốn chiều cao giấy in nhiệt).

### 2.3. Áp Dụng Đồng Bộ
- **Xem trước mẫu in (Visual Builder Canvas - `app.js`):** Canvas preview K80 hiển thị đúng demo có giảm giá để chủ shop trực quan quan sát.
- **In thực tế (POS Checkout & In lại từ Lịch sử - `pos.js`):** Render đúng dữ liệu đơn hàng thật từ server.
- **In tạm tính (Draft Order - `pos.js`):** Render đúng dữ liệu giỏ hàng hiện thời (bao gồm cả chiết khấu theo % hoặc VND).

---

## 3. Nguồn Dữ Liệu & Backend
- **Endpoint `GET /api/orders/{code}` (`routers/pos.py`):**
  - Truy vấn `order_items` JOIN `products p` bổ sung trường `p.sell_price AS original_price`.
- **Hóa đơn tạm tính (`printDraftOrder` trong `pos.js`):**
  - Giữ lại `original_price` từ `tab.cart`.

---

## 4. Kế Hoạch Kiểm Thử (Verification)
1. **Kiểm tra cú pháp JS:** `node -c static/js/app.js` và `node -c static/js/pos.js`.
2. **Kiểm tra API Order:** Test suite kiểm tra `GET /api/orders/{code}` trả về `original_price` cho các item.
3. **Kiểm tra logic Render HTML:** Đơn có giảm giá hiện đủ giá gạch ngang và dòng giảm giá chân trang; đơn không giảm giá tự ẩn dòng giảm giá chân trang.

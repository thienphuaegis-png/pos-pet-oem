# Thiết Kế: Sửa Lỗi Phân Loại Tiền SP/Dịch Vụ & Hoàn Điểm Khi Hủy Hóa Đơn

**Ngày:** 2026-10-07  
**Mục tiêu:**
1. Khắc phục lỗi tính sai tiền SP vs Dịch vụ Spa trên modal Chi tiết Hóa đơn (`productions.js`).
2. Lưu số điểm tích lũy (`points_earned`) vào bảng `orders` khi thanh toán.
3. Khi Hủy hóa đơn (trên cả Web POS `routers/pos.py` và Telegram `services/telegram_bot.py`), tự động hoàn trả trừ lại điểm của khách và tự động hạ hạng thành viên nếu điểm rơi xuống dưới ngưỡng.

---

## 1. Phân Tích Nguyên Nhân Gốc Rễ

### A. Lỗi nhận nhầm "Sữa tắm" thành Dịch vụ Spa
- **Nguyên nhân:** Trong `static/js/modules/productions.js` (tại các hàm `openModalOrderDetail`, `renderEditOrderItemsTable`, `calcEditOrderTotals`), logic kiểm tra loại mặt hàng là:
  ```javascript
  const isSvc = item.product_type === 'service' || (item.product_name && (item.product_name.toLowerCase().includes('spa') || item.product_name.toLowerCase().includes('tắm') || item.product_name.toLowerCase().includes('cắt')));
  ```
- **Hậu quả:** Bất kỳ hàng hóa đóng chai nào có chữ "tắm" (ví dụ: *Sữa tắm cho chó Corgi Gemini 250ml*) dù trong CSDL có `product_type = 'product'` vẫn bị ép thành Dịch Vụ Spa. Dẫn đến:
  - **Tiền Sản Phẩm (Hàng Hóa) = 0 đ**
  - **Tiền Dịch Vụ Spa = 199.000 đ**
  - Cho phép trừ Ví Spa trái quy định (Ví Spa chỉ dành cho dịch vụ).

### B. Lỗi hủy hóa đơn khách vẫn giữ nguyên điểm tích lũy
- **Nguyên nhân:**
  1. Khi thanh toán đơn hàng tại `routers/pos.py`, hệ thống tính `points_earned = int(actual_paid // rate)` và cộng vào `contacts.points`, nhưng **không lưu `points_earned` vào bảng `orders`**.
  2. Cả hàm xóa đơn trên Web (`routers/pos.py::delete_order`) và hàm hủy đơn trên Telegram (`services/telegram_bot.py::execute_cancel_order`) đều hoàn toàn **thiếu logic trừ lại điểm** và hạ hạng.
- **Hậu quả:** Khách mua hàng tích điểm, sau đó hủy đơn thì hàng được hoàn kho, tiền được hoàn ví/sổ quỹ, nhưng **điểm thưởng vẫn giữ nguyên**.

---

## 2. Thiết Kế Giải Pháp Chi Tiết

### Phần 1: Chuẩn hóa phân loại Sản Phẩm vs Dịch Vụ (`productions.js`)
- Chỉ xác định là Dịch vụ khi:
  ```javascript
  // Ưu tiên tuyệt đối product_type từ CSDL
  const isSvc = (item.product_type === 'service') || 
                (!item.product_type && item.product_name && /(dịch vụ|vé spa|gói tắm|tiền công)/i.test(item.product_name));
  ```
- Xóa bỏ việc kiểm tra substring chung chung như `'tắm'` vì gây va chạm với các sản phẩm hàng hóa vật lý (sữa tắm, phấn tắm, bọt tắm khô).

---

### Phần 2: CSDL & Bán hàng (Lưu `points_earned`)
1. **Migration CSDL (`database.py`):**
   - Kiểm tra cột `points_earned` trong bảng `orders`, nếu chưa có thì `ALTER TABLE orders ADD COLUMN points_earned INTEGER DEFAULT 0`.
2. **API Tạo đơn POS (`routers/pos.py`):**
   - Khi lưu đơn hàng, ghi nhận `points_earned` vào `orders.points_earned`.

---

### Phần 3: Hoàn điểm & Hạ hạng khi Hủy Đơn (`routers/pos.py` & `services/telegram_bot.py`)
Áp dụng thống nhất cho cả Web POS và Telegram Bot:
1. Đọc `customer_id` và `points_earned` từ đơn hàng trước khi xóa.
2. Nếu `customer_id` tồn tại và `points_earned > 0`:
   ```sql
   UPDATE contacts SET points = MAX(0, points - ?) WHERE id = ?
   ```
3. Lấy số điểm mới của khách hàng (`new_points`).
4. Truy vấn phân hạng cao nhất phù hợp:
   ```sql
   SELECT id, name, min_points 
   FROM customer_segments 
   WHERE is_active = 1 AND allow_points = 1 AND min_points <= ?
   ORDER BY min_points DESC, priority DESC, id DESC 
   LIMIT 1
   ```
5. Cập nhật lại `contacts.segment_id = highest_seg.id` (nếu không còn hạng nào đủ điều kiện, set về `NULL`).

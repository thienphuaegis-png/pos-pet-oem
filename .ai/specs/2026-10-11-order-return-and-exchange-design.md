# Design Spec: Tính Năng Đổi Hàng & Trả Hàng (Return & Exchange)

- **Date:** 2026-10-11
- **Status:** Approved
- **Scope:** POS Bán lẻ (Offline Petcare)

---

## 1. Mục Tiêu & Nguyên Tắc Nghiệp Vụ
1. **Bám theo đơn hàng gốc**: Toàn bộ thao tác trả hàng/đổi hàng đều xuất phát từ hóa đơn bán lẻ đã hoàn thành (`orders.status = 'completed'`).
2. **Chứng từ minh bạch độc lập**: Tạo phiếu trả/đổi hàng `order_returns` (mã tiền tố `RET-YYYYMMDD-xxxx`). Không ghi đè hay xóa đơn cũ để bảo toàn lịch sử bán hàng và tính hoa hồng.
3. **Màn hình tích hợp 2 trong 1**: Thu ngân vừa có thể hoàn trả món cũ, vừa có thể chọn món mới đổi trong cùng 1 giao diện modal; hệ thống tự tính toán bù trừ tiền thu thêm hoặc chi hoàn.
4. **Kiểm soát chặt chẽ kho và tài chính**:
   - Tùy chọn nhập lại kho (cho phép loại bỏ món hư hỏng/hết hạn).
   - Hạch toán dòng tiền (phiếu thu/chi cashbook hoặc cấn trừ công nợ/ví).
   - Chặn hoàn trả vượt số lượng còn lại của đơn hàng gốc.

---

## 2. Database Schema & Migration

### Bảng `order_returns`
```sql
CREATE TABLE IF NOT EXISTS order_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,                  -- RET-YYYYMMDD-XXXX
    original_order_id INTEGER NOT NULL,        -- Đơn bán hàng gốc
    exchange_order_id INTEGER,                 -- Đơn hàng mới xuất khi đổi món (NULL nếu chỉ trả hàng)
    customer_id INTEGER,                       -- Khách hàng
    staff_id INTEGER,                          -- Nhân viên xử lý trả/đổi
    shift_id INTEGER,                          -- Ca bán hàng hiện tại
    return_total REAL NOT NULL DEFAULT 0,      -- Tổng tiền hàng trả lại
    exchange_total REAL NOT NULL DEFAULT 0,    -- Tổng tiền hàng đổi mới
    diff_amount REAL NOT NULL DEFAULT 0,       -- Chênh lệch = exchange_total - return_total (>0: thu thêm, <0: chi hoàn)
    refund_method TEXT,                        -- cash / transfer / wallet / debt
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(original_order_id) REFERENCES orders(id),
    FOREIGN KEY(exchange_order_id) REFERENCES orders(id),
    FOREIGN KEY(customer_id) REFERENCES contacts(id),
    FOREIGN KEY(staff_id) REFERENCES staff(id),
    FOREIGN KEY(shift_id) REFERENCES shifts(id)
);
```

### Bảng `order_return_items`
```sql
CREATE TABLE IF NOT EXISTS order_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    original_item_id INTEGER,                  -- Link vào order_items gốc
    quantity REAL NOT NULL,                    -- Số lượng trả
    return_price REAL NOT NULL,                -- Đơn giá thực tế lúc mua (đã phân bổ chiết khấu)
    subtotal REAL NOT NULL,                    -- quantity * return_price
    return_to_stock INTEGER DEFAULT 1,         -- 1: nhập lại kho, 0: không nhập lại (hỏng/hủy)
    reason TEXT,                               -- Lý do đổi/trả
    FOREIGN KEY(return_id) REFERENCES order_returns(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(original_item_id) REFERENCES order_items(id)
);
```

---

## 3. Business Logic & API Endpoints

### 3.1. `GET /api/pos/orders/{code}/returnable-items`
- Kiểm tra đơn gốc tồn tại và hợp lệ.
- Tính toán cho từng món trong đơn:
  - `quantity_bought`: Số lượng mua ban đầu.
  - `quantity_returned`: Tổng số lượng đã trả ở các phiếu `order_returns` trước đó.
  - `quantity_available` = `quantity_bought - quantity_returned`.
  - `unit_price_net`: Đơn giá sau chiết khấu theo tỷ lệ của đơn gốc.

### 3.2. `POST /api/pos/returns`
- **Request Body**:
  ```json
  {
    "original_order_code": "HD...",
    "return_items": [
      {
        "original_item_id": 12,
        "product_id": 5,
        "quantity": 1,
        "return_to_stock": 1,
        "reason": "Khách đổi kích cỡ"
      }
    ],
    "exchange_items": [
      {
        "product_id": 8,
        "quantity": 1,
        "price": 150000
      }
    ],
    "payment_method": "cash",
    "note": "Khách đổi hàng ngày 11/10"
  }
  ```
- **Xử lý Transaction**:
  1. Validate: `0 < quantity <= quantity_available` cho từng món.
  2. Tạo đơn mới trong `orders` nếu có `exchange_items` (kèm xuất kho sản phẩm mới).
  3. Tạo bản ghi `order_returns` và `order_return_items`.
  4. Nếu `return_to_stock == 1`: Cộng trả lại số lượng vào `products.stock`.
  5. Hạch toán tài chính:
     - `diff_amount > 0`: Thu thêm từ khách -> sinh phiếu thu cashbook / tăng công nợ.
     - `diff_amount < 0`: Chi hoàn cho khách -> sinh phiếu chi cashbook / giảm nợ / hoàn ví.

### 3.3. `GET /api/pos/returns` & `GET /api/pos/returns/{code}`
- Danh sách tra cứu các phiếu trả hàng, lọc theo ngày/khách hàng.
- Chi tiết phiếu và dữ liệu in hóa đơn trả/đổi hàng.

---

## 4. UI/UX & Luồng Thao Tác

1. **Kích hoạt**:
   - Từ nút **🔄 Đổi / Trả Hàng** trong `modal-order-view` hoặc trong bảng danh sách hóa đơn `tab-orders`.
2. **Modal 2 cột (`modal-order-return-exchange`)**:
   - **Cột Trái (Hàng trả lại)**: Bảng món của đơn gốc, checkbox chọn món, input số lượng trả, toggle nhập kho, lý do. Hiển thị tổng tiền hoàn.
   - **Cột Phải (Hàng đổi mới)**: Tìm kiếm sản phẩm mới, thêm vào giỏ đổi, hiển thị tổng tiền hàng đổi.
   - **Footer Modal**: Hiển thị chênh lệch (Cần thu thêm hoặc Cần hoàn trả), lựa chọn phương thức thanh toán, nút xác nhận.
3. **In phiếu**: Hỗ trợ in phiếu đổi trả ngay sau khi tạo thành công.

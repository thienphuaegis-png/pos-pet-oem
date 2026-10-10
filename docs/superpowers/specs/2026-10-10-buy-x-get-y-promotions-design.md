# Thiết Kế: Hệ Thống Khuyến Mãi Mua X Tặng Y (Cùng Loại & Khác Loại)

- **Ngày phê duyệt:** 2026-10-10
- **Tác giả:** Hermes Agent
- **Người phê duyệt:** Bùi Thiên Phú (Chủ shop)
- **Phương án lựa chọn:** Hướng 2 — Bộ quy tắc khuyến mãi Mua X Tặng Y đa năng:
  - Cho phép tặng chính sản phẩm mua hoặc tặng sản phẩm khác loại.
  - Hỗ trợ nhân bội số lũy tiến (Mua 10 tặng 1, Mua 20 tặng 2...).
  - POS tự động nhận diện giỏ hàng và chèn quà tặng đơn giá 0đ, tự trừ kho và thể hiện minh bạch trên bill.

---

## 1. Mục Tiêu & Phạm Vi

1. Mở rộng hệ thống khuyến mãi từ chỉ giảm giá (% / tiền mặt) sang hỗ trợ **Mua X Tặng Y (Buy X Get Y)**.
2. Cấu hình linh hoạt:
   - Mua $X$ sản phẩm A $\to$ Tặng $Y$ sản phẩm A (cùng loại).
   - Mua $X$ sản phẩm A $\to$ Tặng $Y$ sản phẩm B (quà tặng đính kèm khác loại).
   - Tùy chọn lũy tiến: Mua $2X$ tặng $2Y$, $3X$ tặng $3Y$...
3. Tích hợp tự động tại quầy bán hàng POS:
   - Thu ngân không cần nhớ chương trình khuyến mãi.
   - Khi giỏ hàng đủ điều kiện, POS tự động chèn dòng quà tặng với đơn giá 0đ.
   - Quản lý tồn kho chuẩn xác: trừ cả hàng bán lẫn hàng quà tặng.

---

## 2. Kiến Trúc Kỹ Thuật

### A. Database Schema (`data/pos.db`)
Mở rộng bảng `promotions` và `promotion_items`:
- Bảng `promotions`:
  - `type TEXT DEFAULT 'discount'`: `'discount'` (giảm giá thường) hoặc `'buy_x_get_y'` (mua X tặng Y).
- Bảng `promotion_items`:
  - `buy_qty REAL DEFAULT 1`: Số lượng mua yêu cầu (ví dụ: 10).
  - `gift_product_id INTEGER`: ID sản phẩm quà tặng (nếu `NULL` $\to$ tặng chính sản phẩm mua).
  - `gift_qty REAL DEFAULT 1`: Số lượng quà tặng (ví dụ: 1).
  - `is_multiply INTEGER DEFAULT 1`: Cờ cho phép nhân lũy tiến (1 = có, 0 = không).

### B. Backend API (`routers/promotions.py`)
- Mở rộng API tạo/sửa khuyến mãi nhận loại `buy_x_get_y`.
- Endpoint `GET /api/promotions/active`: Trả về danh sách các chương trình khuyến mãi đang chạy (bao gồm cả discount và buy_x_get_y) để frontend POS nạp vào cache.

### C. Giao Diện Quản Lý Khuyến Mãi (`templates/index.html`)
- Trong modal tạo/sửa khuyến mãi, thêm lựa chọn:
  - Loại chương trình: `Giảm giá (% / Tiền mặt)` hoặc `🎁 Mua X Tặng Y`.
- Khi chọn `Mua X Tặng Y`:
  - Chọn sản phẩm cần mua + nhập số lượng $X$.
  - Chọn hình thức tặng: `Tặng cùng loại` hoặc `Tặng quà khác` (hiện chọn sản phẩm quà) + nhập số lượng $Y$.
  - Checkbox: `Nhân lũy tiến theo số lượng mua`.

### D. Engine POS Tự Động (`static/js/pos.js`)
- Khi cập nhật giỏ hàng (`renderCart` / `calculateCartSummary`):
  - Quét giỏ hàng qua danh sách quy tắc `buy_x_get_y` đang active.
  - Tự động thêm/cập nhật dòng sản phẩm quà tặng có cờ `is_gift: true`, `price: 0`, `original_price: giá gốc`.
  - Nếu số lượng mua giảm dưới điều kiện $\to$ tự động xóa dòng quà tặng.
  - Khi lưu đơn hàng (`POST /api/orders`): Dòng quà tặng được lưu với `price = 0`, tồn kho bị trừ đúng thực tế.

---

## 3. Kế Hoạch Kiểm Thử
1. Test DB schema migration: Khởi tạo/cập nhật các cột mới cho `promotions` và `promotion_items`.
2. Test API tạo chương trình Buy X Get Y: Mua 10 tặng 1 cùng loại & Mua 10 tặng 1 khác loại.
3. Test Logic tính quà tặng: Giỏ hàng 9 cái $\to$ 0 quà; 10 cái $\to$ 1 quà; 25 cái $\to$ 2 quà.
4. Test Đơn hàng POS: Đơn hàng tạo ra ghi nhận đúng doanh thu 10 món, trừ kho đúng 11 món (hoặc 10 món A + 1 món B).

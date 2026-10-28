# Bảng Giá, Khuyến Mãi, Tích Điểm & Topup Ví Spa Specification

- **Mục tiêu:** Xây dựng hệ thống quản lý Khách hàng thân thiết toàn diện: Bảng giá riêng theo phân hạng, Chương trình khuyến mãi theo nguyên tắc Best Offer, Tích điểm thăng hạng tự động (loại trừ Đại lý/Sỉ), và Ví nạp Topup trả trước chuyên biệt cho Dịch vụ Spa.
- **Ngày:** 2026-09-24
- **Trạng thái:** Approved by User

---

## 1. Cấu Trúc Dữ Liệu (Database Schema)

### 1.1 Khách hàng (`contacts`)
- Bổ sung cột:
  - `points` INTEGER DEFAULT 0: Điểm tích lũy trọn đời (chỉ tăng, dùng xét thăng hạng).
  - `spa_wallet_balance` REAL DEFAULT 0: Số dư ví trả trước Topup (chỉ tiêu cho Spa).

### 1.2 Phân loại khách hàng (`customer_segments`)
- Bổ sung / chuẩn hóa cột:
  - `min_points` INTEGER DEFAULT 0: Mốc điểm tối thiểu để tự động thăng hạng.
  - `allow_points` INTEGER DEFAULT 1: 1 = Cho phép tích điểm (Khách lẻ/Thành viên), 0 = Không tích điểm (Đại lý/Sỉ).
  - `price_list_id` INTEGER: Bảng giá ưu đãi tự động kích hoạt khi khách đạt phân hạng này.

### 1.3 Gói Topup Ví Spa định sẵn (`topup_packages`)
- Bảng mới:
  - `id` INTEGER PRIMARY KEY AUTOINCREMENT
  - `name` TEXT NOT NULL (Ví dụ: Gói Spa Đồng 500k)
  - `pay_amount` REAL NOT NULL (Số tiền khách thực nộp, VD: 500.000 đ)
  - `receive_amount` REAL NOT NULL (Giá trị nạp vào ví spa, VD: 700.000 đ)
  - `is_active` INTEGER DEFAULT 1
  - `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

### 1.4 Lịch sử ví Topup Spa (`spa_wallet_transactions`)
- Bảng mới:
  - `id` INTEGER PRIMARY KEY AUTOINCREMENT
  - `contact_id` INTEGER NOT NULL
  - `order_id` INTEGER (Nullable, nếu là trừ tiền bill)
  - `package_id` INTEGER (Nullable, nếu là nạp theo gói)
  - `type` TEXT NOT NULL CHECK(type IN ('topup', 'spend', 'refund'))
  - `amount` REAL NOT NULL
  - `balance_before` REAL NOT NULL
  - `balance_after` REAL NOT NULL
  - `note` TEXT
  - `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

### 1.5 Khuyến mãi (`promotions` & `promotion_items`)
- Bảng `promotions`: `id, code, name, start_date, end_date, is_active, created_at`
- Bảng `promotion_items`: `id, promotion_id, product_id, discount_type ('pct' | 'fixed'), discount_val, created_at`

---

## 2. Nguyên Tắc Tính Giá (Best Offer - Mức Giảm Cao Nhất)

- Khi đưa sản phẩm vào giỏ hàng POS:
  1. $P_{gốc}$: Giá niêm yết trong bảng `products`.
  2. $P_{hạng}$: Giá theo `price_lists` gắn với phân hạng của khách (hoặc tính theo `%` chiết khấu của hạng). Mức giảm: $D_{hạng} = P_{gốc} - P_{hạng}$.
  3. $P_{km}$: Giá theo chương trình khuyến mãi đang hoạt động (`promotions`). Mức giảm: $D_{km} = P_{gốc} - P_{km}$.
  4. Quy tắc chốt giá: Chọn mức giảm lớn nhất:
     $$Giá\_Bán = \min(P_{hạng}, P_{km})$$
  *(Không cộng dồn chiết khấu phân hạng và khuyến mãi).*

---

## 3. Tích Điểm & Tự Động Thăng Hạng

- **Cấu hình:** Cài đặt tỷ lệ quy đổi (VD: `points_exchange_rate = 10000`, tức 10.000 đ = 1 điểm).
- **Khi thanh toán:**
  - Nếu khách có `allow_points == 1`:
    - Tính điểm nhận được: `new_points = floor(paid_amount / points_exchange_rate)`.
    - Cộng vào tổng điểm trọn đời: `contacts.points += new_points`.
  - Nếu khách là Đại lý/Sỉ (`allow_points == 0`): Không tích điểm.
- **Thăng hạng tự động:**
  - Kiểm tra `customer_segments` có `min_points <= contacts.points` và `allow_points == 1`.
  - Lấy hạng cao nhất (theo `min_points`), nếu khác hạng hiện tại thì cập nhật `contact.segment_id = new_segment.id`.

---

## 4. Quản Lý & Tiêu Ví Topup Spa

1. **Nạp Topup tại POS:**
   - Chọn khách hàng -> Chọn Gói Topup định sẵn.
   - Thu ngân thu `pay_amount`, tạo giao dịch thu tiền vào sổ quỹ/ca làm việc.
   - Cộng `receive_amount` vào `spa_wallet_balance` của khách.
   - Ghi log vào `spa_wallet_transactions`.
2. **Thanh toán dịch vụ bằng Topup:**
   - Tách tổng hóa đơn thành:
     - $T_{spa}$: Tổng tiền các item dịch vụ Spa (`type == 'service'`).
     - $T_{hàng\_hóa}$: Tổng tiền các item hàng hóa bán lẻ (`type == 'product'`).
   - Tiền trừ từ ví Topup: $U = \min(contacts.spa\_wallet\_balance, T_{spa})$.
   - Tiền còn lại khách phải thanh toán bằng Tiền mặt / CK:
     $$Tiền\_Cần\_Thanh\_Toán = (T_{spa} - U) + T_{hàng\_hóa}$$
   - Khấu trừ `contacts.spa_wallet_balance -= U`, ghi log giao dịch chi ví Spa.

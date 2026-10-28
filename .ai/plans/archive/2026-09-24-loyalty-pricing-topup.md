# Implementation Plan: Bảng Giá, Khuyến Mãi, Tích Điểm & Topup Ví Spa

> **Goal:** Xây dựng module Bảng giá theo phân hạng, Khuyến mãi (Best offer), Tích điểm thăng hạng tự động, và Ví trả trước Topup Spa.

---

### Task 1: Migration Cơ Sở Dữ Liệu & Seeds
- Cập nhật bảng `contacts`: thêm `points`, `spa_wallet_balance`.
- Cập nhật bảng `customer_segments`: thêm `min_points`, `allow_points`, `price_list_id`.
- Tạo mới bảng `topup_packages`, `spa_wallet_transactions`, `promotions`, `promotion_items`.
- Seed dữ liệu mẫu cho các gói Topup và cấu hình tỷ lệ điểm.
- Test: `tests/test_loyalty_schema.py`.

### Task 2: Backend API Bảng Giá, Khuyến Mãi & Best Offer Pricing
- Tạo router `routers/promotions.py` (CRUD chương trình khuyến mãi).
- Nâng cấp API tính giá POS hoặc helper `get_effective_price(product_id, customer_id)` áp dụng quy tắc Best Offer $\min(P_{hạng}, P_{km})$.
- Test: `tests/test_best_offer_pricing.py`.

### Task 3: Backend API Tích Điểm & Tự Động Thăng Hạng
- Trong endpoint thanh toán đơn hàng `/api/orders`:
  - Kiểm tra điều kiện `allow_points`.
  - Cộng điểm `contacts.points` và kích hoạt thăng hạng tự động khi vượt `min_points`.
- Test: `tests/test_points_and_tier_upgrade.py`.

### Task 4: Backend API Nạp & Khấu Trừ Ví Topup Spa
- Router `routers/topup.py`:
  - `POST /api/topup/recharge`: Nạp tiền theo gói, cộng số dư, ghi nhận doanh thu ca.
  - Tích hợp logic khấu trừ ví khi thanh toán đơn hàng: chỉ khấu trừ cho item `service`, số dư còn lại thanh toán bằng tiền mặt/CK.
- Test: `tests/test_spa_wallet_topup.py`.

### Task 5: Giao Diện Frontend POS & Cài Đặt
- **Màn hình POS (`pos.js`):**
  - Hiển thị số dư Ví Spa và Điểm tích lũy khi chọn khách hàng.
  - Nút/Modal "Nạp Ví Spa" nhanh tại quầy (chọn gói 500k -> 700k).
  - Tự động tick và tính phần tiền khấu trừ từ Ví Spa cho các dịch vụ spa trong giỏ hàng.
- **Cài đặt (`app.js` & `index.html`):**
  - Quản lý các Gói Topup định sẵn.
  - Quản lý Chương trình khuyến mãi.
  - Cấu hình mốc điểm thăng hạng và bật/tắt tích điểm theo phân loại khách hàng.

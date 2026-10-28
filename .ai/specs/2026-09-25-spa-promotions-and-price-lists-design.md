# SPEC: Khuyến Mãi & Bảng Giá Áp Dụng Cho Dịch Vụ Spa (Pet Services)

**Ngày lập:** 2026-09-25  
**Dự án:** POS Offline PetCare  
**Trạng thái:** Approved by User  

---

## 1. Mục Tiêu & Phạm Vi
- Mở rộng hệ thống **Bảng Giá** và **Chương Trình Khuyến Mãi (Best Offer)** để áp dụng cho cả Dịch Vụ Spa thú cưng (`pet_service_pricing`).
- Giữ nguyên cấu trúc dữ liệu dịch vụ tách biệt (79 mức giá theo cân nặng), KHÔNG đưa vào bảng hàng hóa `products`.
- Trung tâm quản lý duy nhất đặt tại Tab **Bảng Giá & Khuyến Mãi (`tab-price-lists`)**.
- Cho phép áp dụng ưu đãi theo **Tên Gói Dịch Vụ** (VD: *CB Tắm (1+2+3)*, *Nhuộm*) hoặc theo **Nhóm Dịch Vụ** (VD: *Dịch Vụ Lẻ Chó*, *Spa Mèo*).
- Tự động tính giá Best Offer $P_{final} = \min(P_{gốc}, P_{hạng}, P_{km})$ khi lập phiếu dịch vụ Spa (`pet_service_tickets`) dựa trên cân nặng thực tế của thú cưng.

---

## 2. Cơ Sở Dữ Liệu (Database Schema)

### 2.1. Mở rộng bảng `promotion_items`
Bổ sung các cột (hỗ trợ cả hàng hóa bán lẻ lẫn dịch vụ Spa):
- `target_type TEXT DEFAULT 'product'`: Nhận `'product'`, `'spa_service'`, `'spa_category'`.
- `product_id INTEGER NULL`: ID hàng hóa (khi target_type = 'product').
- `service_name TEXT NULL`: Tên gói dịch vụ trong `pet_service_pricing` (khi target_type = 'spa_service').
- `spa_category TEXT NULL`: Nhóm dịch vụ trong `pet_service_pricing` (khi target_type = 'spa_category').
- `discount_type TEXT`: `'pct'` hoặc `'fixed'`.
- `discount_val REAL`: Mức giảm.

### 2.2. Bảng mới `price_list_spa_items`
Lưu mức chiết khấu dịch vụ Spa theo từng Bảng giá:
```sql
CREATE TABLE IF NOT EXISTS price_list_spa_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    price_list_id INTEGER NOT NULL,
    target_type TEXT NOT NULL, -- 'service' hoặc 'category'
    service_name TEXT,
    spa_category TEXT,
    discount_percent REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE
);
```

---

## 3. Backend Logic & APIs

### 3.1. Helper Tính Giá Spa Best Offer (`routers/promotions.py`)
Hàm `calculate_effective_spa_price(service_name, weight, customer_id=None, db=None)`:
1. $P_{gốc}$: Tìm giá trong `pet_service_pricing` khớp `service_name` và `min_weight <= weight < max_weight`.
2. $P_{hạng}$: Dựa vào khách hàng -> phân khúc -> `price_list_id` -> bảng `price_list_spa_items` (hoặc % giảm phân khúc).
3. $P_{km}$: Quét các `promotions` đang chạy (`is_active=1`, trong thời gian hiệu lực), khớp theo `service_name` hoặc `spa_category`.
4. $P_{final} = \min(P_{gốc}, P_{hạng}, P_{km})$. Trả về:
   - `service_name`, `weight`
   - `base_price`, `final_price`, `discount_applied`
   - `applied_source` (`'original'`, `'price_list'`, `'promotion'`)
   - `promo_id`, `price_list_id`

### 3.2. Endpoints
- `POST /api/pricing/calculate-spa`: Tính giá Spa Best Offer theo gói và cân nặng.
- `POST /api/promotions/{id}/items/spa`: Thêm dịch vụ/nhóm dịch vụ Spa vào CTKM.
- `POST /api/price-lists/{id}/spa-items`: Thêm chiết khấu dịch vụ/nhóm dịch vụ Spa vào Bảng giá.
- `GET /api/price-lists/{id}/spa-items`: Danh sách chiết khấu Spa trong Bảng giá.
- `DELETE /api/price-lists/{id}/spa-items/{item_id}`: Xóa chiết khấu Spa khỏi Bảng giá.

---

## 4. Giao Diện Người Dùng (UI / UX)

### 4.1. Modal Quản Lý SP Trong Khuyến Mãi (`#modal-promotion-items`)
- Bổ sung 2 Subtab/Pill: **[📦 Hàng Hóa Bán Lẻ]** và **[💆 Dịch Vụ Spa]**.
- Tab Spa: Cho phép chọn **Theo Tên Gói Dịch Vụ** hoặc **Theo Nhóm Dịch Vụ Spa**, chọn giảm `%` hoặc `tiền mặt (đ)`.
- Bảng danh sách mục khuyến mãi hiển thị rõ tag `[Hàng hóa]` hoặc `[Dịch vụ Spa]`.

### 4.2. Tab Bảng Giá (`tab-price-lists`)
- Subtab Ma Trận Giá: Bổ sung toggle xem **Ma Trận Hàng Hóa** / **Ma Trận Dịch Vụ Spa**.
- Cấu hình giảm nhanh theo nhóm Spa hoặc đặt chiết khấu % theo từng gói Spa.

### 4.3. Form Tiếp Nhận Phiếu Spa (`#modal-create-service-ticket`)
- Khi chọn Thú cưng (có cân nặng) và chọn Gói dịch vụ:
  - Hệ thống tự động gọi API tính giá Best Offer.
  - Hiển thị trực quan: `Giá gốc: 150.000 đ` $\rightarrow$ `Giá sau ưu đãi (KM / Hạng KH): 120.000 đ (Tiết kiệm 30.000 đ)`.

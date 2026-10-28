# Instant Multi-Tier Pet Spa Auto-Pricing Design

## 1. Problem Statement
Trong modal Tiếp Nhận Dịch Vụ Spa (`#modal-create-service-ticket`), người dùng nhập số kg và chọn gói dịch vụ chính nhưng số tiền ở Cột 2 không tự động nhảy hoặc nhảy sai giá vì:
- Tên dịch vụ bị lệch hoa/thường (ví dụ `Combo Vip 1` vs `Combo vip 1`).
- Điều kiện SQL dải cân nặng giáp ranh chưa linh hoạt và không xử lý được trường hợp cân nặng vượt khung tối đa.
- Phụ thuộc hoàn toàn vào round-trip API mạng gây độ trễ; nếu bảng giá chưa kịp nạp xong thì giá vẫn giữ 0 đ.

## 2. Technical Architecture

### 2.1 Backend (`routers/promotions.py`)
- Cập nhật hàm `calculate_effective_spa_price`:
  - So khớp `LOWER(TRIM(service_name)) = LOWER(TRIM(?))` (hoặc `COLLATE NOCASE`) để không bị lỗi chữ hoa/thường.
  - Sửa logic tìm dải cân nặng theo thứ tự ưu tiên:
    1. Tìm chính xác trong khoảng: `min_weight <= weight AND (max_weight >= weight OR max_weight = 0 OR max_weight IS NULL)`.
    2. Nếu cân nặng vượt trần khung cao nhất: Tự động lấy khung có `max_weight` lớn nhất của dịch vụ đó.
    3. Nếu cân nặng nhỏ hơn khung thấp nhất: Lấy khung có `min_weight` nhỏ nhất.
  - Áp dụng tiếp chiết khấu phân khúc khách hàng hoặc chương trình khuyến mãi (nếu có).

### 2.2 Frontend (`static/js/modules/spa.js`)
- Đảm bảo `allPetPricingData` luôn được nạp sẵn khi mở modal hoặc tự động fetch nếu chưa có.
- Cập nhật hàm `autoCalculateServicePrice()`:
  - **Tầng 1 (0ms Instant Client-Side Lookup)**:
    - Tìm ngay lập tức trong mảng `allPetPricingData` theo tên dịch vụ (không phân biệt hoa/thường) và cân nặng.
    - Cập nhật ngay các trường hiển thị tiền: Giá dịch vụ chính (`svc-base-price-display`), Tổng phụ thu (`svc-surcharges-total-display`), Tổng cộng (`svc-total-price-display`, `svc-total-price`).
    - Người dùng gõ đến đâu, tiền nhảy tức thì đến đó (0ms).
  - **Tầng 2 (Async Best Offer & Discount Sync)**:
    - Gửi request `/api/pricing/calculate-spa` (kèm debounce 250ms khi gõ) để kiểm tra thêm chiết khấu thẻ VIP khách hàng.
    - Nếu có giá ưu đãi hơn, tự động cập nhật số tiền và hiển thị badge chiết khấu.

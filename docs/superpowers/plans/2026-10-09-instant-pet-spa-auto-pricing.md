# Implementation Plan: Instant Multi-Tier Pet Spa Auto-Pricing

## Overview
Cải tiến logic tính giá tiền Spa: tự động nhảy số tiền tức thì (0ms) khi nhập cân nặng hoặc chọn gói dịch vụ, hỗ trợ so khớp không phân biệt hoa thường và dải cân nặng thông minh.

## Tasks

- [ ] Task 1: Chuẩn hóa Backend `calculate_effective_spa_price` (`routers/promotions.py`)
  - So khớp `COLLATE NOCASE` cho `service_name`.
  - Logic dải cân nặng chuẩn: `min_weight <= weight AND (max_weight >= weight OR max_weight = 0 OR max_weight IS NULL)`.
  - Hỗ trợ fallback thông minh khi cân nặng vượt quá mức trần tối đa hoặc thấp hơn mức sàn.
  - Viết test suite `tests/test_spa_auto_pricing.py`.

- [ ] Task 2: Cải tiến Frontend `autoCalculateServicePrice` (`static/js/modules/spa.js`)
  - Viết hàm helper `findSpaPricingClientSide(serviceName, weight)`.
  - Nhảy số tiền ngay lập tức (0ms) từ dữ liệu `allPetPricingData`.
  - Tự động nạp bảng giá nếu chưa có dữ liệu.
  - Thêm debounce 250ms cho request API kiểm tra chiết khấu thẻ VIP khách hàng.

- [ ] Task 3: Chạy kiểm thử tự động toàn diện và xác minh
  - Chạy `pytest tests/test_spa_auto_pricing.py`.
  - Chạy toàn bộ test suites hiện có.
  - Rebuild `POS_Mastercare.exe`, commit & push.

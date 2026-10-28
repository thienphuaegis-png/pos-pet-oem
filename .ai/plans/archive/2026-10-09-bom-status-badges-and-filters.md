# Implementation Plan: BOM Status Badges & Quick Filter Pills

## Overview
Làm nổi bật các sản phẩm đã có công thức BOM và chưa có BOM bằng badge trực quan và bổ sung 3 nút tab lọc nhanh trạng thái BOM.

## Tasks

- [ ] Task 1: Bổ sung trường `bom_count` vào API `GET /api/products` (`routers/products.py`)
  - Thêm subquery `(SELECT COUNT(*) FROM product_bom pb WHERE pb.product_id = p.id) as bom_count` vào `list_products`.
  - Viết test suite `tests/test_bom_status_badges.py` kiểm tra `bom_count` trả về từ API.

- [ ] Task 2: Cập nhật giao diện HTML cho bộ nút lọc nhanh trạng thái BOM (`templates/index.html`)
  - Bổ sung cụm filter pills trên ô tìm kiếm sản phẩm: Tất cả, Đã có BOM, Chưa có BOM.

- [ ] Task 3: Cập nhật logic Javascript hiển thị badge và lọc danh sách (`static/js/modules/productions.js`)
  - Viết hàm `setBOMStatusFilter(status)`, `updateBOMFilterCounts()`.
  - Cập nhật `filterBOMProductDropdown()` render badge `⚡ Đã có BOM (X tp)` và `⚪ Chưa có BOM`.
  - Cập nhật tự động số lượng khi lưu/xóa/sao chép BOM.

- [ ] Task 4: Chạy kiểm thử tự động toàn diện và xác minh
  - Chạy `pytest tests/test_bom_status_badges.py`.
  - Chạy toàn bộ test suites hiện có.

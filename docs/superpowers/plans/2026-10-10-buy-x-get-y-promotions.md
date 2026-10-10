# Implementation Plan: Khuyến Mãi Mua X Tặng Y (Buy X Get Y)

**Goal:** Thêm tính năng tạo chương trình khuyến mãi Mua X Tặng Y (cùng loại hoặc khác loại quà tặng), tích hợp tự động tặng quà giá 0đ tại quầy POS và trừ kho đầy đủ.

**Architecture:**
- DB: Thêm cột `type` vào `promotions`, thêm `buy_qty`, `gift_product_id`, `gift_qty`, `is_multiply` vào `promotion_items`.
- Backend: Cập nhật `routers/promotions.py` và `schemas.py` hỗ trợ tạo quy tắc Buy X Get Y.
- Frontend: Cập nhật modal khuyến mãi trong `templates/index.html`, cập nhật engine giỏ hàng POS trong `static/js/pos.js`.

---

### Task 1: Tạo Unit Test kiểm thử Buy X Get Y Backend & Schema
**Files:**
- Create: `tests/test_buy_x_get_y_promotions.py`

### Task 2: Cập Nhật Schema & Database Migration
**Files:**
- Modify: `database.py` (Thêm migration cho bảng `promotions` và `promotion_items`)
- Modify: `schemas.py` (Cập nhật Pydantic models cho chương trình KM)

### Task 3: Backend API Quản Lý & Truy Vấn Khuyến Mãi Buy X Get Y
**Files:**
- Modify: `routers/promotions.py` (Hỗ trợ lưu và query quy tắc Mua X Tặng Y)

### Task 4: Giao Diện Quản Lý Khuyến Mãi (Tạo / Sửa Mua X Tặng Y)
**Files:**
- Modify: `templates/index.html` (Thêm form chọn loại Mua X Tặng Y, chọn sản phẩm mua và quà tặng)

### Task 5: Tích Hợp Tự Động Vào Màn Hình Bán Hàng POS
**Files:**
- Modify: `static/js/pos.js` (Tự động phát hiện điều kiện giỏ hàng, chèn dòng quà tặng đơn giá 0đ, trừ kho chính xác)

### Task 6: Chạy Toàn Bộ Kiểm Thử & Kiểm Tra Hồi Quy
**Files:**
- Test: `tests/test_buy_x_get_y_promotions.py`
- Test: Toàn bộ suite test khuyến mãi & POS

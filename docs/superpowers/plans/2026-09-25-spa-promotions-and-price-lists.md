# Kế Hoạch Triển Khai: Khuyến Mãi & Bảng Giá Cho Dịch Vụ Spa

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans.

**Goal:** Mở rộng hệ thống Khuyến Mãi (Best Offer) và Bảng Giá để áp dụng cho cả Dịch Vụ Spa thú cưng (`pet_service_pricing`), quản lý tập trung tại Tab Bảng Giá & Khuyến Mãi mà không làm ô nhiễm danh mục hàng hóa bán lẻ.

**Architecture:** Bảng `promotion_items` được mở rộng cột `target_type`, `service_name`, `spa_category`; tạo bảng mới `price_list_spa_items`. Hàm lõi `calculate_effective_spa_price` tính Best Offer tự động theo cân nặng thú cưng. Frontend bổ sung tab dịch vụ Spa trong modal khuyến mãi và ma trận bảng giá. Form tiếp nhận Spa tự động hiển thị giá sau ưu đãi.

**Tech Stack:** FastAPI, SQLite, Pydantic, TailwindCSS, Vanilla JS, Pytest.

---

## File Structure Map

| File | Hành động | Mục đích |
|---|---|---|
| `database.py` | Modify | Thêm auto-migration cho `promotion_items` & tạo bảng `price_list_spa_items` |
| `schemas.py` | Modify | Bổ sung Pydantic schemas cho Promotion Spa Item & Price List Spa Item |
| `routers/promotions.py` | Modify | Hàm `calculate_effective_spa_price`, endpoint tính giá & CRUD items Spa cho KM |
| `routers/price_lists.py` | Modify | CRUD endpoints cho `price_list_spa_items` |
| `routers/partners.py` | Modify | Tiếp nhận phiếu Spa (`POST /api/pet-services`) tự động lấy giá Best Offer |
| `templates/index.html` | Modify | UI subtab/toggle Spa trong modal Khuyến Mãi, Bảng Giá và Form tạo phiếu Spa |
| `static/js/app.js` | Modify | JS gọi API tính giá Best Offer cho Spa khi chọn Pet & dịch vụ |
| `tests/test_spa_promotions_and_pricing.py` | Create | Test suite kiểm thử toàn diện Database, API tính giá Best Offer Spa và UI |

---

### Task 1: Schema Migration & Database Update
**Files:**
- Modify: `database.py`
- Modify: `schemas.py`
- Test: `tests/test_spa_promotions_and_pricing.py`

- [ ] **Step 1: Viết test cho schema và bảng mới**
- [ ] **Step 2: Chạy test để xác nhận FAIL**
- [ ] **Step 3: Cập nhật `database.py` (auto-migration) và `schemas.py`**
- [ ] **Step 4: Chạy test để xác nhận PASS**

---

### Task 2: Backend Logic Best Offer & APIs Cho Spa
**Files:**
- Modify: `routers/promotions.py`
- Modify: `routers/price_lists.py`
- Modify: `routers/partners.py`
- Test: `tests/test_spa_promotions_and_pricing.py`

- [ ] **Step 1: Viết test case tính giá Best Offer Spa: so sánh giá gốc vs khuyến mãi vs bảng giá phân hạng**
- [ ] **Step 2: Chạy test để xác nhận FAIL**
- [ ] **Step 3: Triển khai `calculate_effective_spa_price`, các API thêm/xóa mục KM Spa và chiết khấu Bảng giá Spa**
- [ ] **Step 4: Cập nhật endpoint tiếp nhận phiếu Spa áp dụng giá Best Offer**
- [ ] **Step 5: Chạy test để xác nhận PASS**

---

### Task 3: Giao Diện Người Dùng & Tích Hợp Frontend
**Files:**
- Modify: `templates/index.html`
- Modify: `static/js/app.js`
- Test: `tests/test_html_integrity.py` & `tests/test_spa_promotions_and_pricing.py`

- [ ] **Step 1: Bổ sung giao diện chọn Hàng Hóa / Dịch Vụ Spa trong `#modal-promotion-items`**
- [ ] **Step 2: Bổ sung giao diện cài chiết khấu Dịch vụ Spa trong Bảng Giá**
- [ ] **Step 3: Cập nhật Form tiếp nhận phiếu Spa (`#modal-create-service-ticket`) tự động hiển thị giá KM**
- [ ] **Step 4: Viết các hàm JS xử lý nạp danh mục Spa, thêm KM Spa và tính giá tức thì**
- [ ] **Step 5: Chạy toàn bộ test suite và kiểm tra cú pháp JS**

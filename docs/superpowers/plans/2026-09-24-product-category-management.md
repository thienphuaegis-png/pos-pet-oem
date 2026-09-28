# Product Category Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Triển khai tính năng quản lý Nhóm Hàng Hóa tái sử dụng (KiotViet-style 1 cấp), bao gồm bảng DB `product_categories`, API CRUD đồng bộ tên sản phẩm, nút thêm nhanh `[+]` trong modal sản phẩm, thanh lọc ngang (Pills) và modal Quản lý Nhóm hàng hiện đại.

**Architecture:** 
- Backend: SQLite table `product_categories`, router `routers/categories.py` với các endpoint CRUD và đồng bộ tên danh mục vào `products.category`.
- Frontend: Cập nhật `#modal-product` với nút tạo nhanh `[+]`, bổ sung modal `#modal-category-manager` cho phép sửa/xóa nhóm, tích hợp thanh lọc ngang (Pills) trong tab Hàng Hóa / Tồn Kho.

**Tech Stack:** Python 3.11, FastAPI, SQLite, Vanilla JS, Tailwind CSS, Pytest.

---

## File Structure Map

| File | Responsibility |
|---|---|
| `database.py` | Create table `product_categories`, auto-migrate existing categories from `products` |
| `routers/categories.py` | CRUD endpoints cho categories, đồng bộ tên sang `products` |
| `server.py` | Đăng ký router `categories.py` |
| `templates/index.html` | Thêm modal `#modal-category-manager`, nút `[+]` cạnh select nhóm hàng, thanh lọc pills |
| `static/js/app.js` | Hàm gọi API categories, render danh sách nhóm, thêm nhanh, sửa/xóa nhóm, lọc pill |
| `tests/test_categories_api.py` | Kiểm thử tự động API categories và luồng đồng bộ tên |

---

### Task 1: Database Table & Migration

**Files:**
- Modify: `database.py`

**Tasks:**
- Tạo bảng `product_categories (id, name UNIQUE, description, sort_order, created_at)`.
- Viết logic tự động chèn các nhóm mặc định (`Thức ăn`, `Phụ kiện`, `Vệ sinh`, `Thuốc & Thú y`, `Khác`) và chèn bất kỳ `category` nào đang tồn tại trong `products` vào `product_categories` nếu chưa có.

---

### Task 2: Backend Categories Router & Auto-Sync

**Files:**
- Create: `routers/categories.py`
- Modify: `server.py`
- Test: `tests/test_categories_api.py`

**Interfaces:**
- `GET /api/categories`: Trả về danh sách nhóm kèm `product_count`.
- `POST /api/categories`: Tạo nhóm mới, kiểm tra trùng lặp `name`.
- `PUT /api/categories/{id}`: Đổi tên nhóm và chạy SQL `UPDATE products SET category = :new_name WHERE category = :old_name`.
- `DELETE /api/categories/{id}`: Chặn xóa nhóm "Khác"; với nhóm khác, chạy SQL `UPDATE products SET category = 'Khác' WHERE category = :old_name` rồi xóa nhóm.

---

### Task 3: Modal Thêm Nhanh & Dropdown Danh Mục

**Files:**
- Modify: `templates/index.html`
- Modify: `static/js/app.js`

**Tasks:**
- Chuyển ô nhập nhóm hàng trong `#modal-product` thành dropdown `<select id="modal-prod-category">` kèm nút `[+]` kế bên.
- Viết popup mini nhập nhanh tên nhóm, gọi `POST /api/categories`, reload dropdown và tự động chọn nhóm vừa tạo.

---

### Task 4: Modal Quản Lý Nhóm & Thanh Lọc Pills

**Files:**
- Modify: `templates/index.html`
- Modify: `static/js/app.js`

**Tasks:**
- Thêm modal `#modal-category-manager` hiển thị danh sách nhóm, nút đổi tên và xóa nhóm.
- Thêm thanh lọc ngang (Category Pills) trên tab Hàng Hóa / Tồn Kho Tổng Hợp để lọc nhanh sản phẩm theo nhóm.

---

### Task 5: Kiểm Thử Toàn Diện & Verification

**Files:**
- Run: `pytest tests/test_categories_api.py`
- Run: `pytest tests/test_html_integrity.py`
- Check: JS syntax check qua `node -c`.

# Bảng Giá Sản Phẩm & Phân Loại Khách Hàng — Implementation Plan

> **Goal:** Mỗi sản phẩm có nhiều bảng giá (4–5), chủ động tạo & quản lý bảng giá, phân loại khách hàng theo nhóm để áp giá tự động.

**Architecture:** Thêm 3 bảng mới (price_lists, product_price_list, customer_segments), mở rộng contacts.column, tạo router riêng `price_lists.py`, update schema & frontend.

**Tech Stack:** FastAPI + SQLite (hiện tại), Python 3.11

## Global Constraints
- Follow đúng pattern hiện có: `routers/<module>.py`, `database.py:init_db()`, `schemas.py` Pydantic models
- Không sửa cấu trúc bảng hiện tại gây mất dữ liệu — dùng `ALTER TABLE ... ADD COLUMN` với migration check
- Giá mặc định theo bảng giá chính (giống `cost_price` / `sell_price` hiện tại)

---

## File Map

| File | Responsibility |
|---|---|
| `database.py` | Thêm 3 bảng mới + migration column `contacts.segment_id` |
| `schemas.py` | Pydantic models cho PriceList, ProductPrice, CustomerSegment |
| `routers/price_lists.py` | CRUD bảng giá, CRUD giá sản phẩm theo bảng giá, CRUD phân loại KH |
| `server.py` | Register `price_lists_router` |
| `templates/index.html` | UI quản lý bảng giá + gán giá theo sản phẩm + phân loại KH |
| `static/js/app.js` | Hàm fetch/render bảng giá, modal gán giá |

---

## Tasks

### Task 1: Schema — 3 bảng mới + migration contacts

**Files:**
- Modify: `database.py:init_db()` (thêm sau khối settings hiện tại)

**Interfaces:**
- Tạo `price_lists`: id, code, name, description, is_active, created_at
- Tạo `product_price_list`: id, product_id, price_list_id, price, min_qty, discount_percent
- Tạo `customer_segments`: id, code, name, discount_percent, priority, is_active
- ALTER `contacts` ADD COLUMN `segment_id` (nullable, FK → customer_segments)
- Migration check: nếu column chưa tồn tại thì mới ALTER

- [ ] **Step 1: Thêm CREATE TABLE IF NOT EXISTS cho 3 bảng**
- [ ] **Step 2: Thêm migration check + ALTER contacts ADD COLUMN**
- [ ] **Step 3: Insert default price list "Giá bán lẻ" + default segment "Bán lẻ"**

### Task 2: Schemas Pydantic

**Files:**
- Modify: `schemas.py`

**Interfaces:**
- `PriceListCreate/Update`, `ProductPriceCreate/Update`, `CustomerSegmentCreate/Update`
- Response models có kèm tên bảng giá / tên segment

- [ ] **Step 1: Viết 6 Pydantic model (Create/Update cho mỗi loại)**
- [ ] **Step 2: Verify import trong router không circular**

### Task 3: Router — Price Lists & Customer Segments

**Files:**
- Create: `routers/price_lists.py`
- Modify: `server.py` (thêm `include_router`)

**Interfaces:**
- `GET /api/price-lists` — danh sách bảng giá (có kèm số sản phẩm trong mỗi bảng)
- `POST /api/price-lists` — tạo bảng giá
- `PUT /api/price-lists/<id>` — sửa
- `DELETE /api/price-lists/<id>` — xóa (chỉ xóa khi chưa gán sản phẩm)
- `GET /api/price-lists/<id>/products` — sản phẩm trong bảng giá đó
- `POST /api/price-lists/<id>/products` — gán giá sản phẩm vào bảng giá
- `PUT /api/price-lists/<id>/products/<product_id>` — sửa giá
- `DELETE /api/price-lists/<id>/products/<product_id>` — bỏ gán
- `GET /api/customer-segments` — danh sách phân loại KH
- `POST/PUT/DELETE /api/customer-segments/<id>` — CRUD phân loại
- `GET /api/contacts?segment_id=X` — lọc KH theo phân loại

- [ ] **Step 1: Viết CRUD price_lists (4 endpoint)**
- [ ] **Step 2: Viết CRUD product_price_list (4 endpoint)**
- [ ] **Step 3: Viết CRUD customer_segments (4 endpoint)**
- [ ] **Step 4: Register router trong server.py**

### Task 4: Frontend — UI Quản lý Bảng Giá

**Files:**
- Modify: `templates/index.html`
- Modify: `static/js/app.js`

**Interfaces:**
- Thêm tab/subtab "Bảng Giá" trong sidebar
- Table quản lý bảng giá: tên, code, số SP, trạng thái, action (sửa/xóa)
- Modal tạo/sửa bảng giá
- Bảng gán giá theo sản phẩm: chọn SP → nhập giá theo bảng giá → lưu
- Hiển thị giá khi chọn KH thuộc phân loại cụ thể (tự động áp giá theo segment)

- [ ] **Step 1: Thêm menu "Bảng Giá" trong sidebar nav**
- [ ] **Step 2: Viết HTML bảng quản lý + modal tạo/sửa**
- [ ] **Step 3: Viết JS fetch/render bảng giá + gán giá sản phẩm**
- [ ] **Step 4: Hiển thị giá theo phân loại KH khi bán hàng**

### Task 5: Frontend — UI Phân Loại Khách Hàng

**Files:**
- Modify: `templates/index.html`
- Modify: `static/js/app.js`

**Interfaces:**
- Modal/Tab phân loại KH trong mục Đối Tác
- Dropdown chọn phân loại khi tạo/sửa khách hàng
- Lọc danh sách KH theo phân loại
- Tự động áp bảng giá mặc định theo phân loại

- [ ] **Step 1: Thêm trường phân loại vào modal khách hàng**
- [ ] **Step 2: Viết JS fetch/render dropdown segment**
- [ ] **Step 3: Filter KH theo segment + auto-apply price list**

### Task 6: Test & Verify

**Files:**
- Manual test qua UI `http://127.0.0.1:8999`

**Interfaces:**
- Tạo 4–5 bảng giá, gán giá khác nhau cho cùng 1 sản phẩm
- Tạo 3–4 phân loại KH, gán KH vào phân loại
- Mua hàng: chọn KH → giá tự động đổi theo phân loại + bảng giá
- In hóa đơn: hiển thị đúng giá theo bảng giá đang áp

- [ ] **Step 1: Tạo bảng giá + gán giá SP, verify GET API trả đúng**
- [ ] **Step 2: Tạo phân loại KH, gán vào KH, verify filter**
- [ ] **Step 3: Flow mua hàng end-to-end: chọn KH → giá đúng → thanh toán**
- [ ] **Step 4: In hóa đơn verify giá đúng**

---

## Acceptance Criteria
1. Mỗi SP có tối thiểu 1, tối đa 5 mức giá theo bảng giá khác nhau
2. Tạo/xóa/sửa bảng giá không ảnh hưởng giá gốc của SP
3. KH thuộc phân loại A → tự động thấy giá bảng giá A
4. Đơn hàng bán hàng ghi nhận bảng giá & phân loại KH vào hóa đơn
5. In hóa đơn ra giá đúng theo bảng giá đã chọn

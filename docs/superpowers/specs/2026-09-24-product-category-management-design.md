# Thiết Kế: Quản Lý Nhóm Hàng Hóa Tái Sử Dụng (KiotViet-style 1 Cấp, Giao Diện Hiện Đại)

**Ngày:** 2026-09-24  
**Trạng thái:** Approved  

---

## 1. Mục Tiêu
Cho phép người dùng tạo, lưu trữ, chỉnh sửa và tái sử dụng các Nhóm Hàng Hóa (Product Categories) độc lập.
- Nhóm hàng hóa là 1 cấp (phẳng), không phân nhánh cha/con.
- Khi đổi tên nhóm: tự động đồng bộ tên mới cho toàn bộ sản phẩm thuộc nhóm đó.
- Khi xóa nhóm: các sản phẩm thuộc nhóm chuyển về nhóm mặc định "Khác".
- Tái sử dụng linh hoạt: chọn nhóm khi tạo sản phẩm, thêm nhanh nhóm bằng nút `[+]` ngay trong modal, lọc theo nhóm trên thanh filter hiện đại, áp dụng giảm giá hàng loạt theo nhóm trong Bảng Giá và Khuyến Mãi.

---

## 2. Kiến Trúc & Cơ Sở Dữ Liệu

### 2.1 Bảng `product_categories`
```sql
CREATE TABLE IF NOT EXISTS product_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.2 Tích hợp & Di trú (Migration)
- Khi khởi động ứng dụng: tạo bảng `product_categories` nếu chưa có.
- Tự động nạp các nhóm mặc định và gom các `category` đang có sẵn trong bảng `products` vào `product_categories` nếu chưa tồn tại.
- Bảng `products` duy trì cột `category TEXT DEFAULT 'Khác'`.

### 2.3 Backend API (`routers/categories.py`)
- `GET /api/categories`: Danh sách các nhóm kèm `product_count` (số lượng hàng hóa trong nhóm).
- `POST /api/categories`: Tạo mới nhóm hàng (chặn trùng lặp tên).
- `PUT /api/categories/{id}`: Sửa tên nhóm hàng và đồng bộ đổi tên hàng loạt trong `products.category`.
- `DELETE /api/categories/{id}`: Xóa nhóm hàng, chuyển toàn bộ `products.category` đang thuộc nhóm này về `'Khác'`.

---

## 3. Giao Diện Người Dùng (Modern & Clean UI)

### 3.1 Thanh Lọc Nhóm Ngang (Horizontal Category Pills)
- Đặt tại tab Quản lý Hàng hóa / Tồn kho tổng hợp (`#unified-inventory`).
- Danh sách nút bấm bo tròn (Pills): `Tất cả`, `Thức ăn (N)`, `Phụ kiện (N)`...
- Nút `[⚙️ Quản lý nhóm]` mở modal quản lý tập trung.

### 3.2 Modal Thêm / Sửa Hàng Hóa
- Dropdown `Nhóm hàng` load động từ `/api/categories`.
- Nút `[+]` nằm cạnh dropdown: mở popup mini nhập tên nhóm mới, lưu xong tự động chọn nhóm đó.

### 3.3 Modal Quản Lý Nhóm Hàng (`#modal-category-manager`)
- Bảng danh sách các nhóm hàng, số lượng sản phẩm.
- Hỗ trợ đổi tên trực tiếp và nút xóa nhóm có xác nhận an toàn.

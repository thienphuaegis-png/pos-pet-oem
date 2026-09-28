# Báo Cáo Task 4: Modal Quản Lý Nhóm & Thanh Lọc Pills

## 1. Tóm Tắt Công Việc
- Đã thêm thanh lọc pill nhóm hàng `#category-pills-bar` cùng nút `[⚙️ Quản lý nhóm]` trong tab Tồn Kho Tổng Hợp (`templates/index.html`).
- Đã thêm modal quản lý nhóm `#modal-category-manager` (Z-index 60, tiêu đề "⚙️ Quản Lý Nhóm Hàng Hóa", input thêm nhóm mới, danh sách nhóm kèm số lượng món và thao tác sửa/xóa, nút đóng). Nhóm "Khác" được bảo vệ không thể xóa (hiển thị nhãn "Mặc định").
- Đã triển khai các hàm JavaScript trong `static/js/app.js`:
  - `loadCategoryPillsBar()`: fetch `/api/categories`, tính tổng số món cho "Tất cả", render các pill với trạng thái active/inactive (`bg-emerald-600 text-white font-bold` / `bg-white border text-slate-700 hover:bg-slate-50`).
  - `filterUnifiedByCategory(categoryName)`: cập nhật biến filter hiện tại, đồng bộ với dropdown `#unified-category-filter`, re-render pill bar và bảng hàng hóa.
  - `openCategoryManagerModal()` & `closeCategoryManagerModal()`: hiển thị/ẩn modal quản lý nhóm và refresh pill/dropdown.
  - `renderCategoryManagerList()`: hiển thị danh sách nhóm, huy hiệu `product_count`, nút Sửa inline và Xóa (có xác nhận chuyển hàng về nhóm "Khác").
  - `saveCategoryFromManager()`: gọi `POST /api/categories`, refresh danh sách, pill bar và dropdowns.
  - `editCategoryInline(id, currentName)`: prompt đổi tên, gọi `PUT /api/categories/{id}`, đồng bộ lại bộ lọc và dữ liệu tồn kho.
  - `deleteCategory(id, name)`: confirm cảnh báo chuyển hàng hóa về "Khác", gọi `DELETE /api/categories/{id}`, đồng bộ lại bộ lọc và dữ liệu tồn kho.
  - Tích hợp `loadCategoryPillsBar()` vào luồng nạp tồn kho tổng hợp `loadUnifiedInventory()`.

## 2. File Đã Thay Đổi
- `templates/index.html`: Thêm container pill bar `#category-pills-bar`, nút mở quản lý nhóm và cấu trúc `#modal-category-manager`.
- `static/js/app.js`: Thêm biến `currentCategoryFilter`, các hàm xử lý pill bar, quản lý modal nhóm hàng hóa và liên kết bộ lọc với bảng tồn kho.

## 3. Kết Quả Kiểm Thử & Xác Minh
- `node -c static/js/app.js`: Pass (cú pháp hợp lệ, không lỗi).
- `pytest tests/test_html_integrity.py`: Pass (3/3 tests passed, cấu trúc DOM các tabs và cha con hợp lệ).
- `pytest tests/test_categories_api.py`: Pass (4/4 tests passed).

## 4. Tình Trạng
- Status: **DONE**

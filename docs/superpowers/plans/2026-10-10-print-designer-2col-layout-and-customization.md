# Implementation Plan: Đại Tu Trình Thiết Kế Mẫu In (Layout 2 Cột, Clean Canvas, Bảng Tùy Biến)

**Goal:** Chuyển đổi màn hình Thiết Kế Mẫu In sang layout 2 cột rộng rãi với dropdown nhóm chứng từ, làm sạch bản xem trước (chỉ hiện nút lên/xuống khi chọn), hỗ trợ Logo và Thông tin shop cùng hàng, mở khóa tùy biến cột bảng hàng hóa.

**Architecture:**
- Frontend HTML: `templates/index.html` (thay thế `#print-tpl-tree` bằng `<select id="print-doc-type-select">`, tinh gọn cấu trúc 2 cột).
- Frontend Logic: `static/js/modules/productions.js` (cập nhật render canvas, ẩn nút khi unselect, hỗ trợ `header_grid_2col`, tùy biến cột bảng).
- Print Engine: `static/js/pos.js` (đồng bộ render khi in thật cho các khối mới).

---

### Task 1: Viết Unit Test cho Layout 2 Cột và Các Tính Năng Mới
**Files:**
- Create: `tests/test_print_designer_2col_and_clean_canvas.py`

### Task 2: Chuyển Danh Mục Chứng Từ Thành Dropdown & Tái Cấu Trúc 2 Cột
**Files:**
- Modify: `templates/index.html` (chuyển `#print-tpl-tree` thành `<select id="print-doc-type-select">` với các nhóm optgroup).
- Modify: `static/js/modules/productions.js` (cập nhật hàm `selectPrintDocType` nhận giá trị từ select).

### Task 3: Làm Sạch Bản Xem Trước (Clean Canvas - Chỉ Hiện Điều Khiển Khi Chọn)
**Files:**
- Modify: `static/js/modules/productions.js` (ẩn `.element-action-bar` khi `!isSel`, bổ sung bộ nút căn lề và điều khiển nổi khi `isSel`).

### Task 4: Hỗ Trợ Bố Cục Header 2 Bên & Tùy Biến Cột Bảng Hàng Hóa
**Files:**
- Modify: `static/js/modules/productions.js` (render `header_grid_2col`, form cấu hình cột bảng `table_b2b` trong panel thuộc tính).
- Modify: `static/js/pos.js` (render tương ứng trên hóa đơn thật `printInvoiceDirectly`).

### Task 5: Chạy Kiểm Thử Tự Động & Hồi Quy Toàn Hệ Thống
**Files:**
- Test: `tests/test_print_designer_2col_and_clean_canvas.py`
- Test: Toàn bộ print test suite

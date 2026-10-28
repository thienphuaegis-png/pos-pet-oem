# BOM Status Badges and Filter Pills Design

## 1. Problem Statement
Trong bảng "Định Lượng BOM & Tính Giá Cost Sản Phẩm" (`#inv-sub-bom`), dropdown chọn sản phẩm hiển thị tất cả sản phẩm như nhau mà không có dấu hiệu phân biệt sản phẩm nào đã có BOM (định lượng nguyên liệu cấu thành) và sản phẩm nào chưa có. Người dùng gặp khó khăn khi tìm kiếm các sản phẩm chưa có định lượng để thiết lập.

## 2. Technical Architecture

### 2.1 Backend (`routers/products.py`)
- Cập nhật `list_products`:
  Bổ sung trường `bom_count` vào kết quả query `products`:
  ```sql
  SELECT p.*,
         GROUP_CONCAT(DISTINCT c.name) as supplier_names,
         (SELECT COUNT(*) FROM product_bom pb WHERE pb.product_id = p.id) as bom_count
  FROM products p
  ...
  ```
  Giúp mỗi item sản phẩm trả về có trường `bom_count: int` (>= 1 là đã có BOM, 0 là chưa có BOM).

### 2.2 Frontend (`templates/index.html` & `static/js/modules/productions.js`)
- `templates/index.html`:
  Bổ sung bộ 3 nút filter pills phía trên ô tìm kiếm sản phẩm BOM:
  - `[ Tất cả (<span id="bom-filter-count-all">0</span>) ]`
  - `[ ⚡ Đã có BOM (<span id="bom-filter-count-has">0</span>) ]`
  - `[ ⚪ Chưa có BOM (<span id="bom-filter-count-none">0</span>) ]`
- `static/js/modules/productions.js`:
  - Khai báo biến `currentBOMStatusFilter = 'ALL'` ('ALL' | 'HAS_BOM' | 'NO_BOM').
  - Cập nhật `setBOMStatusFilter(status)`: đổi active pill và gọi `filterBOMProductDropdown()`.
  - Cập nhật `filterBOMProductDropdown()`:
    - Lọc theo từ khóa tìm kiếm và theo `currentBOMStatusFilter`.
    - Render badge trạng thái trên mỗi dòng sản phẩm:
      - Nếu `bom_count > 0`: `<span class="bg-emerald-50 text-emerald-700 border border-emerald-300 px-1.5 py-0.5 rounded text-[10px] font-bold">⚡ Đã có BOM (${p.bom_count} tp)</span>`
      - Nếu `bom_count === 0`: `<span class="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-medium">⚪ Chưa có BOM</span>`
    - Cập nhật số đếm trên 3 pills: `updateBOMFilterCounts()`.
  - Cập nhật `loadProductBOMDetails()` và `saveBOM()`:
    - Khi lưu BOM thành công, cập nhật ngay `p.bom_count = items.length` trong `allBOMProductsList`, gọi `updateBOMFilterCounts()` và `filterBOMProductDropdown()` để badge tự động cập nhật ngay lập tức.

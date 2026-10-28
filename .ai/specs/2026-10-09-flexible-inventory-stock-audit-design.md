# Flexible Inventory Stock Audit Design (Kiểm Kê Từng Phần & Theo Lựa Chọn)

## 1. Problem Statement
Hiện tại màn hình Kiểm Kê Kho (`#inv-sub-audit`) tự động nạp toàn bộ danh mục sản phẩm/nguyên liệu của kho vào bảng. Khi bấm "Cân Bằng Kho", toàn bộ hàng hóa trong kho đều bị đưa vào payload và cân bằng lại.
Người dùng cần khả năng:
- Chỉ kiểm kê 1 số sản phẩm/nguyên liệu nhất định (kiểm đột xuất, kiểm theo nhóm danh mục).
- Chỉ cân bằng tồn kho cho các món được lựa chọn kiểm đếm, các món còn lại không bị tác động và giữ nguyên tồn kho sổ sách.
- Hỗ trợ checkbox chọn dòng, nút lọc/chọn nhanh các món có lệch, xóa bỏ các món không kiểm ra khỏi bảng.

## 2. Technical Architecture

### 2.1 Backend (`schemas.py` & `routers/inventory.py`)
- `schemas.py`:
  Cập nhật `AuditItemIn` để hỗ trợ đầy đủ các trường:
  - `item_type`: "product" | "ingredient"
  - `product_id`: Optional[int]
  - `ingredient_id`: Optional[int]
  - `item_id`: Optional[int] (cho phép map linh hoạt)
  - `system_qty`: Optional[float] = 0.0
  - `actual_qty`: Optional[float] = 0.0
  - `actual_quantity`: Optional[float] = None (fallback tương thích ngược)
  - `diff_qty`: Optional[float] = 0.0
  - `note`: Optional[str] = ""
- `routers/inventory.py`:
  Endpoint `POST /api/inventory/audit`:
  - Nhận `items: List[AuditItemIn]`.
  - Chỉ cập nhật tồn kho (`product_inventory` hoặc `inventory`), sinh `inventory_logs` (ADJUST) và ghi `stock_audit_items` cho đúng các phần tử có trong danh sách `items`.
  - Giữ nguyên toàn bộ các mặt hàng khác trong kho.

### 2.2 Frontend (`templates/index.html` & `static/js/app.js`)
- `templates/index.html`:
  - Thêm checkbox `[✓]` chọn tất cả trên header bảng kiểm kê.
  - Thêm các nút thao tác chọn nhanh:
    - `[🎯 Chỉ chọn món có lệch]`
    - `[⚡ Chọn tất cả]`
    - `[✕ Bỏ chọn hết]`
  - Bổ sung cột Thao tác ở cuối bảng: Nút `[✕ Bỏ]` để xóa hàng khỏi danh sách kiểm hiện tại.
  - Cập nhật footer: Hiển thị "Đã chọn kiểm: X / Y mặt hàng".
  - Cập nhật nút bấm Cân Bằng Kho: "⚡ Cân Bằng Kho (X món đã chọn)".
- `static/js/app.js`:
  - Mỗi item trong `rawAuditWarehouseItems` và `currentAuditItems` có thêm thuộc tính `is_selected: boolean` (mặc định `true` khi tải hoặc thêm).
  - Thêm ô tìm kiếm thêm nhanh sản phẩm (nếu tìm thấy mặt hàng chưa có trong bảng, cho phép click thêm vào bảng kiểm).
  - Viết các hàm:
    - `toggleAuditItemSelect(id, itemType, checked)`
    - `toggleSelectAllAuditItems(checked)`
    - `selectOnlyDiffAuditItems()`
    - `removeAuditItemFromList(id, itemType)`
    - `updateAuditStats()`: Cập nhật số lượng món đã chọn, số lượng khớp, lệch.
    - `submitStockAudit()`: Lọc chỉ lấy các món có `is_selected === true` để gửi lên backend.

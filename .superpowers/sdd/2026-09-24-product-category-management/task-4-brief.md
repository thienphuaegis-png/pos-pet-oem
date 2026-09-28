# Brief for Task 4: Modal Quản Lý Nhóm & Thanh Lọc Pills

Working directory: D:/Projects_Hermes/pos-offline-petcare2

Goal:
1. In `templates/index.html`:
- In the Unified Inventory / Products tab (`#tab-unified-inventory` or `#tab-inventory` or product toolbar):
  Add a modern horizontal category pill bar container `#category-pills-bar`:
  - It displays category buttons: `[ Tất cả (N) ]`, `[ Thức ăn (N) ]`, `[ Phụ kiện (N) ]`, etc.
  - At the right end of the bar or toolbar, add button:
    `<button type="button" onclick="openCategoryManagerModal()" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1 transition">⚙️ Quản lý nhóm</button>`
- Add modal `#modal-category-manager` (Z-index 60, clean & modern UI):
  - Title: "⚙️ Quản Lý Nhóm Hàng Hóa"
  - Form or input row at the top: `<input id="new-category-mgr-name" placeholder="Tên nhóm mới...">` + button `[+ Thêm nhóm]` calling `saveCategoryFromManager()`.
  - Table or card list container `#category-mgr-list`:
    - Shows columns: Tên nhóm, Số lượng món (product_count), Thao tác.
    - Inline edit name button (prompts or turns into input to call `PUT /api/categories/{id}`).
    - Delete button (calls `DELETE /api/categories/{id}` with confirmation prompt; disabled or hidden for group "Khác").
  - Footer with button `[Đóng]`.

2. In `static/js/app.js`:
- Function `loadCategoryPillsBar()`:
  - Fetches `/api/categories`.
  - Calculates total products for "Tất cả".
  - Renders pills: active pill has style `bg-emerald-600 text-white font-bold`, inactive pills have `bg-white border text-slate-700 hover:bg-slate-50`.
  - Clicking a pill sets current category filter and triggers filtering on inventory/products list (`filterUnifiedByCategory(categoryName)`).
- Function `openCategoryManagerModal()`:
  - Displays `#modal-category-manager`.
  - Calls `renderCategoryManagerList()`.
- Function `closeCategoryManagerModal()`:
  - Hides modal, refreshes pills and dropdowns.
- Function `renderCategoryManagerList()`:
  - Fetches `/api/categories`.
  - Renders table rows with name, product_count badge, and actions (Edit / Sửa, Delete / Xóa).
- Function `saveCategoryFromManager()`:
  - Calls `POST /api/categories`. On success clears input, reloads list, pills, and dropdowns.
- Function `editCategoryInline(id, currentName)`:
  - Prompts or inline edits name. Calls `PUT /api/categories/{id}`.
  - On success reloads list, pills, dropdowns, and inventory table.
- Function `deleteCategory(id, name)`:
  - Confirms: "Bạn có chắc muốn xóa nhóm '{name}'? Toàn bộ hàng hóa thuộc nhóm này sẽ chuyển về nhóm 'Khác'."
  - Calls `DELETE /api/categories/{id}`.
  - On success reloads list, pills, dropdowns, and inventory table.
- Hook `loadCategoryPillsBar()` into initial load or tab switch to inventory.

3. Verify:
- `node -c static/js/app.js`
- `pytest tests/test_html_integrity.py`
- `pytest tests/test_categories_api.py`

4. Write full report to `.superpowers/sdd/2026-09-24-product-category-management/task-4-report.md`.

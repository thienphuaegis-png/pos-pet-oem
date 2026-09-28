# Brief for Task 3: Modal Thêm Nhanh & Dropdown Danh Mục

Working directory: D:/Projects_Hermes/pos-offline-petcare2

Goal:
1. In `templates/index.html`:
- Inspect `#modal-product` around `modal-prod-category`.
- Currently it might be an input with a datalist or similar.
- Convert or wrap it into a modern dropdown + quick-add button layout:
  ```html
  <div class="flex gap-2">
      <select id="modal-prod-category" class="w-full border rounded-lg p-2 font-medium bg-white focus:ring-2 focus:ring-emerald-500">
          <!-- Options populated dynamically from /api/categories -->
      </select>
      <button type="button" onclick="openQuickAddCategoryModal()" class="px-3 py-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-bold rounded-lg transition" title="Thêm nhanh nhóm hàng">+</button>
  </div>
  ```
- Add a lightweight, clean modal for quick-adding category: `#modal-quick-add-category`
  It has an input `#quick-category-name`, a button `[Lưu]`, and `[Hủy]`.

2. In `static/js/app.js`:
- Function `loadProductCategoriesDropdown(selectedVal = '')`:
  Fetches `/api/categories`.
  Fills `#modal-prod-category`. If `selectedVal` is passed, selects it.
  Also updates any other category dropdowns across the app (like `#unified-category-filter` and `#pl-filter-category` if present).
- Function `openQuickAddCategoryModal()`:
  Clears `#quick-category-name` and displays `#modal-quick-add-category`.
- Function `closeQuickAddCategoryModal()`:
  Hides `#modal-quick-add-category`.
- Function `saveQuickCategory()`:
  Reads name, validates.
  Sends `POST /api/categories` with `{name: name}`.
  On success: closes quick modal, calls `loadProductCategoriesDropdown(newName)` to select the newly created category immediately. Shows toast notification.
- In `openModalProductUnified()`:
  Call `loadProductCategoriesDropdown(existingCategory || 'Khác')`.
- In `saveProductForm()`:
  Read value from `document.getElementById('modal-prod-category').value`.

3. Ensure JS syntax is valid (`node -c static/js/app.js`) and run DOM integrity test (`python -m pytest tests/test_html_integrity.py`).
4. Write full report to `.superpowers/sdd/2026-09-24-product-category-management/task-3-report.md`.

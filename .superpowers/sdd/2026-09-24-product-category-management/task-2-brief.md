# Brief for Task 2: Backend Categories Router & Auto-Sync

Working directory: D:/Projects_Hermes/pos-offline-petcare2

Goal:
1. Create `routers/categories.py`:
- Use FastAPI APIRouter(prefix="/api/categories", tags=["categories"])
- Endpoints:
  - `GET /api/categories`:
    Query `product_categories` joined with `products` count:
    `SELECT c.id, c.name, c.description, c.sort_order, COUNT(p.id) as product_count FROM product_categories c LEFT JOIN products p ON p.category = c.name GROUP BY c.id, c.name ORDER BY c.sort_order ASC, c.name ASC`
    Return JSON list.
  - `POST /api/categories`:
    Body: `{"name": str, "description": Optional[str] = "", "sort_order": Optional[int] = 0}`
    Validate name is not empty.
    Check if name already exists (case-insensitive / UNIQUE) -> raise 400 "Tên nhóm hàng đã tồn tại".
    Insert into `product_categories` and return the created record.
  - `PUT /api/categories/{id}`:
    Body: `{"name": str, "description": Optional[str] = "", "sort_order": Optional[int] = 0}`
    Fetch existing category by id. If not found -> raise 404.
    If name changed, check uniqueness.
    Update `product_categories`.
    Execute `UPDATE products SET category = ? WHERE category = ?` (using new_name and old_name).
    Commit and return updated record.
  - `DELETE /api/categories/{id}`:
    Fetch existing category. If not found -> 404.
    If category.name == "Khác" -> raise 400 "Không thể xóa nhóm mặc định 'Khác'".
    Execute `UPDATE products SET category = 'Khác' WHERE category = ?` (old_name).
    Execute `DELETE FROM product_categories WHERE id = ?`.
    Commit and return `{"success": True, "message": "Đã xóa nhóm hàng và chuyển sản phẩm về nhóm 'Khác'"}`.

2. In `server.py`:
- Import and register `categories.router`: `app.include_router(categories.router)`

3. Create Pytest test suite in `tests/test_categories_api.py`:
- Test GET /api/categories
- Test POST /api/categories (success and duplicate name)
- Test PUT /api/categories/{id} (rename category and verify products are updated to new name)
- Test DELETE /api/categories/{id} (prevent deleting 'Khác', verify delete migrates products to 'Khác')
- Run `python -m pytest tests/test_categories_api.py` and ensure 100% pass.

4. Write full report to `.superpowers/sdd/2026-09-24-product-category-management/task-2-report.md`.

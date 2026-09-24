# Task 2 Report: Backend Categories Router & Auto-Sync

## 1. Objective
Implement full CRUD endpoints for Product Categories (`/api/categories`) with automatic product synchronization:
- `GET /api/categories`: List categories with product counts.
- `POST /api/categories`: Create new category with unique validation.
- `PUT /api/categories/{id}`: Update category and auto-sync existing products' `category` column to the new name.
- `DELETE /api/categories/{id}`: Block deleting default 'Khác' category, reassign related products to 'Khác', and delete category.
- Register router in `server.py`.
- Write and run unit/integration tests with 100% pass.

## 2. Changes Made
- **Created `routers/categories.py`**:
  - Implemented `CategoryCreate` and `CategoryUpdate` Pydantic schemas.
  - Implemented `GET /api/categories` with join on `products` to calculate `product_count`.
  - Implemented `POST /api/categories` with empty string & case-insensitive duplicate check.
  - Implemented `PUT /api/categories/{id}` with duplicate name check and `UPDATE products SET category = ? WHERE category = ?`.
  - Implemented `DELETE /api/categories/{id}` with protection for category named 'Khác' and migration of related products to 'Khác'.
- **Updated `server.py`**:
  - Added `("/api/categories", "categories")` mapping in `PATH_MODULE_MAP`.
  - Imported `categories_router` from `routers.categories`.
  - Registered `app.include_router(categories_router)`.
- **Created `tests/test_categories_api.py`**:
  - `test_get_categories`: Verifies response status, structure, and presence of default categories.
  - `test_post_category_success_and_duplicate`: Verifies category insertion and 400 rejection on duplicate name.
  - `test_put_category_rename_and_sync_products`: Verifies updating category name cascades `category` column change to existing products.
  - `test_delete_category_prevent_khac_and_migrate_to_khac`: Verifies prohibition of deleting 'Khác' and automatic migration of affected products to 'Khác' on deletion.

## 3. Test Results
Command executed:
```bash
python -m pytest tests/test_categories_api.py -v
```
Output:
```text
============================= test session starts =============================
platform win32 -- Python 3.11.15, pytest-9.1.1, pluggy-1.6.0 -- C:\Users\thien\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe
cachedir: .pytest_cache
rootdir: D:\Projects_Hermes\pos-offline-petcare2
plugins: anyio-4.12.1
collecting ... collected 4 items

tests/test_categories_api.py::test_get_categories PASSED                 [ 25%]
tests/test_categories_api.py::test_post_category_success_and_duplicate PASSED [ 50%]
tests/test_categories_api.py::test_put_category_rename_and_sync_products PASSED [ 75%]
tests/test_categories_api.py::test_delete_category_prevent_khac_and_migrate_to_khac PASSED [100%]

============================== 4 passed in 1.74s ==============================
```

## 4. Status
DONE.

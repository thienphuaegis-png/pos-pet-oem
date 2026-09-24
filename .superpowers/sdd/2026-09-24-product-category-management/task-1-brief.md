# Brief for Task 1: Database Table & Migration

Working directory: D:/Projects_Hermes/pos-offline-petcare2

Goal:
1. Open `database.py` and add table creation for `product_categories`:
```sql
CREATE TABLE IF NOT EXISTS product_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
2. In database init/migration function in `database.py`:
- Insert default categories if table is empty:
  `Thức ăn`, `Phụ kiện`, `Vệ sinh`, `Thuốc & Thú y`, `Khác`.
- Query any existing categories from `products` table (`SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ''`) and insert `OR IGNORE` into `product_categories`.
3. Test that running `init_db()` creates the table and populates the categories properly.
4. Report back the result.

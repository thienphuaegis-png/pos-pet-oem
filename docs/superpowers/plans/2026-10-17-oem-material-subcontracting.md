# Gia Công OEM Ra Nguyên Vật Liệu / Bán Thành Phẩm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Mở rộng luồng gia công OEM để hỗ trợ gia công ra Nguyên Vật Liệu / Bán thành phẩm (in tem từ phôi tem trắng, in lụa chai từ vỏ chai thô...), tự động trừ phôi vật tư tại kho xưởng, nhập kho nguyên liệu Kho Tổng và kết chuyển giá vốn hoàn thiện vào bảng giá `price_history`.

**Architecture:** Bổ sung trường `target_type` trong `oem_orders`, `item_type` và `ingredient_id` trong `oem_order_items`. Thiết lập bảng định lượng phôi nguyên liệu `ingredient_bom` và API tính toán BOM phôi xưởng. Nâng cấp endpoint nghiệm thu `receive_oem_order` để phân nhánh xử lý nguyên liệu: trừ kho phôi `inventory`, cộng kho thành phẩm `inventory`, tính giá vốn hoàn thiện (phôi + công in ròng) và ghi vào `price_history`. Cập nhật giao diện modal tạo đơn OEM với bộ chọn phân loại gia công (Sản phẩm vs Nguyên liệu) và bảng đối chiếu phôi tự động.

**Tech Stack:** Python 3, FastAPI, SQLite3 (pos.db), Pydantic v2, HTML5 / TailwindCSS / Vanilla JavaScript, pytest.

---

## Global Constraints

- Tuân thủ cấu trúc database hiện tại: nguyên liệu và phôi lưu trữ tại bảng `ingredients`, tồn kho lưu tại bảng `inventory`, lịch sử giá lưu tại `price_history`.
- Không làm ảnh hưởng đến luồng gia công sản phẩm thành phẩm hiện hành (`target_type = 'product'`).
- Mọi thao tác xuất phôi và nhập nguyên liệu thành phẩm đều phải ghi nhận log vào bảng `inventory_logs`.
- Công thức giá vốn hoàn thiện nguyên liệu: `Giá vốn = Giá phôi mới nhất + Công gia công ròng` (với `Công gia công ròng = unit_price * (1 - discount_percent/100) * (1 + vat_percent/100)`).
- Không được dùng `TODO`, `TBD`, hoặc mã giả trong quá trình triển khai.

## Scope Boundary & Anti-Drift Guards (Strict)

1. **Chạm đúng biên:** Chỉ chỉnh sửa các file được chỉ định: `database.py`, `schemas.py`, `routers/oem.py`, `routers/bom.py`, `templates/index.html`, `static/js/modules/productions.js`. Giữ nguyên toàn bộ logic tính nợ NCC, sổ quỹ, và các phân hệ khác.
2. **Bằng chứng test thực tế:** Mọi task đều phải chạy lệnh kiểm thử thật bằng `pytest` với terminal output xác minh. Cấm tự báo PASS khi chưa chạy lệnh.
3. **Tuần tự theo nấc:** Triển khai từng task, chạy pass bộ test của task đó trước khi chuyển sang task kế tiếp.

---

## Danh Sách Tệp Thay Đổi (File Structure)

| File | Trách nhiệm |
|---|---|
| `database.py:1400-1435, 1750-1790` | Modify — Bổ sung cột `target_type` cho `oem_orders`, cột `item_type`, `ingredient_id` cho `oem_order_items`, tạo bảng `ingredient_bom` và migration |
| `schemas.py:414-460` | Modify — Cập nhật `OEMOrderItemIn`, `OEMOrderCreate`, `OEMOrderUpdate`, `OEMStockCheckItem`, thêm schemas cho `ingredient_bom` |
| `routers/bom.py:230-280` | Modify — Bổ sung API cấu hình định lượng phôi nguyên liệu (`GET/POST/DELETE /api/ingredients/{id}/bom`) |
| `routers/oem.py:15-20, 155-205, 255-310, 340-390, 600-760` | Modify — Mở rộng `calculate_bom_stock`, `get_oem_order_detail`, `create_oem_order` và nhánh nghiệm thu nguyên liệu `receive_oem_order` |
| `templates/index.html:4425-4560, 4625-4655` | Modify — Bổ sung pill chọn loại gia công (Sản phẩm vs Nguyên liệu), cập nhật thanh tìm kiếm và bảng hiển thị |
| `static/js/modules/productions.js:8800-8850, 9316-9500, 9969-10140` | Modify — Quản lý state `oemTargetType`, tìm kiếm nguyên liệu, gọi đối chiếu phôi và submit đơn |
| `tests/test_oem_ingredient_subcontracting.py` | Create — Bộ test tích hợp toàn diện từ tạo đơn, kiểm tra BOM phôi, nghiệm thu và kết chuyển giá vốn |

---

## Chi Tiết Các Nhiệm Vụ (Tasks)

### Task 1: CSDL & Migration Cho Gia Công Nguyên Liệu & Bảng Định Lượng Phôi

**Files:**
- Modify: `database.py:1400-1435, 1750-1800`
- Test: `tests/test_oem_ingredient_subcontracting.py`

**Interfaces:**
- Consumes: `cur.execute(...)` từ `database.py:init_db()`
- Produces:
  - Cột `target_type TEXT DEFAULT 'product'` trong `oem_orders`
  - Cột `item_type TEXT DEFAULT 'product'`, `ingredient_id INTEGER NULL` trong `oem_order_items`
  - Bảng `ingredient_bom (id, parent_ingredient_id, child_ingredient_id, quantity, created_at)`

- [ ] **Step 1: Viết test kiểm tra cấu trúc bảng và migration trong `tests/test_oem_ingredient_subcontracting.py`**

```python
# tests/test_oem_ingredient_subcontracting.py
import pytest
import sqlite3
from database import get_db, init_db

def test_database_schema_has_oem_ingredient_columns():
    init_db()
    conn = get_db()
    cur = conn.cursor()
    
    # 1. Kiểm tra cột target_type trong oem_orders
    cur.execute("PRAGMA table_info(oem_orders)")
    order_cols = [c[1] for c in cur.fetchall()]
    assert "target_type" in order_cols, "Cột target_type chưa tồn tại trong oem_orders"
    
    # 2. Kiểm tra cột item_type và ingredient_id trong oem_order_items
    cur.execute("PRAGMA table_info(oem_order_items)")
    item_cols = [c[1] for c in cur.fetchall()]
    assert "item_type" in item_cols, "Cột item_type chưa tồn tại trong oem_order_items"
    assert "ingredient_id" in item_cols, "Cột ingredient_id chưa tồn tại trong oem_order_items"
    
    # 3. Kiểm tra bảng ingredient_bom
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ingredient_bom'")
    assert cur.fetchone() is not None, "Bảng ingredient_bom chưa được tạo"
    
    cur.execute("PRAGMA table_info(ingredient_bom)")
    bom_cols = [c[1] for c in cur.fetchall()]
    assert "parent_ingredient_id" in bom_cols
    assert "child_ingredient_id" in bom_cols
    assert "quantity" in bom_cols
    conn.close()
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**
Lệnh:
`pytest tests/test_oem_ingredient_subcontracting.py::test_database_schema_has_oem_ingredient_columns -v`

- [ ] **Step 3: Cập nhật schema và migration trong `database.py`**
Tại `database.py`, cập nhật phần tạo bảng `oem_orders`, `oem_order_items` và thêm `ingredient_bom`:

```python
    # 13. Phân hệ Gia Công OEM
    cur.execute('''
    CREATE TABLE IF NOT EXISTS oem_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        partner_id INTEGER NOT NULL,
        oem_warehouse_id INTEGER DEFAULT 1,
        dest_warehouse_id INTEGER DEFAULT 1,
        status TEXT DEFAULT 'DRAFT',
        expected_delivery_date TEXT,
        fund_source TEXT DEFAULT 'COMPANY',
        vat_percent REAL DEFAULT 8.0,
        discount_percent REAL DEFAULT 0.0,
        deposit_amount REAL DEFAULT 0.0,
        deposit_date TEXT,
        total_raw_amount REAL DEFAULT 0.0,
        total_final_amount REAL DEFAULT 0.0,
        remaining_payment REAL DEFAULT 0.0,
        payment_status TEXT DEFAULT 'UNPAID',
        note TEXT DEFAULT '',
        target_type TEXT DEFAULT 'product',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(partner_id) REFERENCES contacts(id)
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS oem_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER DEFAULT 0,
        item_type TEXT DEFAULT 'product',
        ingredient_id INTEGER DEFAULT NULL,
        ordered_qty REAL NOT NULL DEFAULT 0,
        received_qty REAL NOT NULL DEFAULT 0,
        unit_price REAL NOT NULL DEFAULT 0,
        final_unit_cost REAL NOT NULL DEFAULT 0,
        full_cost_per_unit REAL NOT NULL DEFAULT 0,
        FOREIGN KEY(order_id) REFERENCES oem_orders(id) ON DELETE CASCADE
    )''')

    # Bảng định lượng phôi cho nguyên liệu
    cur.execute('''
    CREATE TABLE IF NOT EXISTS ingredient_bom (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_ingredient_id INTEGER NOT NULL,
        child_ingredient_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(parent_ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
        FOREIGN KEY(child_ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT,
        UNIQUE(parent_ingredient_id, child_ingredient_id)
    )''')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_ingredient_bom_parent ON ingredient_bom(parent_ingredient_id)')
```

Thêm migration vào khối migration của `database.py`:
```python
    # Migration: Cột target_type cho oem_orders
    cur.execute("PRAGMA table_info(oem_orders)")
    oem_cols = [c[1] for c in cur.fetchall()]
    if "target_type" not in oem_cols:
        cur.execute("ALTER TABLE oem_orders ADD COLUMN target_type TEXT DEFAULT 'product'")

    # Migration: Cột item_type, ingredient_id cho oem_order_items
    cur.execute("PRAGMA table_info(oem_order_items)")
    oi_cols = [c[1] for c in cur.fetchall()]
    if "item_type" not in oi_cols:
        cur.execute("ALTER TABLE oem_order_items ADD COLUMN item_type TEXT DEFAULT 'product'")
    if "ingredient_id" not in oi_cols:
        cur.execute("ALTER TABLE oem_order_items ADD COLUMN ingredient_id INTEGER DEFAULT NULL")
```

- [ ] **Step 4: Chạy test kiểm tra schema để xác nhận PASS**
Lệnh:
`pytest tests/test_oem_ingredient_subcontracting.py::test_database_schema_has_oem_ingredient_columns -v`

- [ ] **Step 5: Checkpoint Task 1**

---

### Task 2: Schemas & API Quản Lý Định Lượng Phôi Nguyên Liệu (Ingredient BOM)

**Files:**
- Modify: `schemas.py:410-460`
- Modify: `routers/bom.py:230-310`
- Test: `tests/test_oem_ingredient_subcontracting.py`

**Interfaces:**
- Consumes: `schemas.py`, `database.get_db()`
- Produces:
  - `GET /api/ingredients/{ingredient_id}/bom` -> trả về danh sách phôi con và giá vốn mới nhất
  - `POST /api/ingredients/{ingredient_id}/bom` -> lưu cấu hình phôi cho nguyên liệu cha

- [ ] **Step 1: Viết test cho API Ingredient BOM trong `tests/test_oem_ingredient_subcontracting.py`**

```python
from fastapi.testclient import TestClient
from server import app
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())

def test_ingredient_bom_crud_api():
    conn = get_db()
    cur = conn.cursor()
    # Tạo 2 nguyên liệu: 991 (Phôi tem trắng), 992 (Tem in hoàn thiện)
    cur.execute("INSERT OR REPLACE INTO ingredients (id, code, name, unit, type) VALUES (991, 'PHOI-TEM-01', 'Phôi tem trắng cuộn', 'cái', 'IS_PHYSICAL')")
    cur.execute("INSERT OR REPLACE INTO ingredients (id, code, name, unit, type) VALUES (992, 'TEM-IN-01', 'Tem Nước Lau Sàn Đã In', 'cái', 'IS_PHYSICAL')")
    cur.execute("INSERT OR REPLACE INTO price_history (ingredient_id, purchase_price, effective_date) VALUES (991, 1200, '2026-10-01')")
    conn.commit()
    conn.close()

    # 1. Cấu hình BOM phôi cho Tem 992: cần 1 Phôi 991
    payload = {
        "items": [
            {"child_ingredient_id": 991, "quantity": 1.0}
        ]
    }
    res_set = client.post("/api/ingredients/992/bom", json=payload)
    assert res_set.status_code == 200
    data_set = res_set.json()
    assert data_set["success"] is True

    # 2. Lấy danh sách BOM phôi
    res_get = client.get("/api/ingredients/992/bom")
    assert res_get.status_code == 200
    data_get = res_get.json()
    assert len(data_get["items"]) == 1
    assert data_get["items"][0]["child_ingredient_id"] == 991
    assert data_get["items"][0]["child_code"] == "PHOI-TEM-01"
    assert data_get["items"][0]["quantity"] == 1.0
    assert data_get["items"][0]["latest_cost"] == 1200.0
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại (404 Not Found)**
Lệnh:
`pytest tests/test_oem_ingredient_subcontracting.py::test_ingredient_bom_crud_api -v`

- [ ] **Step 3: Cập nhật `schemas.py` và triển khai API tại `routers/bom.py`**

Trong `schemas.py`:
```python
class IngredientBOMItemIn(BaseModel):
    child_ingredient_id: int
    quantity: float = Field(gt=0, description="Định lượng phôi cần dùng")

class IngredientBOMSetRequest(BaseModel):
    items: List[IngredientBOMItemIn]
```

Trong `routers/bom.py`:
```python
@router.get("/api/ingredients/{ingredient_id}/bom")
def get_ingredient_bom(ingredient_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT 
            ib.id,
            ib.child_ingredient_id,
            ib.quantity,
            i.code as child_code,
            i.name as child_name,
            i.unit as child_unit,
            COALESCE((SELECT ph.purchase_price FROM price_history ph WHERE ph.ingredient_id = i.id ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0) as latest_cost
        FROM ingredient_bom ib
        JOIN ingredients i ON ib.child_ingredient_id = i.id
        WHERE ib.parent_ingredient_id = ?
    """, (ingredient_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {"parent_ingredient_id": ingredient_id, "items": rows}

@router.post("/api/ingredients/{ingredient_id}/bom")
def set_ingredient_bom(ingredient_id: int, req: IngredientBOMSetRequest):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM ingredient_bom WHERE parent_ingredient_id = ?", (ingredient_id,))
        for it in req.items:
            if it.quantity > 0:
                cur.execute("""
                    INSERT INTO ingredient_bom (parent_ingredient_id, child_ingredient_id, quantity)
                    VALUES (?, ?, ?)
                """, (ingredient_id, it.child_ingredient_id, it.quantity))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"success": True, "parent_ingredient_id": ingredient_id}
```

- [ ] **Step 4: Chạy test kiểm tra API Ingredient BOM để xác nhận PASS**
Lệnh:
`pytest tests/test_oem_ingredient_subcontracting.py::test_ingredient_bom_crud_api -v`

- [ ] **Step 5: Checkpoint Task 2**

---

### Task 3: Backend Đối Chiếu BOM Phôi & Lập Đơn OEM Gia Công Nguyên Liệu

**Files:**
- Modify: `schemas.py:414-432`
- Modify: `routers/oem.py:11-20, 155-205, 255-310, 340-390`
- Test: `tests/test_oem_ingredient_subcontracting.py`

**Interfaces:**
- Consumes: `OEMOrderCreate`, `OEMStockCheckRequest`
- Produces:
  - `POST /api/oem/calculate-bom-stock`: Hỗ trợ kiểm tra phôi theo `ingredient_bom`
  - `POST /api/oem/orders`: Lưu đơn gia công nguyên liệu (`target_type='ingredient'`)
  - `GET /api/oem/orders/{id}`: Trả về thông tin nguyên liệu và phôi cần dùng

- [ ] **Step 1: Viết test cho tính năng đối chiếu phôi và tạo đơn OEM nguyên liệu trong `tests/test_oem_ingredient_subcontracting.py`**

```python
def test_oem_calculate_bom_stock_and_create_order_for_ingredients():
    conn = get_db()
    cur = conn.cursor()
    # Tạo nhà máy và kho xưởng
    cur.execute("INSERT OR REPLACE INTO contacts (id, type, name, phone) VALUES (88801, 'supplier', 'Nhà Máy In Tem Test', '0988111222')")
    cur.execute("INSERT OR REPLACE INTO warehouses (id, code, name, is_oem, supplier_id) VALUES (88802, 'WH-IN-TEM', 'Kho Xưởng In', 1, 88801)")
    # Tồn kho phôi 991 tại kho xưởng 88802 là 500 cái
    cur.execute("INSERT OR REPLACE INTO inventory (warehouse_id, ingredient_id, quantity) VALUES (88802, 991, 500)")
    conn.commit()
    conn.close()

    # 1. Test đối chiếu vật tư phôi tại xưởng qua calculate-bom-stock
    check_payload = {
        "warehouse_id": 88802,
        "items": [
            {"ingredient_id": 992, "item_type": "ingredient", "quantity": 200.0}
        ]
    }
    res_stock = client.post("/api/oem/calculate-bom-stock", json=check_payload)
    assert res_stock.status_code == 200
    stock_data = res_stock.json()
    assert len(stock_data) == 1
    assert stock_data[0]["ingredient_id"] == 991
    assert stock_data[0]["needed_qty"] == 200.0
    assert stock_data[0]["current_stock"] == 500.0
    assert stock_data[0]["is_sufficient"] is True

    # 2. Test tạo đơn OEM gia công nguyên liệu
    order_payload = {
        "partner_id": 88801,
        "oem_warehouse_id": 88802,
        "dest_warehouse_id": 1,
        "target_type": "ingredient",
        "fund_source": "COMPANY",
        "vat_percent": 8.0,
        "discount_percent": 10.0,
        "deposit_amount": 50000,
        "items": [
            {
                "item_type": "ingredient",
                "ingredient_id": 992,
                "ordered_qty": 200.0,
                "unit_price": 500.0
            }
        ]
    }
    res_order = client.post("/api/oem/orders", json=order_payload)
    assert res_order.status_code == 200
    order_res = res_order.json()
    assert order_res["success"] is True
    order_id = order_res["id"]

    # 3. Test lấy chi tiết đơn OEM
    res_detail = client.get(f"/api/oem/orders/{order_id}")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["target_type"] == "ingredient"
    assert len(detail["items"]) == 1
    assert detail["items"][0]["ingredient_id"] == 992
    assert detail["items"][0]["product_name"] == "Tem Nước Lau Sàn Đã In"
    assert len(detail["materials_needed"]) == 1
    assert detail["materials_needed"][0]["ingredient_id"] == 991
    assert detail["materials_needed"][0]["needed_qty"] == 200.0
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**
Lệnh:
`pytest tests/test_oem_ingredient_subcontracting.py::test_oem_calculate_bom_stock_and_create_order_for_ingredients -v`

- [ ] **Step 3: Cập nhật `schemas.py` và `routers/oem.py`**

Trong `schemas.py`:
```python
class OEMOrderItemIn(BaseModel):
    product_id: Optional[int] = None
    item_type: Optional[str] = "product"  # 'product' hoac 'ingredient'
    ingredient_id: Optional[int] = None
    ordered_qty: float = Field(gt=0, description="Số lượng đặt")
    unit_price: float = Field(ge=0, description="Đơn giá gia công niêm yết")

class OEMOrderCreate(BaseModel):
    partner_id: int
    oem_warehouse_id: int = 1
    dest_warehouse_id: int = 1
    target_type: Optional[str] = "product"  # 'product' hoac 'ingredient'
    expected_delivery_date: Optional[str] = None
    fund_source: str = "COMPANY"
    vat_percent: float = 8.0
    discount_percent: float = 0.0
    discount_amount: Optional[float] = None
    discount_type: Optional[str] = "percent"
    deposit_amount: float = 0.0
    note: Optional[str] = ""
    items: List[OEMOrderItemIn]
```

Trong `routers/oem.py`:
Cập nhật `OEMStockCheckItem`:
```python
class OEMStockCheckItem(BaseModel):
    product_id: Optional[int] = None
    ingredient_id: Optional[int] = None
    item_type: Optional[str] = "product"
    quantity: float
```

Cập nhật `calculate_bom_stock`:
```python
@router.post("/api/oem/calculate-bom-stock")
def calculate_bom_stock(req: OEMStockCheckRequest):
    """Tính toán nhu cầu tem, chai, nắp theo BOM và đối chiếu với tồn kho thực tế tại xưởng"""
    conn = get_db()
    cur = conn.cursor()
    
    needed_materials = {} # ingredient_id -> dict
    
    for item in req.items:
        if item.quantity <= 0:
            continue
        if getattr(item, "item_type", "product") == "ingredient":
            # Tra cứu phôi của nguyên liệu từ ingredient_bom
            cur.execute("""
                SELECT ib.child_ingredient_id as ingredient_id, ib.quantity, i.code, i.name, i.unit
                FROM ingredient_bom ib
                JOIN ingredients i ON ib.child_ingredient_id = i.id
                WHERE ib.parent_ingredient_id = ?
            """, (item.ingredient_id,))
        else:
            cur.execute("""
                SELECT pb.ingredient_id, pb.quantity, i.code, i.name, i.unit
                FROM product_bom pb
                JOIN ingredients i ON pb.ingredient_id = i.id
                WHERE pb.product_id = ?
            """, (item.product_id,))

        for row in cur.fetchall():
            ing_id = row["ingredient_id"]
            qty = row["quantity"] * item.quantity
            if ing_id not in needed_materials:
                needed_materials[ing_id] = {
                    "ingredient_id": ing_id,
                    "code": row["code"],
                    "name": row["name"],
                    "unit": row["unit"],
                    "needed_qty": 0.0,
                    "current_stock": 0.0,
                }
            needed_materials[ing_id]["needed_qty"] += qty
            
    results = []
    for ing_id, data in needed_materials.items():
        cur.execute("""
            SELECT COALESCE(quantity, 0) as stock
            FROM inventory
            WHERE warehouse_id = ? AND ingredient_id = ?
        """, (req.warehouse_id, ing_id))
        stock_row = cur.fetchone()
        stock = float(stock_row["stock"]) if stock_row else 0.0
        data["current_stock"] = stock
        diff = stock - data["needed_qty"]
        data["diff_qty"] = diff
        data["is_sufficient"] = (diff >= 0)
        results.append(data)
        
    conn.close()
    return results
```

Cập nhật `create_oem_order` và `get_oem_order_detail` trong `routers/oem.py`:
- Trong `create_oem_order`: Thêm `target_type` vào INSERT `oem_orders`.
- Trong INSERT `oem_order_items`: Lưu `item_type`, `ingredient_id`, và `product_id = it.product_id or 0`.
- Trong `get_oem_order_detail`:
  ```python
  cur.execute("""
      SELECT 
          oi.*,
          COALESCE(p.code, ing.code) as product_code,
          COALESCE(p.name, ing.name) as product_name,
          COALESCE(p.unit, ing.unit) as product_unit
      FROM oem_order_items oi
      LEFT JOIN products p ON oi.product_id = p.id AND oi.item_type != 'ingredient'
      LEFT JOIN ingredients ing ON oi.ingredient_id = ing.id AND oi.item_type = 'ingredient'
      WHERE oi.order_id = ?
  """, (order_id,))
  items = [dict(r) for r in cur.fetchall()]
  ```
  Nếu `it["item_type"] == 'ingredient'`, query `materials_needed` từ `ingredient_bom` tương ứng.

- [ ] **Step 4: Chạy test kiểm tra tính toán tồn kho và tạo đơn OEM nguyên liệu để xác nhận PASS**
Lệnh:
`pytest tests/test_oem_ingredient_subcontracting.py::test_oem_calculate_bom_stock_and_create_order_for_ingredients -v`

- [ ] **Step 5: Checkpoint Task 3**

---

### Task 4: Nghiệm Thu Nhận Hàng OEM Nguyên Liệu & Kết Chuyển Giá Vốn Vào `price_history`

**Files:**
- Modify: `routers/oem.py:600-760`
- Test: `tests/test_oem_ingredient_subcontracting.py`

**Interfaces:**
- Consumes: `POST /api/oem/orders/{order_id}/receive`
- Produces:
  - Trừ kho phôi tại xưởng (`inventory`)
  - Cộng tồn kho nguyên liệu hoàn thiện tại Kho Tổng (`inventory`)
  - Cập nhật giá vốn chuẩn `full_cost_per_unit = phôi + công in ròng`
  - Ghi bản ghi mới vào `price_history` cho nguyên liệu hoàn thiện

- [ ] **Step 1: Viết test cho luồng nghiệm thu nhận hàng nguyên liệu trong `tests/test_oem_ingredient_subcontracting.py`**

```python
def test_oem_receive_ingredient_order_and_cost_accounting():
    # Tiếp tục từ đơn hàng vừa tạo ở Task 3
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM oem_orders WHERE partner_id = 88801 ORDER BY id DESC LIMIT 1")
    order_id = cur.fetchone()[0]
    cur.execute("SELECT id FROM oem_order_items WHERE order_id = ?", (order_id,))
    item_id = cur.fetchone()[0]
    conn.close()

    receive_payload = {
        "items": [
            {"item_id": item_id, "received_qty": 200.0}
        ],
        "pay_remaining_now": True,
        "payment_fund_source": "COMPANY"
    }

    res_receive = client.post(f"/api/oem/orders/{order_id}/receive", json=receive_payload)
    assert res_receive.status_code == 200
    rec_data = res_receive.json()
    assert rec_data["success"] is True

    # Xác minh trong CSDL:
    conn = get_db()
    cur = conn.cursor()
    
    # 1. Tồn kho phôi 991 tại kho xưởng 88802 giảm từ 500 -> 300
    cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = 88802 AND ingredient_id = 991")
    assert cur.fetchone()[0] == 300.0

    # 2. Tồn kho tem in 992 tại Kho Tổng (warehouse_id = 1) tăng lên 200
    cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = 1 AND ingredient_id = 992")
    assert cur.fetchone()[0] == 200.0

    # 3. Tồn kho bảng product_inventory KHÔNG được chứa tem in 992
    cur.execute("SELECT COUNT(*) FROM product_inventory WHERE product_id = 992")
    assert cur.fetchone()[0] == 0

    # 4. Giá vốn hoàn thiện trong price_history:
    # Phôi 991: 1.200 đ
    # Công in ròng: 500 đ * (1 - 10%) * (1 + 8%) = 500 * 0.9 * 1.08 = 486 đ
    # Tổng giá vốn = 1.200 + 486 = 1.686 đ
    cur.execute("SELECT purchase_price, note FROM price_history WHERE ingredient_id = 992 ORDER BY effective_date DESC, id DESC LIMIT 1")
    cost_row = cur.fetchone()
    assert cost_row is not None
    assert abs(cost_row[0] - 1686.0) < 0.01

    # 5. Inventory logs phải có log xuất phôi và log nhập tem hoàn thiện
    cur.execute("SELECT change_type, quantity FROM inventory_logs WHERE ingredient_id = 991 ORDER BY id DESC LIMIT 1")
    export_log = cur.fetchone()
    assert export_log[0] == 'EXPORT'
    assert export_log[1] == 200.0

    cur.execute("SELECT change_type, quantity FROM inventory_logs WHERE ingredient_id = 992 ORDER BY id DESC LIMIT 1")
    import_log = cur.fetchone()
    assert import_log[0] == 'IMPORT'
    assert import_log[1] == 200.0
    conn.close()
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**
Lệnh:
`pytest tests/test_oem_ingredient_subcontracting.py::test_oem_receive_ingredient_order_and_cost_accounting -v`

- [ ] **Step 3: Nâng cấp hàm `receive_oem_order` trong `routers/oem.py`**
Tại `receive_oem_order`, bổ sung rẽ nhánh xử lý khi `it["item_type"] == 'ingredient'`:

```python
        for it in items:
            rec_qty = it["received_qty"]
            if rec_qty <= 0:
                continue
                
            net_proc_cost = it["unit_price"] * discount_factor * vat_factor

            if it.get("item_type") == "ingredient":
                ing_id = it["ingredient_id"]
                # Lấy định lượng phôi từ ingredient_bom
                cur.execute("""
                    SELECT 
                        ib.child_ingredient_id,
                        ib.quantity as bom_qty,
                        i.name as child_name,
                        COALESCE((SELECT ph.purchase_price FROM price_history ph WHERE ph.ingredient_id = i.id ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0) as child_cost
                    FROM ingredient_bom ib
                    JOIN ingredients i ON ib.child_ingredient_id = i.id
                    WHERE ib.parent_ingredient_id = ?
                """, (ing_id,))
                bom_rows = cur.fetchall()

                material_cost_per_unit = 0.0
                for b in bom_rows:
                    child_id = b["child_ingredient_id"]
                    bom_qty = b["bom_qty"]
                    child_cost = b["child_cost"]
                    total_deduct = bom_qty * rec_qty
                    material_cost_per_unit += bom_qty * child_cost

                    # Trừ kho phôi tại kho xưởng (inventory)
                    cur.execute("""
                        SELECT quantity FROM inventory 
                        WHERE ingredient_id = ? AND warehouse_id = ?
                    """, (child_id, order["oem_warehouse_id"]))
                    inv_row = cur.fetchone()
                    cur_stock = inv_row[0] if inv_row else 0.0
                    new_stock = cur_stock - total_deduct

                    if inv_row:
                        cur.execute("""
                            UPDATE inventory 
                            SET quantity = ?, updated_at = CURRENT_TIMESTAMP
                            WHERE ingredient_id = ? AND warehouse_id = ?
                        """, (new_stock, child_id, order["oem_warehouse_id"]))
                    else:
                        cur.execute("""
                            INSERT INTO inventory (ingredient_id, warehouse_id, quantity)
                            VALUES (?, ?, ?)
                        """, (child_id, order["oem_warehouse_id"], new_stock))

                    # Ghi log xuất kho phôi
                    cur.execute("""
                        INSERT INTO inventory_logs (
                            item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note
                        ) VALUES ('ingredient', ?, ?, 'EXPORT', ?, ?, ?)
                    """, (child_id, order["oem_warehouse_id"], total_deduct, new_stock, f"Xuất phôi gia công OEM đơn {order['code']}"))

                full_unit_cost = net_proc_cost + material_cost_per_unit

                # Cập nhật chi phí vào item
                cur.execute("""
                    UPDATE oem_order_items
                    SET final_unit_cost = ?, full_cost_per_unit = ?
                    WHERE id = ?
                """, (net_proc_cost, full_unit_cost, it["id"]))

                # Nhập kho nguyên liệu hoàn thiện vào Kho Đích (bảng inventory)
                cur.execute("""
                    SELECT quantity FROM inventory 
                    WHERE ingredient_id = ? AND warehouse_id = ?
                """, (ing_id, order["dest_warehouse_id"]))
                dest_inv = cur.fetchone()
                dest_cur_stock = dest_inv[0] if dest_inv else 0.0
                dest_new_stock = dest_cur_stock + rec_qty

                if dest_inv:
                    cur.execute("""
                        UPDATE inventory 
                        SET quantity = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE ingredient_id = ? AND warehouse_id = ?
                    """, (dest_new_stock, ing_id, order["dest_warehouse_id"]))
                else:
                    cur.execute("""
                        INSERT INTO inventory (ingredient_id, warehouse_id, quantity)
                        VALUES (?, ?, ?)
                    """, (ing_id, order["dest_warehouse_id"], dest_new_stock))

                # Ghi log nhập kho nguyên liệu thành phẩm
                cur.execute("""
                    INSERT INTO inventory_logs (
                        item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note
                    ) VALUES ('ingredient', ?, ?, 'IMPORT', ?, ?, ?)
                """, (ing_id, order["dest_warehouse_id"], rec_qty, dest_new_stock, f"Nhập kho nguyên liệu từ OEM {order['code']}"))

                # Tự động ghi nhận giá vốn hoàn thiện vào price_history
                cur.execute("""
                    INSERT INTO price_history (ingredient_id, supplier_id, purchase_price, effective_date, note)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
                """, (ing_id, order["partner_id"], full_unit_cost, f"Giá vốn gia công OEM {order['code']} (Phôi: {round(material_cost_per_unit, 2)} + Công ròng: {round(net_proc_cost, 2)})"))

            else:
                # Nhánh gia công thành phẩm sản phẩm (Product) hiện hành giữ nguyên
                prod_id = it["product_id"]
                ...
```

- [ ] **Step 4: Chạy test để xác nhận toàn bộ quy trình nghiệm thu PASS**
Lệnh:
`pytest tests/test_oem_ingredient_subcontracting.py::test_oem_receive_ingredient_order_and_cost_accounting -v`

- [ ] **Step 5: Checkpoint Task 4**

---

### Task 5: Frontend - Giao Diện Phân Loại Gia Công OEM & Quick Search Nguyên Liệu

**Files:**
- Modify: `templates/index.html:4425-4560, 4625-4655`
- Modify: `static/js/modules/productions.js:8800-8850, 9316-9500, 9969-10140`
- Test: `tests/test_html_integrity.py` (hoặc kiểm tra cú pháp JS bằng `node -c`)

**Interfaces:**
- Consumes: Modal `#modal-create-oem`, `#modal-receive-oem`
- Produces:
  - Bộ chuyển đổi loại hình gia công: `target_type = 'product'` vs `'ingredient'`
  - Quick-Search tự động nạp danh sách nguyên liệu khi chọn gia công nguyên liệu
  - Tự động gọi API `/api/oem/calculate-bom-stock` với `item_type: 'ingredient'`

- [ ] **Step 1: Cập nhật HTML Modal Tạo Đơn OEM (`templates/index.html`)**
Thêm bộ chọn Segmented Pills trên đầu phần thông tin đơn:
```html
<div class="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-slate-200">
    <span class="font-bold text-gray-700 text-xs">Loại hình gia công:</span>
    <div class="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
        <button type="button" id="btn-oem-target-product" onclick="setOEMTargetType('product')" 
                class="px-3 py-1 text-xs font-bold rounded-md bg-amber-600 text-white shadow transition">
            📦 Thành Phẩm Bán Lẻ
        </button>
        <button type="button" id="btn-oem-target-ingredient" onclick="setOEMTargetType('ingredient')" 
                class="px-3 py-1 text-xs font-bold rounded-md text-slate-700 hover:text-slate-900 transition">
            🧪 Nguyên Vật Liệu / Phôi In
        </button>
    </div>
    <input type="hidden" id="oem-create-target-type" value="product">
</div>
```

- [ ] **Step 2: Cập nhật JavaScript `static/js/modules/productions.js`**
- Thêm hàm `setOEMTargetType(type)`:
  ```javascript
  let currentOEMTargetType = 'product';
  function setOEMTargetType(type) {
      currentOEMTargetType = type;
      document.getElementById('oem-create-target-type').value = type;
      const btnProd = document.getElementById('btn-oem-target-product');
      const btnIng = document.getElementById('btn-oem-target-ingredient');
      const quickInp = document.getElementById('oem-prod-quick-search-input');
      const tableHead = document.querySelector('#modal-create-oem table th');

      if (type === 'ingredient') {
          btnIng.className = 'px-3 py-1 text-xs font-bold rounded-md bg-amber-600 text-white shadow transition';
          btnProd.className = 'px-3 py-1 text-xs font-bold rounded-md text-slate-700 hover:text-slate-900 transition';
          if (quickInp) quickInp.placeholder = '🔍 Gõ tên hoặc mã nguyên vật liệu / tem / phôi cần gia công...';
          if (tableHead) tableHead.innerText = 'Nguyên Liệu / Bán Thành Phẩm';
      } else {
          btnProd.className = 'px-3 py-1 text-xs font-bold rounded-md bg-amber-600 text-white shadow transition';
          btnIng.className = 'px-3 py-1 text-xs font-bold rounded-md text-slate-700 hover:text-slate-900 transition';
          if (quickInp) quickInp.placeholder = '🔍 Gõ tên hoặc mã sản phẩm gia công để thêm nhanh vào đơn...';
          if (tableHead) tableHead.innerText = 'Sản Phẩm Gia Công';
      }
      // Xóa các dòng item cũ khi đổi loại để tránh lẫn lộn
      const tbody = document.getElementById('oem-create-items-body');
      if (tbody) tbody.innerHTML = '';
      recalcCreateOEMMath();
  }
  window.setOEMTargetType = setOEMTargetType;
  ```
- Cập nhật hàm lọc Dropdown tìm kiếm nhanh: khi `currentOEMTargetType === 'ingredient'`, tìm trong mảng `allIngredients` (gọi tải từ `/api/ingredients` nếu chưa có).
- Cập nhật hàm `recalcCreateOEMMath`: gom `selectedItems` kèm `item_type: currentOEMTargetType` và `ingredient_id: id` để truyền vào `/api/oem/calculate-bom-stock`.
- Cập nhật hàm `submitCreateOEMOrder`: truyền `target_type: currentOEMTargetType` và từng item chứa `item_type`, `ingredient_id` hoặc `product_id`.

- [ ] **Step 3: Kiểm tra tính hợp lệ của mã nguồn Frontend**
Lệnh:
`node -c static/js/modules/productions.js`

- [ ] **Step 4: Checkpoint Task 5**

---

### Task 6: Kiểm Thử Toàn Diện & Dọn Dẹp Dữ Liệu Test (Regression & Cleanup)

**Files:**
- Modify: `tests/test_oem_ingredient_subcontracting.py`
- Test: Toàn bộ suite `tests/test_oem_*.py`

- [ ] **Step 1: Bổ sung teardown dọn dẹp dữ liệu trong fixture của `test_oem_ingredient_subcontracting.py`**
- [ ] **Step 2: Chạy toàn bộ các bài test liên quan OEM để đảm bảo không bị regression:**
Lệnh:
`pytest tests/test_oem_bom_cost_calculation.py tests/test_oem_order_discount_modes.py tests/test_oem_ingredient_subcontracting.py -v`
- [ ] **Step 3: Checkpoint Task 6**

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-17-oem-material-subcontracting.md`.

**1. Subagent-Driven (recommended)** - Fresh subagent per task, review giữa các task
**2. Inline Execution** - Execute trong session này, batch có checkpoint

**Chọn hướng nào?**

---

## External Agent Delegation Prompt Template

```text
Thực thi tuần tự từng Task từ Task 1 đến Task 6 theo kế hoạch docs/superpowers/plans/2026-10-17-oem-material-subcontracting.md.

RÀNG BUỘC PHẠM VI (STRICT):
1. Không sửa ngoài phạm vi: Chỉ chạm đúng file, hàm, dòng chỉ định trong từng Task. Giữ nguyên 100% logic, hàm và comment lân cận. Tuyệt đối không reformat cả file hay tự ý refactor.
2. Bằng chứng kiểm tra thực: Sau mỗi Task, bắt buộc chạy lệnh verification thực tế (pytest tests/test_oem_ingredient_subcontracting.py -v hoặc node -c). Copy nguyên văn terminal output làm bằng chứng. Cấm tự báo PASS không kèm log.
3. Dừng theo nấc tuần tự: Hoàn thành xong 1 Task, xuất log test, dừng lại chờ xác nhận mới làm Task tiếp theo. Tuyệt đối không làm gộp.
```

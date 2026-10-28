# Order Return and Exchange Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Triển khai tính năng Đổi hàng & Trả hàng cho hệ thống POS bán lẻ bám theo đơn hàng gốc, tạo phiếu chứng từ độc lập, tự động cập nhật kho, công nợ và dòng tiền cashbook.

**Architecture:** 
1. Database: Bổ sung 2 bảng `order_returns` và `order_return_items` trong SQLite (`database.py`), liên kết đơn gốc `original_order_id` và đơn đổi mới `exchange_order_id`.
2. Backend API: Mở rộng `routers/pos.py` với các endpoint tính số lượng khả dụng được trả, thực thi transaction đổi/trả toàn vẹn và tra cứu phiếu trả.
3. Frontend UI: Modal 2 cột trong `templates/index.html` (chọn món trả + chọn món đổi mới bù trừ chênh lệch) kích hoạt từ modal xem hóa đơn hoặc danh sách hóa đơn.

**Tech Stack:** FastAPI, SQLite (Python stdlib sqlite3), Vanilla JS, Tailwind CSS, Pytest.

## Global Constraints
- Tuân thủ nguyên tắc không sửa đè hoặc xóa đơn hàng cũ khi trả hàng.
- Không cho phép trả quá số lượng còn lại (`quantity_available = quantity_bought - sum(quantity_returned)`).
- Không thêm thư viện phụ thuộc mới ngoài những thư viện đã có trong `requirements.txt`.
- Đảm bảo transaction rollback nếu có bất kỳ lỗi nào trong quá trình tạo phiếu trả, tạo đơn đổi, cập nhật kho hoặc sổ quỹ.

---

## File Structure Map
| File | Responsibility |
|---|---|
| `database.py:610+` | Migration tạo bảng `order_returns` và `order_return_items` |
| `schemas.py` | Schema Pydantic cho request tạo phiếu trả/đổi hàng |
| `routers/pos.py` | API endpoints `returnable-items`, tạo phiếu `returns`, và tra cứu danh sách |
| `tests/test_order_return_exchange.py` | Test cases bao quát toàn bộ logic tính toán, chặn vượt số lượng, hoàn kho và dòng tiền |
| `templates/index.html` | Modal `modal-order-return-exchange`, nút kích hoạt và logic JS gọi API |

---

### Task 1: Database Migration cho `order_returns` và `order_return_items`

**Files:**
- Modify: `database.py:610`
- Test: `tests/test_order_return_exchange.py`

**Interfaces:**
- Produces: Bảng `order_returns` và `order_return_items` tồn tại trong SQLite DB.

- [x] **Step 1: Write the failing test**
Viết test trong `tests/test_order_return_exchange.py` kiểm tra 2 bảng `order_returns` và `order_return_items` được tạo tự động khi gọi `init_db()`.
```python
from database import init_db, get_db

def test_return_tables_exist():
    init_db()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('order_returns', 'order_return_items')")
    tables = {row[0] for row in cur.fetchall()}
    conn.close()
    assert "order_returns" in tables
    assert "order_return_items" in tables
```

- [x] **Step 2: Run test to verify it fails**
Chạy `pytest tests/test_order_return_exchange.py -k test_return_tables_exist` để xác nhận test fail khi chưa có schema.

- [x] **Step 3: Write minimal implementation**
Trong `database.py`, thêm câu lệnh DDL tạo 2 bảng `order_returns` và `order_return_items`:
```sql
CREATE TABLE IF NOT EXISTS order_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    original_order_id INTEGER NOT NULL,
    exchange_order_id INTEGER,
    customer_id INTEGER,
    staff_id INTEGER,
    shift_id INTEGER,
    return_total REAL NOT NULL DEFAULT 0,
    exchange_total REAL NOT NULL DEFAULT 0,
    diff_amount REAL NOT NULL DEFAULT 0,
    refund_method TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(original_order_id) REFERENCES orders(id),
    FOREIGN KEY(exchange_order_id) REFERENCES orders(id),
    FOREIGN KEY(customer_id) REFERENCES contacts(id),
    FOREIGN KEY(staff_id) REFERENCES staff(id),
    FOREIGN KEY(shift_id) REFERENCES shifts(id)
);

CREATE TABLE IF NOT EXISTS order_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    original_item_id INTEGER,
    quantity REAL NOT NULL,
    return_price REAL NOT NULL,
    subtotal REAL NOT NULL,
    return_to_stock INTEGER DEFAULT 1,
    reason TEXT,
    FOREIGN KEY(return_id) REFERENCES order_returns(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(original_item_id) REFERENCES order_items(id)
);
```

- [x] **Step 4: Run test to verify it passes**
Chạy lại `pytest tests/test_order_return_exchange.py -k test_return_tables_exist`.

- [ ] **Step 5: Commit task state**

---

### Task 2: API `GET /api/pos/orders/{code}/returnable-items`

**Files:**
- Modify: `routers/pos.py`
- Test: `tests/test_order_return_exchange.py`

**Interfaces:**
- Produces: `GET /api/pos/orders/{code}/returnable-items` -> `{ "order_id": int, "code": str, "customer_id": int, "items": [{ "id": int, "product_id": int, "product_name": str, "quantity_bought": float, "quantity_returned": float, "quantity_available": float, "unit_price_net": float }] }`

- [x] **Step 1: Write the failing test**
Tạo đơn hàng mẫu có 2 món, gọi endpoint `returnable-items`, kiểm tra tính đúng số lượng còn được trả và đơn giá net sau chiết khấu.
```python
def test_get_returnable_items(client, auth_headers):
    # Tạo đơn hàng test
    # Gọi GET /api/pos/orders/{code}/returnable-items
    # Assert quantity_available == quantity_bought
```

- [x] **Step 2: Run test to verify it fails**
Chạy test để xác nhận 404 Not Found.

- [x] **Step 3: Write minimal implementation**
Thêm endpoint `get_order_returnable_items(code: str)` trong `routers/pos.py`:
- Truy vấn thông tin `orders` và `order_items`.
- Truy vấn `SUM(quantity)` từ `order_return_items` đã trả cho từng `order_items.id`.
- Tính `unit_price_net = (item.subtotal / order.total_amount * order.final_amount) / item.quantity` nếu có giảm giá tổng đơn, hoặc bằng `item.price` nếu không giảm giá.

- [x] **Step 4: Run test to verify it passes**
Chạy `pytest tests/test_order_return_exchange.py -k test_get_returnable_items`.

- [x] **Step 5: Commit task state**

---

### Task 3: API `POST /api/pos/returns` (Xử lý Đổi / Trả Hàng)

**Files:**
- Modify: `schemas.py`
- Modify: `routers/pos.py`
- Test: `tests/test_order_return_exchange.py`

**Interfaces:**
- Produces: `POST /api/pos/returns` nhận payload đổi/trả, cập nhật kho, xuất chứng từ, xử lý thu/chi cashbook trong 1 transaction SQLite an toàn.

- [x] **Step 1: Write the failing test**
Viết test trường hợp chỉ trả hàng:
- Món trả được cộng lại tồn kho nếu `return_to_stock=1`.
- Sinh phiếu `order_returns` với mã `RET-...`.
- Sinh phiếu chi cashbook nếu hoàn tiền mặt.
- Thử trả tiếp quá số lượng khả dụng -> verify trả về HTTP 400.
Viết test trường hợp đổi hàng:
- Trả món A (giá 100k), lấy món B (giá 150k) -> chênh lệch 50k thu thêm.
- Verify tạo đơn hàng mới cho món B, trừ tồn kho món B.

- [x] **Step 2: Run test to verify it fails**
Chạy test và quan sát lỗi do endpoint chưa được định nghĩa.

- [x] **Step 3: Write minimal implementation**
1. Định nghĩa `ReturnItemSchema`, `ExchangeItemSchema`, `CreateReturnRequest` trong `schemas.py`.
2. Tạo hàm `generate_return_code(cur)` sinh mã `RET-YYYYMMDD-XXXX`.
3. Cài đặt endpoint `create_order_return(req: CreateReturnRequest, user=Depends(require_permission("pos.sell")))` trong `routers/pos.py`.
4. Mở transaction `sqlite3`:
   - Kiểm tra `quantity <= quantity_available`.
   - Nếu có `exchange_items`: Tạo đơn bán hàng mới `orders` chứa món mới và trừ tồn kho `products`.
   - Lưu `order_returns` và `order_return_items`.
   - Nếu `return_to_stock == 1`: Cộng tồn kho `products.stock`.
   - Ghi nhận `cashbook` phiếu thu (nếu `diff_amount > 0` và thanh toán tiền mặt) hoặc phiếu chi (nếu `diff_amount < 0`).
   - `conn.commit()`.

- [x] **Step 4: Run test to verify it passes**
Chạy `pytest tests/test_order_return_exchange.py` để xác nhận toàn bộ test cases đều PASS.

- [x] **Step 5: Commit task state**

---

### Task 4: API Danh Sách & Chi Tiết Phiếu Trả Hàng

**Files:**
- Modify: `routers/pos.py`
- Test: `tests/test_order_return_exchange.py`

**Interfaces:**
- Produces: `GET /api/pos/returns` (hỗ trợ phân trang, lọc theo khoảng ngày, tìm kiếm mã đơn gốc/mã phiếu trả) và `GET /api/pos/returns/{code}` (chi tiết phiếu phục vụ in ấn).

- [x] **Step 1: Write the failing test**
Viết test gọi `GET /api/pos/returns` và `GET /api/pos/returns/{code}` xác nhận lấy đủ thông tin các món trả, món đổi và tiền chênh lệch.

- [x] **Step 2: Run test to verify it fails**

- [x] **Step 3: Write minimal implementation**
Cài đặt 2 endpoint tra cứu trong `routers/pos.py`.

- [x] **Step 4: Run test to verify it passes**

- [x] **Step 5: Commit task state**

---

### Task 5: Giao diện Modal Đổi / Trả Hàng (`modal-order-return-exchange`)

**Files:**
- Modify: `templates/index.html`

**Interfaces:**
- Produces: Modal HTML 2 cột trực quan + hàm JavaScript `openModalOrderReturn(orderCode)`, `renderReturnItems()`, `renderExchangeItems()`, `submitOrderReturn()`.

- [x] **Step 1: Thêm Markup Modal trong `templates/index.html`**
Thêm div `#modal-order-return-exchange` với 2 cột:
- Cột 1: Danh sách món từ đơn gốc kèm input số lượng, checkbox hoàn kho, lý do.
- Cột 2: Thanh tìm kiếm sản phẩm đổi kèm danh sách món mới thêm vào giỏ đổi.
- Footer: Tổng tiền hoàn, Tổng tiền đổi, Chênh lệch bù trừ, chọn hình thức thanh toán, nút xác nhận.

- [x] **Step 2: Thêm Logic Javascript xử lý dữ liệu**
- Hàm `openModalOrderReturn(orderCode)`: Gọi `GET /api/pos/orders/{orderCode}/returnable-items`, đổ dữ liệu vào bảng món trả.
- Xử lý sự kiện thay đổi số lượng trả: tự động cập nhật tổng tiền hoàn trả.
- Tìm kiếm và thêm sản phẩm đổi mới: tự động cập nhật tổng tiền đổi mới.
- Tính tự động `diff_amount`: đổi trạng thái giữa "Cần thu thêm của khách" và "Cần hoàn trả lại khách".
- Hàm `submitOrderReturn()`: Gom payload gọi `POST /api/pos/returns`, hiển thị thông báo thành công, in phiếu nếu cần và reload dữ liệu.

- [x] **Step 3: Gắn nút gọi Modal**
- Thêm nút `🔄 Đổi / Trả Hàng` vào modal xem hóa đơn `#modal-order-view`.
- Thêm nút icon đổi/trả trong bảng danh sách hóa đơn `#tab-orders`.

- [x] **Step 4: Kiểm tra hiển thị & Luồng thao tác**
Mở browser/preview hoặc chạy test kiểm tra DOM render và hàm gọi API.

- [x] **Step 5: Commit task state**

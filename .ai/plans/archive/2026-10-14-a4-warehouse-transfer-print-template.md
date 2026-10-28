# Kế Hoạch Triển Khai: Mẫu In Phiếu Điều Chuyển Kho A4 & Tích Hợp Luồng Chuyển Kho

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Chuẩn hóa mẫu in Phiếu Điều Chuyển Kho Nội Bộ (Biên bản bàn giao vận chuyển & điều chuyển) khổ A4 chuẩn mực, ẩn giá vốn, và tích hợp luồng in tự động ngay khi tạo phiếu hoặc xem lịch sử.

**Architecture:** Mở rộng backend `GET /api/inventory/transfers/{id}` trả thêm `sku`; xây dựng `printStockTransferA4(transferId)` trong `static/js/app.js` in qua iframe độc lập; bổ sung nút in trên UI tại bảng lịch sử, modal chi tiết và thông báo sau khi tạo phiếu.

**Tech Stack:** FastAPI, SQLite, Vanilla JavaScript, HTML/CSS (@page A4 media print).

## Global Constraints
- Không làm lộ giá vốn hoặc thành tiền trên phiếu chuyển kho A4.
- CSS in A4 phải dùng `@page { size: A4; margin: 10mm; }` và hỗ trợ in qua iframe ẩn.
- Giữ vững tính toàn vẹn của các test hiện có (`pytest`).

## Scope Boundary & Anti-Drift Guards (Strict)
1. **Chạm đúng biên:** Chỉ sửa `routers/inventory.py`, `static/js/app.js`, `templates/index.html`, và tạo test mới `tests/test_warehouse_transfer_print.py`.
2. **Bằng chứng test thực tế:** Chạy lệnh `pytest tests/test_warehouse_transfer_print.py tests/test_warehouse_transfers.py` và xuất đầy đủ log.
3. **Tuần tự theo nấc:** Hoàn thành từng Task và xác nhận kết quả trước khi sang Task tiếp theo.

---

### Task 1: Mở rộng Backend API Chi Tiết Phiếu Chuyển Kho Bổ Sung Mã SKU

**Files:**
- Modify: `routers/inventory.py:1180-1195`
- Test: `tests/test_warehouse_transfer_print.py`

**Interfaces:**
- Consumes: `GET /api/inventory/transfers/{transfer_id}`
- Produces: JSON payload với `items: [{ ..., "sku": "..." }]`

- [ ] **Step 1: Viết test kiểm tra trường `sku` trong chi tiết phiếu chuyển kho**
  Tạo `tests/test_warehouse_transfer_print.py` kiểm tra `GET /api/inventory/transfers/{id}` trả về `sku` cho cả sản phẩm và nguyên liệu.
- [ ] **Step 2: Chạy test để xác nhận test fail**
  Chạy `pytest tests/test_warehouse_transfer_print.py` (fail vì chưa join lấy SKU).
- [ ] **Step 3: Sửa `routers/inventory.py`**
  Cập nhật câu query trong `get_transfer_detail` và `list_transfers` để lấy `sku` từ `products` hoặc `ingredients.code`.
- [ ] **Step 4: Chạy lại test để xác nhận test pass**
  Chạy `pytest tests/test_warehouse_transfer_print.py`.

---

### Task 2: Xây dựng Hàm In Phiếu Chuyển Kho A4 Chuẩn Nghiệp Vụ Trong Frontend

**Files:**
- Modify: `static/js/app.js`
- Test: `tests/test_warehouse_transfer_print.py`

**Interfaces:**
- Produces: Hàm JavaScript `window.printStockTransferA4(transferId)`

- [ ] **Step 1: Viết test kiểm tra sự tồn tại và logic của `printStockTransferA4` trong `static/js/app.js`**
  Kiểm tra hàm có `iframe-stock-transfer-print`, `@page { size: A4`, 4 chữ ký (Người lập, Thủ kho xuất, Vận chuyển, Thủ kho nhận), và không chứa các từ khóa cột giá vốn/thành tiền trên phiếu.
- [ ] **Step 2: Chạy test để xác nhận test fail**
- [ ] **Step 3: Triển khai hàm `printStockTransferA4(transferId)` trong `static/js/app.js`**
  Fetch data từ API, render HTML mẫu A4 chuẩn như demo, tạo iframe ẩn và gọi `contentWindow.print()`.
- [ ] **Step 4: Chạy test để xác nhận test pass**

---

### Task 3: Tích Hợp Nút In Vào Modal Chi Tiết, Bảng Lịch Sử & Thông Báo Tạo Phiếu

**Files:**
- Modify: `templates/index.html`
- Modify: `static/js/app.js`
- Test: `tests/test_warehouse_transfer_print.py`

- [ ] **Step 1: Viết test kiểm tra UI**
  Kiểm tra nút `printStockTransferA4` có mặt trong `templates/index.html` (trong `modal-transfer-detail`), trong hàm render `loadStockTransfersList`, và trong callback thành công của `submitStockTransfer`.
- [ ] **Step 2: Chạy test để xác nhận test fail**
- [ ] **Step 3: Cập nhật `templates/index.html` và `static/js/app.js`**
  - Thêm nút In A4 vào `modal-transfer-detail` (cạnh nút Đóng).
  - Thêm nút `🖨️ In` ở từng dòng trong bảng `table-transfer-history`.
  - Trong `submitStockTransfer`: sau khi thành công, hỏi người dùng hoặc cung cấp nút In Phiếu A4 ngay lập tức cho ID vừa tạo.
- [ ] **Step 4: Chạy test toàn diện**
  Chạy `pytest tests/test_warehouse_transfer_print.py tests/test_warehouse_transfers.py` và `pytest tests/test_print_templates_and_css.py`.

# Kế Hoạch Triển Khai: Sửa, Xóa Phiếu Chuyển Kho & Lưu Vết Người Tạo, Người Sửa Cuối

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Triển khai API và giao diện cho phép Sửa, Xóa phiếu chuyển kho kèm cơ chế hoàn kho tự động hai chiều và theo dõi người tạo (`created_by`), người sửa cuối (`updated_by`).

**Architecture:** Mở rộng schema `warehouse_transfers` trong SQLite; bổ sung endpoint `PUT` và `DELETE` trong `routers/inventory.py` có rollback tồn kho và audit log; mở rộng UI frontend trong `static/js/app.js` và `templates/index.html`.

**Tech Stack:** FastAPI, SQLite, Vanilla JavaScript, HTML/CSS.

## Global Constraints
- Phải hoàn trả đúng tồn kho xuất (+qty) và kho nhập (-qty) khi xóa hoặc sửa phiếu.
- Phải ghi nhận `inventory_logs` khi hoàn kho.
- Lưu vết chính xác `created_by` và `updated_by` từ tài khoản đăng nhập (`user`).
- Mẫu in A4 hiển thị người lập phiếu lấy từ `created_by`.

## Scope Boundary & Anti-Drift Guards (Strict)
1. **Chạm đúng biên:** Chỉ sửa `database.py`, `routers/inventory.py`, `static/js/app.js`, `templates/index.html`, và test `tests/test_warehouse_transfers.py`.
2. **Bằng chứng test thực tế:** Chạy lệnh `pytest tests/test_warehouse_transfers.py tests/test_warehouse_transfer_print.py` xuất đầy đủ log.
3. **Tuần tự theo nấc:** Hoàn thành từng Task và kiểm tra kết quả trước khi sang Task tiếp theo.

---

### Task 1: Mở Rộng Schema DB & Lưu Vết `created_by` Khi Tạo Phiếu Chuyển Kho

**Files:**
- Modify: `database.py:539-555`
- Modify: `routers/inventory.py:1009-1045, 1155-1200`
- Test: `tests/test_warehouse_transfers.py`

**Interfaces:**
- Produces: Bảng `warehouse_transfers` có các cột `created_by`, `updated_by`, `updated_at`.
- Endpoints: `POST /api/inventory/transfer` lưu `created_by`; `GET /api/inventory/transfers` và `GET /api/inventory/transfers/{id}` trả về 3 cột này.

- [ ] **Step 1: Viết test kiểm tra `created_by` được lưu và trả về khi tạo phiếu**
- [ ] **Step 2: Chạy test để xác nhận fail**
- [ ] **Step 3: Cập nhật migration trong `database.py` và lưu `created_by` trong `routers/inventory.py`**
- [ ] **Step 4: Chạy test để xác nhận pass**

---

### Task 2: Backend API Xóa Phiếu Chuyển Kho Hoàn Tác Tồn Kho (DELETE)

**Files:**
- Modify: `routers/inventory.py`
- Test: `tests/test_warehouse_transfers.py`

**Interfaces:**
- Endpoint: `DELETE /api/inventory/transfers/{transfer_id}`
- Behavior: Cộng trả tồn kho xuất, trừ thu hồi tồn kho nhập, ghi log, xóa item và xóa phiếu.

- [ ] **Step 1: Viết test kiểm tra xóa phiếu chuyển kho**
  Tạo phiếu chuyển kho, kiểm tra tồn kho thay đổi -> gọi DELETE -> xác nhận tồn kho được hoàn nguyên tại cả 2 kho và phiếu bị xóa khỏi DB.
- [ ] **Step 2: Chạy test để xác nhận fail (405 Method Not Allowed / 404)**
- [ ] **Step 3: Triển khai endpoint `delete_warehouse_transfer` trong `routers/inventory.py`**
- [ ] **Step 4: Chạy test để xác nhận pass**

---

### Task 3: Backend API Chỉnh Sửa Phiếu Chuyển Kho & Lưu Vết `updated_by` (PUT)

**Files:**
- Modify: `routers/inventory.py`
- Test: `tests/test_warehouse_transfers.py`

**Interfaces:**
- Endpoint: `PUT /api/inventory/transfers/{transfer_id}`
- Behavior: Hoàn tác lượng cũ, kiểm tra tồn kho xuất mới, trừ kho xuất mới, cộng kho nhập mới, cập nhật `updated_by`, `updated_at`.

- [ ] **Step 1: Viết test kiểm tra cập nhật phiếu chuyển kho**
  Chuyển hàng 1 -> sửa thành hàng 2 với số lượng khác -> kiểm tra tồn kho của cả 2 mặt hàng tại 2 kho được tính đúng, `updated_by` được lưu.
- [ ] **Step 2: Chạy test để xác nhận fail**
- [ ] **Step 3: Triển khai endpoint `update_warehouse_transfer` trong `routers/inventory.py`**
- [ ] **Step 4: Chạy test để xác nhận pass**

---

### Task 4: Giao Diện Frontend: Nút Sửa, Xóa, Chế Độ Edit & Mẫu In A4

**Files:**
- Modify: `static/js/app.js`
- Modify: `templates/index.html`
- Test: `tests/test_warehouse_transfer_print.py`

**Interfaces:**
- UI: Nút ✏️ Sửa và 🗑️ Xóa trong `#table-transfer-history`.
- UI: Hỗ trợ nạp phiếu cũ vào form để sửa và lưu qua `PUT`.
- Print: Dưới chữ ký "Người Lập Phiếu" in tên thật từ `created_by`.

- [ ] **Step 1: Viết test kiểm tra sự có mặt của các hàm và thành phần UI sửa/xóa**
- [ ] **Step 2: Triển khai hàm `editStockTransfer(id)` và `deleteStockTransfer(id)` trong `static/js/app.js`**
- [ ] **Step 3: Cập nhật giao diện trong `templates/index.html` và hiển thị `created_by` trên mẫu in A4**
- [ ] **Step 4: Chạy toàn bộ test suite (`pytest`) và PyInstaller build**

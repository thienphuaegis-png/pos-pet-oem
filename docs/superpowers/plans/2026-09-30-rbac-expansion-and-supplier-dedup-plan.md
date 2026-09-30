# Kế Hoạch Triển Khai: Mở Rộng Phân Quyền & Chống Trùng Nhà Cung Cấp Khi Import

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Cấp quyền xem và thao tác Sổ Quỹ, Dòng Tiền, Khách Hàng/Đối Tác cho Thủ Kho, Thu Ngân và Kế Toán; đồng thời sửa triệt để lỗi trùng lặp Nhà Cung Cấp khi Import Excel kèm script tự động hợp nhất các bản ghi bị nhân đôi trong database.

**Architecture:** Mở rộng thuộc tính `data-role` tại giao diện frontend `templates/index.html`, cập nhật danh mục quyền `role_permissions` trong `database.py` và nới lỏng quyền thanh toán nợ trong `routers/oem.py`. Tại backend import (`routers/partners.py`), bổ sung làm sạch định dạng SĐT và cơ chế so khớp kép (SĐT + Tên chuẩn hóa). Xây dựng engine khử trùng và chuyển giao khóa ngoại cho các bản ghi trùng lặp trong cơ sở dữ liệu.

**Tech Stack:** Python 3, FastAPI, SQLite3, HTML5/TailwindCSS, openpyxl, pytest.

---

## Danh Sách Tệp Thay Đổi

| Tệp | Trách nhiệm |
|---|---|
| `templates/index.html` | Cập nhật `data-role` cho 3 nút chuyển tab `contacts`, `cashbook`, `cashflow-debts` |
| `database.py` | Cập nhật `DEFAULT_ROLE_PERMS`, bổ sung migration quyền cho DB hiện hữu, thêm hàm `merge_duplicate_contacts()` |
| `routers/oem.py` | Cập nhật kiểm tra quyền linh hoạt cho API thanh toán công nợ NCC (`/pay-supplier`, `/pay-order`) |
| `routers/partners.py` | Cải tiến hàm import Excel: chuẩn hóa SĐT, so khớp kép theo SĐT và Tên chuẩn hóa, cập nhật thông tin nếu đã tồn tại |
| `scripts/deduplicate_contacts.py` | Script dòng lệnh độc lập cho phép quét và hợp nhất đối tác trùng tên an toàn |
| `tests/test_rbac_and_supplier_dedup.py` | Bộ kiểm thử tự động xác minh phân quyền và logic chống/khử trùng NCC |

---

## Chi Tiết Các Nhiệm Vụ

### Task 1: Cập Nhật Thuộc Tính Hiển Thị Sidebar Trên Giao Diện

**Files:**
- Modify: `templates/index.html:774-791`

- [ ] **Step 1: Sửa `data-role` cho tab `contacts`, `cashbook`, `cashflow-debts`**
  - Mở rộng cho `cashier,warehouse` truy cập:
    - Tab `contacts`: `data-role="owner,accountant,cashier,warehouse"`
    - Tab `cashbook`: `data-role="accountant,owner,cashier,warehouse"`
    - Tab `cashflow-debts`: `data-role="accountant,owner,cashier,warehouse"`
- [ ] **Step 2: Chạy `python -m pytest tests/test_html_integrity.py` để đảm bảo toàn vẹn cấu trúc HTML**

---

### Task 2: Mở Rộng Quyền Trong Cơ Sở Dữ Liệu & Backend

**Files:**
- Modify: `database.py:786-805`
- Modify: `routers/oem.py:864-875, 959-970`

- [ ] **Step 1: Cập nhật `DEFAULT_ROLE_PERMS` trong `database.py`**
  - Cấp `"cashbook.manage"`, `"partners.manage"` cho `cashier` và `warehouse`.
  - Thêm migration tự động đồng bộ quyền mới vào bảng `role_permissions` nếu chưa tồn tại.
- [ ] **Step 2: Nới lỏng quyền trong `routers/oem.py`**
  - Thay vì chỉ chấp nhận `oem.manage`, cho phép người dùng có bất kỳ quyền nào trong: `oem.manage`, `partners.manage`, hoặc `cashbook.manage` được thực hiện thanh toán nợ NCC.

---

### Task 3: Chống Trùng & Nhận Diện Nhà Cung Cấp Khi Import Excel

**Files:**
- Modify: `routers/partners.py:218-292`

- [ ] **Step 1: Thêm các hàm phụ trợ chuẩn hóa dữ liệu**
  - `clean_phone_number(p)`: Chuyển chuỗi, loại bỏ đuôi `.0`, bỏ ký tự đặc biệt, chuẩn hóa khoảng trắng.
  - Chuẩn hóa tên: `LOWER(TRIM(name))`.
- [ ] **Step 2: Triển khai thuật toán so khớp kép**
  - Kiểm tra xem SĐT chuẩn hóa có tồn tại trong hệ thống chưa (`contacts WHERE phone = ? AND type = ?`).
  - Nếu không có SĐT hoặc không khớp SĐT: Kiểm tra xem Tên chuẩn hóa có tồn tại chưa (`contacts WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND type = ?`).
  - Nếu tìm thấy: Cập nhật thông tin (SĐT nếu cũ chưa có, Địa chỉ mới, cộng dồn hoặc giữ công nợ), tăng biến `updated`.
  - Nếu không tìm thấy: Tạo mới (`INSERT`), tăng biến `created`.

---

### Task 4: Xây Dựng Engine Khử Trùng & Hợp Nhất NCC Hiện Hữu

**Files:**
- Modify: `database.py` (hàm `deduplicate_contacts_in_db()`)
- Create: `scripts/deduplicate_contacts.py`

- [ ] **Step 1: Xây dựng hàm `merge_duplicate_contacts(conn)`**
  - Tìm các nhóm trùng `LOWER(TRIM(name)), type HAVING COUNT(*) > 1`.
  - Xác định `master_id` (bản ghi đầu tiên hoặc có nhiều thông tin nhất).
  - Dồn `debt` của các bản ghi trùng vào `master_id`.
  - Chuyển giao toàn bộ khóa ngoại trong `purchases`, `oem_orders`, `supplier_items`, `inventory_logs`, `warehouses`, `cashbook`, `orders`, `pets`, v.v.
  - Xóa các bản ghi trùng phụ khỏi `contacts`.
- [ ] **Step 2: Viết script dòng lệnh `scripts/deduplicate_contacts.py` để quét và báo cáo kết quả**
- [ ] **Step 3: Gọi tự động migration khử trùng trong hàm khởi tạo `init_db()` của `database.py`**

---

### Task 5: Viết Kiểm Thử Tự Động & Nghiệm Thu Toàn Diện

**Files:**
- Create: `tests/test_rbac_and_supplier_dedup.py`

- [ ] **Step 1: Viết test kiểm tra quyền truy cập tab và API của `warehouse` và `cashier`**
- [ ] **Step 2: Viết test kịch bản Import Excel với 2 dòng NCC trùng tên (1 có SĐT, 1 không có SĐT)**
- [ ] **Step 3: Viết test kiểm tra hàm hợp nhất NCC trùng lặp chuyển giao đúng công nợ và đơn mua**
- [ ] **Step 4: Chạy toàn bộ test suite để xác minh không hồi quy:**
  - `python -m pytest tests/test_rbac_and_supplier_dedup.py`
  - `python -m pytest tests/test_html_integrity.py`
  - `python -m pytest tests/test_checkpoint_integrity.py`
  - `python -m pytest tests/test_auth.py`
- [ ] **Step 5: Cập nhật `PROJECT_STATE.md` và `PROJECT_MAP.html` ghi nhận checkpoint mới**

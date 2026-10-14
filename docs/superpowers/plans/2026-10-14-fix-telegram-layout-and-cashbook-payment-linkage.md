# Fix Telegram Layout & Cashbook Payment Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Sửa lỗi giao diện cấu hình Telegram hiển thị nhầm ở tab Nhập Hàng và chuẩn hóa toàn bộ logic tài chính: mọi giao dịch thanh toán phải được liên kết với phiếu Thu/Chi trong `cashbook`, kèm migration sinh bù chứng từ lịch sử.

**Architecture:** 
1. Frontend layout: Sửa đóng thẻ `</div>` trong `templates/index.html` để `#settings-sub-telegram` nằm gọn trong `#tab-settings`.
2. Database & Migration: Migration tự động kiểm tra và sinh bù phiếu Thu/Chi cho các đơn `purchases` và `orders` lịch sử có `paid_amount > 0`.
3. Backend logic: Cập nhật `routers/purchases.py` để tự động tạo phiếu chi `PC-NH` khi tạo đơn có trả trước, thêm API `POST /api/purchases/{code}/pay` để chi tiền thanh toán nợ phiếu nhập, và trả kèm thông tin phiếu chi liên kết trong `GET /api/purchases`.
4. Frontend UI: Bổ sung hiển thị mã phiếu chi liên kết và nút lập phiếu chi nhanh trên bảng danh sách phiếu nhập.

**Tech Stack:** FastAPI, SQLite (Python stdlib sqlite3), TailwindCSS, Vanilla JS, Pytest.

---

## File Structure

| File | Responsibility |
|---|---|
| `templates/index.html` | Sửa cấu trúc thẻ `</div>` đưa Telegram về đúng tab Cài Đặt |
| `scripts/migrate_cashbook_sync.py` | Script migration an toàn sinh bù phiếu thu/chi cho đơn cũ |
| `database.py` | Tự động chạy migration đồng bộ khi khởi động hệ thống |
| `routers/purchases.py` | Logic sinh phiếu chi khi tạo đơn, API thanh toán phiếu nhập, trả thông tin cashbook |
| `static/js/modules/purchases.js` | Hiển thị badge mã phiếu chi và modal thanh toán phiếu nhập nhanh |
| `tests/test_telegram_layout_and_cashbook_linkage.py` | Test suite kiểm thử toàn bộ layout và logic liên kết cashbook |

---

### Task 1: Sửa Lỗi Hiển Thị Telegram Trong `templates/index.html`

**Files:**
- Modify: `templates/index.html`
- Test: `tests/test_telegram_layout_and_cashbook_linkage.py`

**Spec:**
- Xóa thẻ `</div>` thừa ở dòng 8727 để `#tab-settings` không bị đóng sớm.
- Đảm bảo `#settings-sub-telegram` và `#settings-sub-reset-data` nằm bên trong `#tab-settings`.
- Cân bằng các thẻ `</div>` kết thúc `#tab-settings`.

- [ ] **Step 1: Viết test kiểm tra DOM hierarchy của `#tab-settings` và `#settings-sub-telegram`**
  - Tạo `tests/test_telegram_layout_and_cashbook_linkage.py` với test `test_telegram_subtab_inside_tab_settings()`.
- [ ] **Step 2: Chạy test để xác nhận test FAIL (hiện tại telegram nằm ngoài settings)**
- [ ] **Step 3: Chỉnh sửa `templates/index.html` xóa thẻ đóng sớm và cân bằng thẻ**
- [ ] **Step 4: Chạy lại test để xác nhận test PASS**

---

### Task 2: Script Migration Sinh Bù Phiếu Thu / Chi Lịch Sử

**Files:**
- Create: `scripts/migrate_cashbook_sync.py`
- Modify: `database.py`
- Test: `tests/test_telegram_layout_and_cashbook_linkage.py`

**Spec:**
- Hàm `sync_missing_cashbook_entries(conn)`:
  - Quét `purchases` có `paid_amount > 0` và chưa có `cashbook` với `ref_type = 'purchase' AND ref_id = purchases.id`.
    - Sinh mã `PC-NH-YYMMDD-XXX`.
    - Thêm vào `cashbook`: `type='out'`, `category='Chi tiền nhập hàng'`, `amount=paid_amount`, `contact_id=supplier_id`, `ref_type='purchase'`, `ref_id=id`, `fund_source=p.fund_source`, `created_at=p.created_at`.
  - Quét `orders` có `paid_amount > 0` và chưa có `cashbook` với `ref_type = 'order' AND ref_id = orders.id`.
    - Sinh mã `PT-BH-YYMMDD-XXX`.
    - Thêm vào `cashbook`: `type='in'`, `category='Thu tien ban hang'`, `amount=paid_amount`, `contact_id=customer_id`, `ref_type='order'`, `ref_id=id`, `fund_source='COMPANY'`, `created_at=ord.created_at`.
- Thêm bước gọi `sync_missing_cashbook_entries(conn)` vào cuối hàm `init_db()` trong `database.py`.

- [ ] **Step 1: Viết test `test_migration_sync_cashbook_for_purchases_and_orders`**
- [ ] **Step 2: Chạy test để xác nhận test FAIL**
- [ ] **Step 3: Tạo `scripts/migrate_cashbook_sync.py` và tích hợp vào `database.py`**
- [ ] **Step 4: Chạy test để xác nhận test PASS**

---

### Task 3: Backend Logic Liên Kết Phiếu Chi Với Phiếu Nhập Hàng

**Files:**
- Modify: `routers/purchases.py`
- Test: `tests/test_telegram_layout_and_cashbook_linkage.py`

**Spec:**
1. `GET /api/purchases`:
   - JOIN hoặc subquery lấy `cashbook_code`, `cashbook_id` của phiếu chi gắn với phiếu nhập.
2. `POST /api/purchases`:
   - Nếu `req.paid_amount > 0`: Sinh ngay phiếu chi `PC-NH` trong `cashbook` với `ref_type='purchase'`, `ref_id=purchase_id`, `fund_source=req.fund_source`.
3. `POST /api/purchases/{code}/pay`:
   - Request body: `amount: float`, `account_id: Optional[int]`, `fund_source: Optional[str]`, `note: Optional[str]`.
   - Kiểm tra phiếu nhập tồn tại, số tiền thanh toán hợp lệ (không vượt quá `debt_amount`).
   - Sinh phiếu chi `PC-NH` trong `cashbook`.
   - Cập nhật `paid_amount = paid_amount + amount`, `debt_amount = debt_amount - amount` trên `purchases`.
   - Giảm công nợ NCC (`contacts.debt = contacts.debt - amount`).

- [ ] **Step 1: Viết test kiểm tra tạo đơn nhập có trả trước sinh phiếu chi và API thanh toán nợ phiếu nhập**
- [ ] **Step 2: Chạy test xác nhận FAIL**
- [ ] **Step 3: Cập nhật `routers/purchases.py`**
- [ ] **Step 4: Chạy test xác nhận PASS**

---

### Task 4: Frontend Giao Diện Danh Sách & Thanh Toán Phiếu Nhập

**Files:**
- Modify: `static/js/modules/purchases.js`

**Spec:**
1. Trên bảng lịch sử đơn nhập kho:
   - Cột "Đã Trả" hoặc "Chứng Từ Sổ Quỹ":
     - Nếu có phiếu chi liên kết: Hiển thị badge xanh `PC-NH-...` click để xem chi tiết.
     - Nếu còn nợ (`debt_amount > 0`): Hiển thị nút `+ Chi tiền` nhỏ cạnh số tiền để thanh toán nhanh.
2. Modal thanh toán nhanh đơn nhập:
   - Cho phép nhân viên chọn số tiền, tài khoản thanh toán và bấm [Xác nhận chi tiền].
   - Gọi API `POST /api/purchases/{code}/pay` và reload lại danh sách + KPI.

- [ ] **Step 1: Cập nhật `static/js/modules/purchases.js`**
- [ ] **Step 2: Kiểm tra cú pháp JS và kiểm tra giao diện bằng unit test / headless check**

---

### Task 5: Kiểm Thử Toàn Diện & Bump Cache

**Files:**
- Modify: `version.json` (nếu cần cập nhật cache version)
- Test: Chạy toàn bộ pytest `pytest tests/test_telegram_layout_and_cashbook_linkage.py`

- [ ] **Step 1: Chạy toàn bộ test suites liên quan**
- [ ] **Step 2: Đảm bảo không có hồi quy (regression) ở các test pos, cashbook, purchases khác**

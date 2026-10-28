# Kế Hoạch Triển Khai: Universal Modal Escape & Backdrop Click, Tối Ưu Báo Cáo Tổng Hợp & Chuẩn Hóa Tác Nhân AI

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Hoàn thiện trải nghiệm UX đóng modal bằng ESC & click backdrop ngoài cho 4 phân hệ (Nhập hàng, OEM, Khách hàng, Dòng tiền & Nợ NCC), tối ưu tốc độ và bảo mật Báo Cáo Tổng Hợp (Composite index, Bearer token, Skeleton UI), đồng thời bỏ nhãn 'Copilot' ở tab Tác Nhân AI trên sidebar và header.

**Architecture:**
- **UI & Interaction:** Bổ sung thuộc tính `onclick="if(event.target === this) <closeFunc>()"` cho toàn bộ modal containers trong `templates/index.html`; mở rộng mảng `activeModals` trong bộ bắt sự kiện ESC tại `static/js/app.js`; xuất các hàm đóng modal ra `window` trong các file module tương ứng (`purchases.js`, `contacts.js`, `cashflow.js`, `productions.js`).
- **Reports Backend & CSDL:** Thêm composite indexes (`idx_orders_created_at_staff`, `idx_order_items_order_prod`, `idx_order_payments_order_method`, `idx_hotel_bookings_created_at`, `idx_pet_service_tickets_created_status`) trong `database.py` để tăng tốc độ truy vấn đa chiều theo ngày; bổ sung dependency xác thực `user=Depends(get_current_user)` cho `/api/reports/analytics` và `/api/reports/export-excel` trong `routers/cashbook.py`.
- **Reports Frontend & Skeleton:** Triển khai hàm `renderReportsSkeleton()` và thanh tiến trình `startPageLoader()` trong `static/js/modules/reports_analytics.js`, đồng thời truyền tường minh header `Authorization: Bearer <token>`.
- **AI Agent UI Cleanup:** Loại bỏ nhãn badge `COPILOT` ở sidebar và `VISION COPILOT` ở tiêu đề tab AI Agent trong `templates/index.html`.

**Tech Stack:**
- FastAPI (Python 3.11), SQLite3, Pytest, Vanilla JavaScript (ES6+), Tailwind CSS, Chart.js.

---

## Global Constraints

- **Python & Pytest:** Python 3.11 trong venv; chạy test bằng `pytest <file_path>`.
- **JavaScript Linting:** Mọi sửa đổi file JS phải qua kiểm tra cú pháp bằng lệnh `node -c <file_path>`.
- **Tương thích ngược:** Giữ nguyên tên ID và class của các modal hiện tại; chỉ bổ sung thuộc tính và hàm đóng an toàn không làm hỏng logic lưu dữ liệu.
- **Bảo mật:** Không bypass kiểm tra Bearer token trên các endpoint tài chính / báo cáo doanh thu; token lấy qua `Auth.getToken()`.

---

## Scope Boundary & Anti-Drift Guards (Strict)

Bắt buộc tuân thủ khi agent thực thi plan:
1. **Chạm đúng biên:** Chỉ sửa đúng file, hàm, dòng được chỉ định trong từng Task. Không xóa, không refactor, không reformat code/comment lân cận.
2. **Bằng chứng test thực tế:** Chạy lệnh verification thật (`pytest`, `node -c`, v.v.). Paste nguyên văn terminal output làm bằng chứng. Cấm tự nhận PASS mà không có log.
3. **Tuần tự theo nấc:** Hoàn thành 1 task -> in kết quả test -> dừng lại chờ xác nhận trước khi sang task tiếp theo. Tuyệt đối không chạy dồn nhiều task cùng lúc.

---

## File Structure

| File | Responsibility |
|---|---|
| `templates/index.html` | Modify — Xóa badge 'COPILOT' sidebar/header; thêm backdrop click cho 17 modals |
| `static/js/app.js` | Modify — Mở rộng `activeModals` cho sự kiện ESC phím bấm |
| `static/js/modules/purchases.js` | Modify — Export các hàm đóng modal nhập hàng ra `window` |
| `static/js/modules/contacts.js` | Modify — Export các hàm đóng modal khách hàng/đối tác ra `window` |
| `static/js/modules/cashflow.js` | Modify — Export các hàm đóng modal nợ NCC & kế hoạch ra `window` |
| `static/js/modules/productions.js` | Modify — Export các hàm đóng modal OEM & sổ quỹ ra `window` |
| `database.py` | Modify — Thêm 5 composite indexes tối ưu truy vấn báo cáo |
| `routers/cashbook.py` | Modify — Bổ sung `Depends(get_current_user)` bảo vệ API reports |
| `static/js/modules/reports_analytics.js` | Modify — Thêm skeleton placeholders và truyền Bearer token |
| `tests/test_ai_agent_ui_cleanup.py` | Create — Test xác thực không còn chữ 'Copilot' trên UI sidebar và header |
| `tests/test_modals_esc_backdrop.py` | Create — Test xác thực backdrop click và ESC handler cho 17 modals |
| `tests/test_reports_analytics_optimization.py` | Create — Test xác thực Bearer token, composite indexes, và skeleton frontend |

---

### Task 1: Bỏ Chữ 'Copilot' Ở Tác Nhân AI (Sidebar & Header UI)

**Files:**
- Modify: `templates/index.html:931-937, 8251-8255`
- Create: `tests/test_ai_agent_ui_cleanup.py`

**Interfaces:**
- Consumes: Giao diện tab `ai-agent` trên sidebar và thẻ header `#tab-ai-agent`.
- Produces: Giao diện chuẩn tên "Tác Nhân AI", không còn badge hay text "COPILOT" hoặc "VISION COPILOT".

- [ ] **Step 1: Write the failing test**

Tạo file `tests/test_ai_agent_ui_cleanup.py`:
```python
import re
from pathlib import Path

def test_ai_agent_no_copilot_in_sidebar_and_header():
    """Kiểm tra tab Tác Nhân AI trên sidebar và header không còn chứa từ 'Copilot'"""
    html = Path("templates/index.html").read_text(encoding="utf-8")

    # 1. Kiểm tra nút tab trên Sidebar: button data-tab="ai-agent"
    sidebar_match = re.search(r'<button[^>]*data-tab="ai-agent"[^>]*>(.*?)</button>', html, re.DOTALL)
    assert sidebar_match is not None, "Không tìm thấy nút tab ai-agent trên sidebar"
    sidebar_btn_html = sidebar_match.group(1)
    assert "COPILOT" not in sidebar_btn_html, "Nút sidebar Tác Nhân AI vẫn còn badge hoặc chữ COPILOT"
    assert "Copilot" not in sidebar_btn_html, "Nút sidebar Tác Nhân AI vẫn còn chữ Copilot"

    # 2. Kiểm tra header của tab Tác Nhân AI: thẻ h2 và badge lân cận
    header_match = re.search(r'<div id="tab-ai-agent"[^>]*>(.*?)<div class="grid grid-cols-1 lg:grid-cols-12', html, re.DOTALL)
    assert header_match is not None, "Không tìm thấy phần header của #tab-ai-agent"
    header_html = header_match.group(1)
    assert "VISION COPILOT" not in header_html, "Header Tác Nhân AI vẫn còn badge VISION COPILOT"
    assert "COPILOT" not in header_html, "Header Tác Nhân AI vẫn còn chữ COPILOT"
```

- [ ] **Step 2: Run test to verify it fails**

Chạy lệnh terminal:
```bash
pytest tests/test_ai_agent_ui_cleanup.py
```
*Kết quả kỳ vọng:* Test FAIL vì dòng 936 có badge `COPILOT` và dòng 8253 có badge `VISION COPILOT`.

- [ ] **Step 3: Write minimal implementation**

Trong `templates/index.html`:
1. Tại dòng ~936 (bên trong `<button onclick="switchTab('ai-agent')" ...>`):
Xóa bỏ:
```html
<span class="ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-purple-100 text-purple-700 border border-purple-200">COPILOT</span>
```
Giữ nguyên tên:
```html
<span class="sidebar-text truncate">Tác Nhân AI</span>
```

2. Tại dòng ~8253 (bên trong `#tab-ai-agent` header):
Thay thế:
```html
<div class="flex items-center gap-2">
    <h2 class="text-base font-bold text-slate-900">Tác Nhân AI Bóc Tách Chứng Từ</h2>
    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">VISION COPILOT</span>
</div>
```
Thành:
```html
<div class="flex items-center gap-2">
    <h2 class="text-base font-bold text-slate-900">Tác Nhân AI Bóc Tách Chứng Từ</h2>
    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">THÔNG MINH</span>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Chạy lệnh terminal:
```bash
pytest tests/test_ai_agent_ui_cleanup.py
```
*Kết quả kỳ vọng:* 1 passed.

- [ ] **Step 5: Commit**

```bash
git add templates/index.html tests/test_ai_agent_ui_cleanup.py
git commit -m "feat(ui): bỏ chữ 'Copilot' ở sidebar và header tab Tác Nhân AI"
```

---

### Task 2: Universal Modal Escape & Backdrop Click (Nhập Hàng, OEM, Khách Hàng, Dòng Tiền & Nợ NCC)

**Files:**
- Modify: `templates/index.html` (Thêm thuộc tính `onclick="if(event.target === this) ..."` vào các modal)
- Modify: `static/js/app.js` (Mở rộng danh sách `activeModals` trong keydown handler)
- Modify: `static/js/modules/purchases.js` (Export hàm đóng modal ra window)
- Modify: `static/js/modules/contacts.js` (Export hàm đóng modal ra window)
- Modify: `static/js/modules/cashflow.js` (Export hàm đóng modal ra window)
- Modify: `static/js/modules/productions.js` (Export hàm đóng modal ra window)
- Create: `tests/test_modals_esc_backdrop.py`

**Danh sách 17 Modal Cần Hoàn Thiện:**
1. **Nhập Hàng (Purchases):**
   - `#modal-purchase-order` -> `closePurchaseModal()`
   - `#modal-receive-purchase` -> `closeReceiveModal()`
   - `#modal-pay-purchase` -> `closePayPurchaseModal()`
   - `#modal-quick-assign-supplier` -> `closeQuickAssignSupplierModal()`
   - `#modal-production-detail` -> `closeProdDetailModal()`
2. **Gia Công OEM:**
   - `#modal-create-oem` -> `closeModalCreateOEM()`
   - `#modal-receive-oem` -> `closeModalReceiveOEM()`
   - `#modal-detail-oem` -> `closeModalDetailOEM()`
   - `#modal-manage-oem-factories` -> `closeModalManageOEMFactories()`
3. **Khách Hàng & Đối Tác (Contacts):**
   - `#modal-contact` -> `closeContactModal()`
   - `#modal-contact-detail` -> `closeContactDetailModal()`
   - `#modal-contacts-import` -> `closeImportContactsModal()`
   - `#modal-pay-debt` -> `closePayDebtModal()`
4. **Dòng Tiền & Nợ NCC (Cashflow & Debts):**
   - `#modal-create-cashbook` -> `closeCreateCashModal()`
   - `#modal-cashbook-acc-picker` -> `closeCashbookAccPickerModal()`
   - `#modal-cfd-supplier-orders` -> `closeModalCFDSupplierOrders()`
   - `#modal-cfd-pay-order` -> `closeModalCFDPayOrder()`
   - `#modal-cfd-pay-supplier` -> `closeModalPaySupplierDebt()`
   - `#modal-cfd-supp-picker` -> `closeCFDPaySuppPickerModal()`
   - `#modal-cfd-debt-plan` -> `closeModalCreateDebtPlan()`
   - `#modal-plan-order-picker` -> `closePlanOrderPickerModal()`
   - `#modal-quick-edit-debt` -> `closeQuickEditDebtModal()`

- [ ] **Step 1: Write the failing test**

Tạo file `tests/test_modals_esc_backdrop.py`:
```python
import re
from pathlib import Path

TARGET_MODALS = [
    # Nhập hàng
    ("modal-purchase-order", "closePurchaseModal()"),
    ("modal-receive-purchase", "closeReceiveModal()"),
    ("modal-pay-purchase", "closePayPurchaseModal()"),
    ("modal-quick-assign-supplier", "closeQuickAssignSupplierModal()"),
    ("modal-production-detail", "closeProdDetailModal()"),
    # OEM
    ("modal-create-oem", "closeModalCreateOEM()"),
    ("modal-receive-oem", "closeModalReceiveOEM()"),
    ("modal-detail-oem", "closeModalDetailOEM()"),
    ("modal-manage-oem-factories", "closeModalManageOEMFactories()"),
    # Khách hàng
    ("modal-contact", "closeContactModal()"),
    ("modal-contact-detail", "closeContactDetailModal()"),
    ("modal-contacts-import", "closeImportContactsModal()"),
    ("modal-pay-debt", "closePayDebtModal()"),
    # Dòng tiền & Nợ NCC
    ("modal-create-cashbook", "closeCreateCashModal()"),
    ("modal-cashbook-acc-picker", "closeCashbookAccPickerModal()"),
    ("modal-cfd-supplier-orders", "closeModalCFDSupplierOrders()"),
    ("modal-cfd-pay-order", "closeModalCFDPayOrder()"),
    ("modal-cfd-pay-supplier", "closeModalPaySupplierDebt()"),
    ("modal-cfd-supp-picker", "closeCFDPaySuppPickerModal()"),
    ("modal-cfd-debt-plan", "closeModalCreateDebtPlan()"),
    ("modal-plan-order-picker", "closePlanOrderPickerModal()"),
    ("modal-quick-edit-debt", "closeQuickEditDebtModal()"),
]

def test_modals_have_backdrop_click():
    """Kiểm tra tất cả các modal mục tiêu đều có onclick='if(event.target === this) ...'"""
    html = Path("templates/index.html").read_text(encoding="utf-8")
    for mid, close_fn in TARGET_MODALS:
        pattern = rf'<div\s+id="{mid}"[^>]*>'
        m = re.search(pattern, html)
        assert m is not None, f"Không tìm thấy thẻ div với id='{mid}' trong index.html"
        tag = m.group(0)
        expected_onclick = f'onclick="if(event.target === this) {close_fn}"'
        assert expected_onclick in tag, f"Modal #{mid} thiếu backdrop click '{expected_onclick}'. Tag hiện tại: {tag}"

def test_app_js_active_modals_contains_all_targets():
    """Kiểm tra app.js ESC handler có đầy đủ tất cả các modal ID mục tiêu"""
    app_js = Path("static/js/app.js").read_text(encoding="utf-8")
    for mid, _ in TARGET_MODALS:
        assert f"'{mid}'" in app_js or f'"{mid}"' in app_js, f"app.js thiếu modal '{mid}' trong activeModals"
```

- [ ] **Step 2: Run test to verify it fails**

Chạy lệnh terminal:
```bash
pytest tests/test_modals_esc_backdrop.py
```
*Kết quả kỳ vọng:* Test FAIL vì đa số các thẻ modal chưa có backdrop `onclick` và thiếu ID trong `activeModals` của `app.js`.

- [ ] **Step 3: Write minimal implementation**

1. Cập nhật các thẻ `div` trong `templates/index.html`:
   - Thêm `onclick="if(event.target === this) closePurchaseModal()"` vào `<div id="modal-purchase-order" ...>`
   - Thêm `onclick="if(event.target === this) closeReceiveModal()"` vào `<div id="modal-receive-purchase" ...>`
   - Thêm `onclick="if(event.target === this) closePayPurchaseModal()"` vào `<div id="modal-pay-purchase" ...>`
   - Thêm `onclick="if(event.target === this) closeQuickAssignSupplierModal()"` vào `<div id="modal-quick-assign-supplier" ...>`
   - Thêm `onclick="if(event.target === this) closeProdDetailModal()"` vào `<div id="modal-production-detail" ...>`
   - Thêm `onclick="if(event.target === this) closeModalCreateOEM()"` vào `<div id="modal-create-oem" ...>`
   - Thêm `onclick="if(event.target === this) closeModalReceiveOEM()"` vào `<div id="modal-receive-oem" ...>`
   - Thêm `onclick="if(event.target === this) closeModalDetailOEM()"` vào `<div id="modal-detail-oem" ...>`
   - Thêm `onclick="if(event.target === this) closeModalManageOEMFactories()"` vào `<div id="modal-manage-oem-factories" ...>`
   - Thêm `onclick="if(event.target === this) closeContactModal()"` vào `<div id="modal-contact" ...>`
   - Thêm `onclick="if(event.target === this) closeContactDetailModal()"` vào `<div id="modal-contact-detail" ...>`
   - Thêm `onclick="if(event.target === this) closeImportContactsModal()"` vào `<div id="modal-contacts-import" ...>`
   - Thêm `onclick="if(event.target === this) closePayDebtModal()"` vào `<div id="modal-pay-debt" ...>`
   - Thêm `onclick="if(event.target === this) closeCreateCashModal()"` vào `<div id="modal-create-cashbook" ...>`
   - Thêm `onclick="if(event.target === this) closeCashbookAccPickerModal()"` vào `<div id="modal-cashbook-acc-picker" ...>`
   - Thêm `onclick="if(event.target === this) closeModalCFDSupplierOrders()"` vào `<div id="modal-cfd-supplier-orders" ...>`
   - Thêm `onclick="if(event.target === this) closeModalCFDPayOrder()"` vào `<div id="modal-cfd-pay-order" ...>`
   - Thêm `onclick="if(event.target === this) closeModalPaySupplierDebt()"` vào `<div id="modal-cfd-pay-supplier" ...>`
   - Thêm `onclick="if(event.target === this) closeCFDPaySuppPickerModal()"` vào `<div id="modal-cfd-supp-picker" ...>`
   - Thêm `onclick="if(event.target === this) closeModalCreateDebtPlan()"` vào `<div id="modal-cfd-debt-plan" ...>`
   - Thêm `onclick="if(event.target === this) closePlanOrderPickerModal()"` vào `<div id="modal-plan-order-picker" ...>`
   - Thêm `onclick="if(event.target === this) closeQuickEditDebtModal()"` vào `<div id="modal-quick-edit-debt" ...>`

2. Trong `static/js/app.js`: Cập nhật mảng `activeModals` trong sự kiện Escape (dòng ~5313):
```javascript
                const activeModals = [
                    // Hộp thoại xác nhận / Top dialogs
                    'modal-order-view',
                    'modal-pos-shortcuts-help',
                    'modal-app-version',
                    'modal-edit-topup-tx',
                    // Nhập hàng
                    'modal-pay-purchase',
                    'modal-receive-purchase',
                    'modal-quick-assign-supplier',
                    'modal-purchase-order',
                    'modal-production-detail',
                    // OEM
                    'modal-manage-oem-factories',
                    'modal-receive-oem',
                    'modal-detail-oem',
                    'modal-create-oem',
                    // Khách hàng & Công nợ
                    'modal-pay-debt',
                    'modal-contact-detail',
                    'modal-contacts-import',
                    'modal-contact',
                    // Dòng tiền & Nợ NCC
                    'modal-cashbook-acc-picker',
                    'modal-plan-order-picker',
                    'modal-cfd-supp-picker',
                    'modal-quick-edit-debt',
                    'modal-cfd-pay-order',
                    'modal-cfd-pay-supplier',
                    'modal-cfd-debt-plan',
                    'modal-cfd-supplier-orders',
                    'modal-create-cashbook',
                    'modal-cash-counter',
                    // Kho bãi & Khác
                    'modal-product',
                    'modal-write-off',
                    'modal-inventory-check',
                    'modal-audit-history',
                    'modal-audit-detail',
                    'modal-create-service-ticket',
                    'modal-quick-add-pet',
                    'modal-import-bom',
                    'modal-clone-bom',
                    'modal-pos-wallet-history'
                ];
```

3. Export các hàm đóng modal ra `window` trong các file JS:
- `static/js/modules/purchases.js`:
  ```javascript
  window.closePurchaseModal = closePurchaseModal;
  window.closeReceiveModal = closeReceiveModal;
  window.closePayPurchaseModal = closePayPurchaseModal;
  ```
- `static/js/modules/contacts.js`:
  ```javascript
  window.closeContactModal = closeContactModal;
  window.closeContactDetailModal = closeContactDetailModal;
  window.closeImportContactsModal = closeImportContactsModal;
  window.closePayDebtModal = closePayDebtModal;
  ```
- `static/js/modules/cashflow.js`:
  ```javascript
  window.closeModalCFDSupplierOrders = closeModalCFDSupplierOrders;
  window.closeModalCFDPayOrder = closeModalCFDPayOrder;
  window.closeModalPaySupplierDebt = closeModalPaySupplierDebt;
  window.closeCFDPaySuppPickerModal = closeCFDPaySuppPickerModal;
  window.closeModalCreateDebtPlan = closeModalCreateDebtPlan;
  window.closePlanOrderPickerModal = closePlanOrderPickerModal;
  window.closeQuickEditDebtModal = closeQuickEditDebtModal;
  ```
- `static/js/modules/productions.js`:
  ```javascript
  window.closeProdDetailModal = closeProdDetailModal;
  window.closeCashbookAccPickerModal = closeCashbookAccPickerModal;
  window.closeModalManageOEMFactories = closeModalManageOEMFactories;
  window.closeModalReceiveOEM = closeModalReceiveOEM;
  ```

- [ ] **Step 4: Run test to verify it passes**

Kiểm tra cú pháp JS và chạy test:
```bash
node -c static/js/app.js && node -c static/js/modules/purchases.js && node -c static/js/modules/contacts.js && node -c static/js/modules/cashflow.js && node -c static/js/modules/productions.js
pytest tests/test_modals_esc_backdrop.py
```
*Kết quả kỳ vọng:* Không có lỗi cú pháp JS; 2 passed trong `test_modals_esc_backdrop.py`.

- [ ] **Step 5: Commit**

```bash
git add templates/index.html static/js/app.js static/js/modules/purchases.js static/js/modules/contacts.js static/js/modules/cashflow.js static/js/modules/productions.js tests/test_modals_esc_backdrop.py
git commit -m "feat(ux): universal modal escape & backdrop click cho nhập hàng, oem, khách hàng, dòng tiền và nợ ncc"
```

---

### Task 3: Backend Database Composite Index & Bearer Token Authentication Cho Báo Cáo Tổng Hợp

**Files:**
- Modify: `database.py:699-705, 1389-1392, 1675-1680`
- Modify: `routers/cashbook.py:680-686, 918-924`
- Create: `tests/test_reports_analytics_optimization.py`

**Interfaces:**
- Consumes: Header `Authorization: Bearer <token>` từ client.
- Produces: Composite index trên SQLite (`orders`, `order_items`, `order_payments`, `hotel_bookings`, `pet_service_tickets`); API báo cáo yêu cầu xác thực người dùng.

- [ ] **Step 1: Write the failing test**

Tạo file `tests/test_reports_analytics_optimization.py`:
```python
import sqlite3
import pytest
from fastapi.testclient import TestClient
from database import DB_PATH, init_db
from server import app

init_db()

def test_reports_endpoints_require_bearer_token():
    """Kiểm tra các endpoint báo cáo bắt buộc có Bearer token hợp lệ (không cho phép khách vô danh)"""
    client = TestClient(app)
    
    # Không gửi header Authorization
    res_analytics = client.get("/api/reports/analytics")
    assert res_analytics.status_code == 401, f"Kỳ vọng 401 Unauthorized nhưng nhận {res_analytics.status_code}"

    res_excel = client.get("/api/reports/export-excel")
    assert res_excel.status_code == 401, f"Kỳ vọng 401 Unauthorized nhưng nhận {res_excel.status_code}"

def test_database_composite_indexes_exist():
    """Kiểm tra sự tồn tại của 5 composite index tối ưu hóa cho Reports Analytics"""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='index'")
    indexes = [r[0] for r in cur.fetchall()]
    conn.close()

    expected_indexes = [
        "idx_orders_created_at_staff",
        "idx_order_items_order_prod",
        "idx_order_payments_order_method",
        "idx_hotel_bookings_created_at",
        "idx_pet_service_tickets_created_status",
    ]
    for idx in expected_indexes:
        assert idx in indexes, f"Thiếu composite index {idx} trong CSDL SQLite"
```

- [ ] **Step 2: Run test to verify it fails**

Chạy lệnh terminal:
```bash
pytest tests/test_reports_analytics_optimization.py
```
*Kết quả kỳ vọng:* Test FAIL vì `/api/reports/analytics` trả về 200 (chưa chặn auth) và thiếu các composite index.

- [ ] **Step 3: Write minimal implementation**

1. Trong `database.py`: Bổ sung tạo index trong hàm `init_db()`:
```python
    # ── Composite indexes tối ưu hóa Báo Cáo Tổng Hợp (Reports Analytics) ──
    cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_created_at_staff ON orders(created_at, staff_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_order_items_order_prod ON order_items(order_id, product_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_order_payments_order_method ON order_payments(order_id, method)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_hotel_bookings_created_at ON hotel_bookings(created_at)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pet_service_tickets_created_status ON pet_service_tickets(created_at, payment_status, status)")
```

2. Trong `routers/cashbook.py`:
Cập nhật decorator và tham số của `get_reports_analytics` và `export_reports_excel`:
```python
@router.get("/api/reports/analytics")
def get_reports_analytics(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    user=Depends(get_current_user)
):
```
và:
```python
@router.get("/api/reports/export-excel")
def export_reports_excel(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    user=Depends(get_current_user)
):
```
Đồng thời, cập nhật file `tests/test_reports_analytics.py` hiện tại: truyền token hoặc dùng `dependency_overrides[get_current_user]` để tất cả các unit test cũ tiếp tục PASS trơn tru.

- [ ] **Step 4: Run test to verify it passes**

Chạy lệnh terminal:
```bash
pytest tests/test_reports_analytics_optimization.py tests/test_reports_analytics.py
```
*Kết quả kỳ vọng:* Tất cả các test trong cả 2 file đều PASS.

- [ ] **Step 5: Commit**

```bash
git add database.py routers/cashbook.py tests/test_reports_analytics.py tests/test_reports_analytics_optimization.py
git commit -m "perf(reports): thêm composite index csdl và yêu cầu bearer token cho reports analytics"
```

---

### Task 4: Frontend Skeleton Loading State & Bearer Token Cho Báo Cáo Tổng Hợp

**Files:**
- Modify: `static/js/modules/reports_analytics.js:90-125`
- Create: `tests/test_reports_frontend_skeleton.py`

**Interfaces:**
- Consumes: DOM elements `#rep-kpi-*`, `#tbody-rep-payments`, `#rep-table-staff`, `#rep-table-products`, `Auth.getToken()`.
- Produces: Trạng thái hiển thị mượt 0ms, skeleton placeholder trong lúc nạp API, gắn token xác thực an toàn.

- [ ] **Step 1: Write the failing test**

Tạo file `tests/test_reports_frontend_skeleton.py`:
```python
from pathlib import Path

def test_reports_analytics_js_has_skeleton_and_auth_headers():
    """Kiểm tra reports_analytics.js có logic skeleton và gắn Authorization header"""
    js = Path("static/js/modules/reports_analytics.js").read_text(encoding="utf-8")

    # 1. Có hàm renderReportsSkeleton hoặc hiển thị skeleton cho KPI & Tables
    assert "renderReportsSkeleton" in js or "renderTableSkeleton" in js, "Thiếu logic renderTableSkeleton trong reports_analytics.js"
    
    # 2. Có gọi startPageLoader / stopPageLoader
    assert "startPageLoader" in js, "Thiếu startPageLoader() trong loadReportsAnalytics"
    assert "stopPageLoader" in js, "Thiếu stopPageLoader() trong loadReportsAnalytics"

    # 3. Có gắn header Authorization Bearer token hoặc Auth.getToken()
    assert "Authorization" in js or "Auth.getToken" in js, "Thiếu gắn Authorization Bearer token trong reports_analytics.js"
```

- [ ] **Step 2: Run test to verify it fails**

Chạy lệnh terminal:
```bash
pytest tests/test_reports_frontend_skeleton.py
```
*Kết quả kỳ vọng:* Test FAIL vì `reports_analytics.js` chưa có `startPageLoader`, `stopPageLoader`, `renderTableSkeleton`.

- [ ] **Step 3: Write minimal implementation**

Trong `static/js/modules/reports_analytics.js`:
1. Thêm hàm `renderReportsSkeleton()`:
```javascript
function renderReportsSkeleton() {
    // KPI skeletons
    const kpiIds = ['rep-kpi-revenue', 'rep-kpi-paid', 'rep-kpi-debt', 'rep-kpi-aov'];
    kpiIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<span class="inline-block h-6 w-28 bg-slate-200 animate-pulse rounded"></span>';
    });

    // Table skeletons
    if (typeof renderTableSkeleton === 'function') {
        renderTableSkeleton('table-rep-payments', 3, 5);
        renderTableSkeleton('rep-table-staff', 3, 6);
        renderTableSkeleton('rep-table-products', 5, 7);
    }
}
```

2. Cập nhật `loadReportsAnalytics()`:
```javascript
async function loadReportsAnalytics() {
    const fromVal = document.getElementById('rep-filter-from')?.value || '';
    const toVal = document.getElementById('rep-filter-to')?.value || '';

    const btnRefresh = document.getElementById('btn-rep-refresh');
    if (btnRefresh) btnRefresh.classList.add('animate-spin');
    if (typeof startPageLoader === 'function') startPageLoader();

    // Hiển thị skeleton ngay lập tức
    renderReportsSkeleton();

    try {
        const url = `/api/reports/analytics?from_date=${encodeURIComponent(fromVal)}&to_date=${encodeURIComponent(toVal)}`;
        const headers = { 'Accept': 'application/json' };
        if (typeof Auth !== 'undefined' && Auth.getToken()) {
            headers['Authorization'] = `Bearer ${Auth.getToken()}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) {
            if (res.status === 401 && typeof showLoginOverlay === 'function') {
                showLoginOverlay();
            }
            throw new Error(`Lỗi khi tải báo cáo (${res.status})`);
        }
        const data = await res.json();
        currentReportsData = data;

        // Render các khối dữ liệu
        renderReportsSummaryKPI(data.summary);
        renderVisualCharts(data);
        renderPaymentsTable(data.payments);
        renderGoodsVsServices(data.goods_vs_services);
        renderStaffPerformance(data.staff_performance);
        renderTopProducts(data.top_products);

    } catch (e) {
        console.error("loadReportsAnalytics error:", e);
        if (window.showToast) window.showToast(e.message || "Không thể tải dữ liệu báo cáo", "error");
    } finally {
        if (btnRefresh) btnRefresh.classList.remove('animate-spin');
        if (typeof stopPageLoader === 'function') stopPageLoader();
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Chạy lệnh terminal:
```bash
node -c static/js/modules/reports_analytics.js
pytest tests/test_reports_frontend_skeleton.py
```
*Kết quả kỳ vọng:* `node -c` trả về mã 0; pytest 1 passed.

- [ ] **Step 5: Commit**

```bash
git add static/js/modules/reports_analytics.js tests/test_reports_frontend_skeleton.py
git commit -m "feat(reports): thêm skeleton loading placeholder và gắn bearer auth header trong reports_analytics"
```

---

### Task 5: End-to-End Regression Verification & Syntax Linting

**Files:**
- Test verification across all affected components

- [ ] **Step 1: Kiểm tra toàn bộ cú pháp JS của dự án**
Chạy lệnh terminal:
```bash
node -c static/js/app.js
node -c static/js/modules/reports_analytics.js
node -c static/js/modules/purchases.js
node -c static/js/modules/contacts.js
node -c static/js/modules/cashflow.js
node -c static/js/modules/productions.js
```
*Kết quả kỳ vọng:* Tất cả trả về exit code 0 không có lỗi SyntaxError.

- [ ] **Step 2: Chạy toàn bộ test suites liên quan**
Chạy lệnh terminal:
```bash
pytest tests/test_ai_agent_ui_cleanup.py tests/test_modals_esc_backdrop.py tests/test_reports_analytics_optimization.py tests/test_reports_frontend_skeleton.py tests/test_reports_analytics.py
```
*Kết quả kỳ vọng:* Toàn bộ các test cases đều PASS (GREEN).

- [ ] **Step 3: Commit & Hoàn tất**
```bash
git commit --allow-empty -m "chore(release): hoàn tất verification cho universal modal esc/backdrop, reports analytics optimization và ai agent ui cleanup"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - Universal Modal Escape & Backdrop Click (Nhập hàng, OEM, Khách hàng, Dòng tiền & Nợ NCC): Đã cover đầy đủ trong Task 2 với bảng 17 modals và unit tests.
   - Tối ưu Báo Cáo Tổng Hợp (Bearer token, composite index, skeleton): Đã cover trong Task 3 (backend & DB) và Task 4 (frontend skeleton).
   - Bỏ chữ 'Copilot' ở Tác Nhân AI: Đã cover trong Task 1 (sidebar và header).
   - Viết test verification tương ứng: Đã có 3 test files chuyên biệt + bổ sung test cũ.
2. **Placeholder scan:** Không có "TODO", "TBD", "implement later". Tất cả code snippets và assertions đều viết đầy đủ.
3. **Type consistency:** Các tên ID `#modal-*`, hàm `close*()`, và tên index CSDL `idx_*` nhất quán trên toàn bộ các file.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-17-modal-escape-backdrop-and-reports-optimization.md`.

**1. Subagent-Driven (recommended)** - Fresh subagent per task, review giữa các task
**2. Inline Execution** - Execute trong session này, batch có checkpoint

**Chọn hướng nào?**

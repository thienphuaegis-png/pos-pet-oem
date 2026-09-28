# In Đậm Toàn Bộ & Phân Nhóm Mẫu In Nghiệp Vụ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Thêm tùy chọn "In đậm toàn bộ" (chống mờ đầu in nhiệt K80/K58) trong Cài Đặt Mẫu In và phân nhóm preset theo nghiệp vụ để chống chọn nhầm trên màn hình Bán Hàng.

**Architecture:** Bổ sung `category` (`pos`, `spa`, `cashbook`, `inventory`) và `is_bold_all` (`boolean`) vào từng preset trong `print_blocks_config`. Cập nhật `productions.js` để render `<optgroup>` và checkbox in đậm, cập nhật `pos.js` để lọc dropdown chỉ lấy nhóm POS đồng thời inject CSS `-webkit-text-stroke` khi bật in đậm, đồng thời hỗ trợ in đậm cho phiếu Spa (`spa.js`) và Sổ Quỹ (`productions.js`).

**Tech Stack:** JavaScript (ES6+, Vanilla DOM), Python (FastAPI/Pytest), HTML5/CSS3 (@media print), SQLite.

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/sync_print_presets.py` | Cập nhật 12 preset mẫu in bổ sung `category` và `is_bold_all` |
| `templates/index.html` | Thêm checkbox `#chk-preset-bold-all` trên thanh công cụ Visual Designer |
| `static/js/modules/productions.js` | Cập nhật `getDefaultPresets`, `renderPresetSelect` (vẽ `<optgroup>`), toggle và lưu `is_bold_all` |
| `static/js/pos.js` | Cập nhật `initPrintTemplatesFromSettings` (lọc `category === 'pos'`), `renderAndPrint` (inject CSS in đậm) |
| `static/js/modules/spa.js` | Cập nhật `printPetServiceTicketDirectly` & `printBatchPetServiceTickets` (áp dụng in đậm chống mờ nhiệt) |
| `tests/test_print_bold_and_categories.py` | Test suite kiểm tra schema preset, optgroup, lọc pos, và CSS in đậm |

---

## Tasks

### Task 1: Cập nhật Schema & Đồng Bộ Preset Mẫu In (`tools/sync_print_presets.py`)

**Files:**
- Modify: `tools/sync_print_presets.py`
- Test: `tests/test_print_bold_and_categories.py`

- [ ] **Step 1: Viết test kiểm tra 12 preset có đầy đủ `category` và `is_bold_all`**
- [ ] **Step 2: Chạy test để xác nhận FAIL trước khi sửa**
- [ ] **Step 3: Cập nhật `tools/sync_print_presets.py` gán category (`pos`, `spa`, `cashbook`, `inventory`) và `is_bold_all` (mặc định True cho các mẫu K80 nhiệt)**
- [ ] **Step 4: Chạy sync vào database và chạy test xác nhận PASS**
- [ ] **Step 5: Git commit task 1**

---

### Task 2: Thanh Công Cụ Visual Designer & Quản Lý In Đậm (`index.html`, `productions.js`)

**Files:**
- Modify: `templates/index.html:4810-4825`
- Modify: `static/js/modules/productions.js:3413-3650`
- Test: `tests/test_print_bold_and_categories.py`

- [ ] **Step 1: Viết test kiểm tra DOM `#chk-preset-bold-all` và hàm `toggleCurrentPresetBoldAll`**
- [ ] **Step 2: Thêm checkbox `[ ] 🖨️ In đậm toàn bộ (Chống mờ nhiệt)` vào `templates/index.html`**
- [ ] **Step 3: Cập nhật `renderPresetSelect` trong `productions.js` để render danh sách gom nhóm theo `<optgroup>`**
- [ ] **Step 4: Cập nhật `switchPreset`, `saveCurrentPreset`, `saveNewPreset` đồng bộ giá trị `is_bold_all`**
- [ ] **Step 5: Chạy test xác nhận PASS và commit task 2**

---

### Task 3: Lọc Mẫu In Tại Màn Hình Bán Hàng & Inject CSS Chống Mờ (`pos.js`)

**Files:**
- Modify: `static/js/pos.js:1640-1680, 2297-2370`
- Test: `tests/test_print_bold_and_categories.py`

- [ ] **Step 1: Viết test kiểm tra `#pos-template-select` chỉ chứa mẫu `category === 'pos'`**
- [ ] **Step 2: Cập nhật `initPrintTemplatesFromSettings` trong `pos.js` để lọc chỉ hiển thị nhóm `pos`**
- [ ] **Step 3: Cập nhật `printInvoiceDirectly` inject CSS `-webkit-text-stroke: 0.35px #000; font-weight: 900 !important;` khi `curPreset.is_bold_all === true`**
- [ ] **Step 4: Chạy test xác nhận PASS và commit task 3**

---

### Task 4: Chống Mờ Cho Phiếu In Dịch Vụ Spa & Sổ Quỹ Thu Chi (`spa.js`, `productions.js`)

**Files:**
- Modify: `static/js/modules/spa.js:5696-5750, 5840-5900`
- Modify: `static/js/modules/productions.js:1165-1240`
- Test: `tests/test_print_bold_and_categories.py`

- [ ] **Step 1: Viết test kiểm tra phiếu in Spa và Thu/Chi có CSS chống mờ nhiệt khi in**
- [ ] **Step 2: Cập nhật `printPetServiceTicketDirectly` và `printBatchPetServiceTickets` trong `spa.js` đọc cấu hình `is_bold_all` từ preset `spa_intake_k80`/`spa_invoice_k80`**
- [ ] **Step 3: Cập nhật `printCurrentCashbookVoucher` trong `productions.js` đọc cấu hình `is_bold_all` từ preset `cashbook_thu_k80`/`cashbook_chi_k80`**
- [ ] **Step 4: Chạy toàn bộ test suite (Python + Node.js) xác nhận 100% PASS**
- [ ] **Step 5: Git commit task 4**

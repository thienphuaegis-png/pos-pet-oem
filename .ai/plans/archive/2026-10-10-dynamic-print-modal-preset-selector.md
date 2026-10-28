# Dynamic Print Modal Preset Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Thêm dropdown chọn linh hoạt toàn bộ mẫu in POS ngay trên modal Xem Trước & In Hóa Đơn (`#print-modal`), đồng bộ hai chiều với 2 nút bấm nhanh K80 / A4.

**Architecture:** Mở rộng header `#print-modal` với `<select id="modal-print-preset-select">`. Trong JS (`static/js/pos.js` & `static/js/modules/productions.js`), xây dựng các hàm `populateModalPrintPresets` và `changeModalPrintPreset` để nạp động các mẫu POS từ `posPrintConfig.presets`, đồng bộ trạng thái hai chiều và render lại bản in tức thời 0ms.

**Tech Stack:** JavaScript (ES6+), HTML5, Tailwind CSS, SQLite3, Pytest.

## Global Constraints
- Không làm hỏng hoặc xóa 2 nút nhanh K80 / A4 (`btn-print-modal-k80`, `btn-print-modal-a4`).
- Giữ vững logic an toàn khi in bằng Iframe cô lập và cơ chế co dãn footer anti-overlap.
- Tên và thuộc tính element phải nhất quán giữa `templates/index.html` và `templates/pos.html`.

---

### File Structure Map

| File | Responsibility |
|---|---|
| `tests/test_dynamic_print_modal_preset_selector.py` | Create — Unit test kiểm tra DOM và hàm JS |
| `templates/index.html` | Modify — Thêm `#modal-print-preset-select` vào `#print-modal` |
| `templates/pos.html` | Modify — Thêm `#modal-print-preset-select` vào `#print-modal` |
| `static/js/pos.js` | Modify — Thêm `populateModalPrintPresets`, `changeModalPrintPreset` & tích hợp đồng bộ |
| `static/js/modules/productions.js` | Modify — Cập nhật đồng bộ `#modal-print-preset-select` khi mở modal in từ danh sách đơn |

---

### Task 1: Tạo Unit Test kiểm thử cấu trúc và hành vi

**Files:**
- Create: `tests/test_dynamic_print_modal_preset_selector.py`

- [ ] **Step 1: Write the failing test**
Viết kiểm tra:
1. `templates/index.html` và `templates/pos.html` có chứa `<select id="modal-print-preset-select"`
2. `static/js/pos.js` có chứa định nghĩa `populateModalPrintPresets` và `changeModalPrintPreset`
3. `static/js/pos.js` gọi `populateModalPrintPresets` trong `showPrintModal` và `printDraftOrder`

- [ ] **Step 2: Run test to verify it fails**
Chạy `pytest tests/test_dynamic_print_modal_preset_selector.py` và xác nhận FAILED.

---

### Task 2: Cập nhật DOM HTML (`templates/index.html` và `templates/pos.html`)

**Files:**
- Modify: `templates/index.html:10103-10111`
- Modify: `templates/pos.html:531-539`

- [ ] **Step 1: Apply HTML patch to `templates/index.html`**
Chèn `<select id="modal-print-preset-select" ...>` ngay sau container `.print-mode-selector`.

- [ ] **Step 2: Apply HTML patch to `templates/pos.html`**
Chèn `<select id="modal-print-preset-select" ...>` ngay sau container `.print-mode-selector`.

---

### Task 3: Cập nhật JavaScript (`static/js/pos.js` và `static/js/modules/productions.js`)

**Files:**
- Modify: `static/js/pos.js`
- Modify: `static/js/modules/productions.js`

- [ ] **Step 1: Viết hàm `populateModalPrintPresets` trong `static/js/pos.js`**
Hàm đọc `posPrintConfig.presets`, nạp `<option>` các mẫu thuộc nhóm `pos` vào `#modal-print-preset-select`, set selected preset.

- [ ] **Step 2: Viết hàm `changeModalPrintPreset` trong `static/js/pos.js`**
Hàm xử lý khi người dùng đổi option trên select: gán active preset, cập nhật trạng thái nút K80/A4 (hoặc neutral nếu khổ khác), sync sang `#pos-template-select`, và gọi `renderAndPrint`.

- [ ] **Step 3: Cập nhật `switchModalPrintSize` và `updateModalPrintSizeButtons` trong `static/js/pos.js`**
Khi người dùng bấm nút K80 / A4, cập nhật value của `#modal-print-preset-select` trỏ đúng preset được chọn.

- [ ] **Step 4: Cập nhật `showPrintModal` và `printDraftOrder` trong `static/js/pos.js`**
Gọi `populateModalPrintPresets(activePreset)` khi modal mở ra.

- [ ] **Step 5: Đồng bộ hàm trong `static/js/modules/productions.js`**
Cập nhật logic `switchModalPrintSize` và `showPrintModal` tương ứng trong productions.js.

---

### Task 4: Chạy kiểm thử xác nhận hoàn tất

**Files:**
- Test: `tests/test_dynamic_print_modal_preset_selector.py`
- Test: Toàn bộ test suite in ấn (`pytest tests/test_print*.py tests/test_kiotviet*.py`)

- [ ] **Step 1: Chạy test mới**
`pytest tests/test_dynamic_print_modal_preset_selector.py` $\rightarrow$ PASS.

- [ ] **Step 2: Chạy regression tests**
`pytest` $\rightarrow$ PASS tất cả.

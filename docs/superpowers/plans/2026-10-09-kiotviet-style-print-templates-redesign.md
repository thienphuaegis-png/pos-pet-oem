# Kế Hoạch Triển Khai: Nâng Cấp Giao Diện Quản Lý Mẫu In Chuẩn KiotViet

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Chuyển đổi màn hình Cài Đặt Mẫu In sang bố cục 3 cột chuyên nghiệp chuẩn KiotViet với cây danh mục chứng từ, panel bật/tắt khối trực quan gọn gàng, và khung xem trước cực đại to rõ (hỗ trợ K80, K58, A4 và zoom).

**Architecture:** Điều chỉnh HTML cấu trúc `#settings-sub-templates` trong `templates/index.html`. Cập nhật logic điều hướng cây chứng từ, chuyển đổi tab mẫu in, toggle khối dữ liệu và zoom bản in trong `static/js/modules/productions.js`. Viết kiểm thử tự động DOM và API.

**Tech Stack:** Tailwind CSS, Vanilla JavaScript, FastAPI, SQLite, Pytest.

## File Structure

| File | Responsibility |
|---|---|
| `templates/index.html:7492-7560` | Bố cục 3 cột: Cây chứng từ, panel cấu hình khối, viewport preview cực đại |
| `static/js/modules/productions.js` | Logic chuyển chứng từ, toggle khối, zoom sheet, quản lý đa mẫu in |
| `tests/test_kiotviet_print_templates_ui.py` | Kiểm thử DOM và chức năng tương tác giao diện quản lý mẫu in |

---

### Task 1: Cập nhật Cấu Trúc HTML 3 Cột Chuẩn KiotViet trong `templates/index.html`

**Files:**
- Modify: `templates/index.html`
- Test: `tests/test_kiotviet_print_templates_ui.py`

- [ ] **Step 1: Write failing test**
Viết test `tests/test_kiotviet_print_templates_ui.py` kiểm tra:
- Có cây danh mục chứng từ `#print-tpl-tree`
- Có panel cấu hình khối `#print-tpl-config-panel`
- Có viewport xem trước cực đại `#print-tpl-preview-viewport`
- Có các điều khiển zoom `#btn-print-zoom-in`, `#btn-print-zoom-out`, `#lbl-print-zoom`

- [ ] **Step 2: Run test to verify it fails**
`pytest tests/test_kiotviet_print_templates_ui.py`

- [ ] **Step 3: Update HTML in `templates/index.html`**
Thay thế `#settings-sub-templates` bằng bố cục 3 cột tương tác:
1. Cột cây chứng từ `#print-tpl-tree`: Đơn hàng, Dịch vụ Spa, Sổ quỹ, Kho hàng.
2. Cột panel cấu hình `#print-tpl-config-panel`: In đậm nhiệt, khối cửa hàng, khách hàng, bảng hàng, VietQR.
3. Cột preview `#print-tpl-preview-viewport`: Tabs mẫu in, điều khiển khổ giấy & zoom, khung giấy lớn to rõ.

- [ ] **Step 4: Run test to verify it passes**
`pytest tests/test_kiotviet_print_templates_ui.py`

---

### Task 2: Cập nhật JavaScript Tương Tác và Preview trong `static/js/modules/productions.js`

**Files:**
- Modify: `static/js/modules/productions.js`
- Test: `tests/test_kiotviet_print_templates_ui.py`

- [ ] **Step 1: Thêm test kiểm tra các hàm JS trong `tests/test_kiotviet_print_templates_ui.py`**
Kiểm tra sự tồn tại của:
- `selectPrintDocType`
- `zoomPrintSheet`
- `togglePrintPreviewField`
- `togglePrintPreviewBlock`
- `changePrintPaperView`

- [ ] **Step 2: Viết logic tương tác trong `static/js/modules/productions.js`**
- Hỗ trợ hàm `selectPrintDocType(docType, el)` cập nhật mẫu in theo chứng từ được chọn.
- Hỗ trợ hàm `zoomPrintSheet(delta)` tăng giảm tỉ lệ zoom 70% - 150%.
- Hỗ trợ hàm `changePrintPaperView(size)` đổi khổ giấy giữa K80 (400px), K58 (300px), A4 (720px).
- Hỗ trợ toggle checkbox phản hồi tức thì lên bản xem trước.

- [ ] **Step 3: Run test to verify it passes**
`pytest tests/test_kiotviet_print_templates_ui.py`

- [ ] **Step 4: Run full regression test suite**
`pytest tests/test_kiotviet_print_templates_ui.py tests/test_topup_points_and_cashbook_sync.py tests/test_spa_wallet_topup.py`

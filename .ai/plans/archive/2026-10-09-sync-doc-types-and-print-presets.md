# Kế Hoạch Triển Khai: Đồng Bộ Danh Mục Chứng Từ & Lọc Mẫu In Theo Ngữ Cảnh

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Khắc phục tình trạng danh mục chứng từ bên trái và danh sách mẫu in không khớp nhau, tự động lọc dropdown mẫu in theo đúng chứng từ đang chọn và hỗ trợ đồng bộ 2 chiều chuẩn KiotViet.

**Architecture:** Bổ sung `doc_type` cho `getDefaultPresets()` và helper suy luận `inferDocTypeFromKey`. Sửa hàm `renderPresetSelect(filterDocType)` để chỉ lọc hiển thị mẫu thuộc chứng từ đang chọn. Cập nhật `selectPrintDocType`, `switchPreset` và `saveNewPreset` trong `static/js/modules/productions.js`.

**Tech Stack:** Vanilla JavaScript, Pytest.

## File Structure

| File | Responsibility |
|---|---|
| `static/js/modules/productions.js` | Chuẩn hóa `doc_type`, hàm lọc `renderPresetSelect`, đồng bộ 2 chiều |
| `tests/test_sync_doc_types_and_presets.py` | Kiểm thử logic phân loại và lọc mẫu in theo chứng từ |

---

### Task 1: Chuẩn hóa `doc_type` & Hàm Lọc Dropdown Theo Chứng Từ

**Files:**
- Modify: `static/js/modules/productions.js`
- Test: `tests/test_sync_doc_types_and_presets.py`

- [ ] **Step 1: Write failing test**
Viết test `tests/test_sync_doc_types_and_presets.py` kiểm tra:
- Có hàm `inferDocTypeFromKey`
- Hàm `renderPresetSelect` hỗ trợ tham số lọc theo `docType`
- Hàm `selectPrintDocType` lọc đúng danh sách mẫu và chọn mẫu đầu tiên
- Hàm `saveNewPreset` lưu kèm `doc_type`

- [ ] **Step 2: Run test to verify it fails**
`pytest tests/test_sync_doc_types_and_presets.py`

- [ ] **Step 3: Implement doc_type mapping and contextual preset rendering in `productions.js`**
- Gán trường `doc_type` cho từng preset trong `getDefaultPresets()`.
- Thêm hàm `inferDocTypeFromKey(key, preset)` suy luận chính xác `doc_type`.
- Sửa `renderPresetSelect(filterDocType)`: lọc các mẫu có `doc_type === currentDocType`. Nếu không có mẫu nào thì hiển thị tùy chọn tạo mới.
- Cập nhật `selectPrintDocType(docType)`: đổi active chứng từ, gọi `renderPresetSelect(docType)` và nạp mẫu đầu tiên.
- Cập nhật `saveNewPreset()`: gán `doc_type` của preset mới bằng `multiTemplates.active_doc_type`.

- [ ] **Step 4: Run test to verify it passes**
`pytest tests/test_sync_doc_types_and_presets.py`

- [ ] **Step 5: Run full regression test suite**
`pytest tests/test_sync_doc_types_and_presets.py tests/test_print_autoflow_and_reorder.py tests/test_kiotviet_print_templates_ui.py`

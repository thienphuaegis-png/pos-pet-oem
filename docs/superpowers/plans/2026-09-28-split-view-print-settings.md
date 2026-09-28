# Giao Diện Cài Đặt Mẫu In 2 Cột Split View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Tái cấu trúc khu vực Cài Đặt Mẫu In `#settings-sub-templates` thành bố cục 2 Cột (Split View): Cột trái (38%) chọn mẫu, gạt công tắc in đậm chống mờ và bật/tắt thành phần; Cột phải (62%) hiển thị tờ giấy Canvas trực quan kèm hiệu ứng in đậm tức thì.

**Architecture:** HTML5 Tailwind CSS Grid Layout, Vanilla JS DOM synchronization, REST API `/api/settings/print-bold-configs`.

---

## File Structure

| File | Responsibility |
|---|---|
| `templates/index.html` | Cấu trúc layout 2 cột Split View cho `#settings-sub-templates` |
| `static/js/modules/productions.js` | Hàm sync công tắc in đậm khi đổi preset, toggle in đậm tức thì trên canvas, auto-save |
| `tests/test_split_view_print_settings.py` | Unit test kiểm tra DOM 2 cột, ID elements, và logic đồng bộ JS |

---

## Tasks

### Task 1: Viết Test Suite Cho Giao Diện 2 Cột (`tests/test_split_view_print_settings.py`)
- [ ] Viết unit test kiểm tra tồn tại layout 2 cột, ID `#split-col-left`, `#split-col-right`, switch `#chk-split-bold-all` và liên kết JS.
- [ ] Chạy test xác nhận FAIL.

### Task 2: Cập Nhật Layout HTML 2 Cột (`templates/index.html`)
- [ ] Thay thế layout xếp chồng dọc cũ bằng Grid 2 Cột (`grid-cols-1 lg:grid-cols-12`).
- [ ] Đặt bộ chọn mẫu, công tắc in đậm, đổi khổ giấy, checklist thành phần và nút In Thử vào Cột Trái (`lg:col-span-5` hoặc `lg:col-span-4`).
- [ ] Đặt thanh zoom và khung vẽ Canvas vào Cột Phải (`lg:col-span-7` hoặc `lg:col-span-8`).
- [ ] Chạy test xác nhận HTML layout PASS.

### Task 3: Cập Nhật Logic JS Đồng Bộ Hai Cột (`static/js/modules/productions.js`)
- [ ] Khi chuyển preset (`switchPreset`), cập nhật trạng thái của công tắc `#chk-split-bold-all`.
- [ ] Khi gạt công tắc `#chk-split-bold-all`, gắn/gỡ class in đậm trên Canvas và auto-save vào `print_bold_configs`.
- [ ] Chạy toàn bộ test suite xác nhận 100% PASS.

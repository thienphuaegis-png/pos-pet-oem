# Kế Hoạch Triển Khai: Chuyển Đổi Mẫu In Sang Auto-Flow Tự Dồn Dòng & Di Chuyển Thứ Tự Khối

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Chuyển đổi toàn bộ cơ chế hiển thị mẫu in từ tọa độ tĩnh sang Auto-Flow tự động dồn dòng, hỗ trợ đổi thứ tự khối (▲ Lên / ▼ Xuống & Kéo thả), xóa bỏ hoàn toàn hiện tượng chồng đè chữ.

**Architecture:** Cập nhật hàm `renderCanvas()` trong `static/js/modules/productions.js` sang mô hình Flexbox Vertical Flow. Thêm hàm `moveElementOrder(elemId, direction)` và sự kiện drag/drop đổi thứ tự. Cập nhật CSS hiển thị và viết test xác thực.

**Tech Stack:** Vanilla JavaScript, CSS Flexbox, Pytest.

## File Structure

| File | Responsibility |
|---|---|
| `static/js/modules/productions.js` | Hàm `renderCanvas`, `moveElementOrder`, drag & drop đổi thứ tự |
| `templates/index.html` | CSS và cấu trúc khung canvas Auto-Flow |
| `tests/test_print_autoflow_and_reorder.py` | Kiểm thử cơ chế dồn dòng và đổi thứ tự khối |

---

### Task 1: Cập nhật Hàm `renderCanvas` sang Auto-Flow Vertical Stack

**Files:**
- Modify: `static/js/modules/productions.js`
- Test: `tests/test_print_autoflow_and_reorder.py`

- [ ] **Step 1: Write failing test**
Viết test `tests/test_print_autoflow_and_reorder.py` kiểm tra:
- Không còn `position: absolute; top:` đè chữ trong render phần tử
- Có hàm `moveElementOrder`
- Các phần tử được sắp xếp theo thứ tự hiển thị `order`

- [ ] **Step 2: Run test to verify it fails**
`pytest tests/test_print_autoflow_and_reorder.py`

- [ ] **Step 3: Update `renderCanvas()` and `moveElementOrder()` in `productions.js`**
- Trong `renderCanvas()`: render các khối theo thứ tự mảng, sử dụng `position: relative; margin-bottom: 8px; width: 100%`.
- Thêm tay nắm kéo thả `⠿` trên mỗi khối.
- Hoàn thiện hàm `moveElementOrder(id, direction)` đổi vị trí trong mảng và gọi `renderCanvas()`.

- [ ] **Step 4: Run test to verify it passes**
`pytest tests/test_print_autoflow_and_reorder.py`

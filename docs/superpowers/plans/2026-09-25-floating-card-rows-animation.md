# Floating Card Rows Animation Implementation Plan

**Goal:** Chuyển đổi hiển thị dòng bảng thành từng thẻ card nổi độc lập, trượt vật lý từ dưới lên nhịp nhàng bằng GPU.

## Proposed Changes

### 1. `templates/index.html`
- Thêm styles cho `.table-floating-cards`, `.card-row`, `.card-row-anim`, `@keyframes cardRowSlideUp`.
- Cập nhật các bảng chính (table Nhập hàng `#table-purchases-history`, Spa `#table-pet-services`, Khách hàng, Sổ quỹ) với class `.table-floating-cards`.

### 2. `static/js/app.js`
- Nâng cấp `renderTableSkeleton(tbodyOrId, rows, cols)` để sinh ra các thẻ card skeleton nổi rời rạc (`card-row`).

### 3. `static/js/modules/purchases.js` & `static/js/modules/spa.js`
- Cập nhật template string `<tr>` thêm class `card-row card-row-anim` và shadow, `--row-idx: ${idx}`.

### 4. Verification
- `node -c` tất cả JS files.
- `node tests/test_spa_render.js`.
- `pytest` tests backend.

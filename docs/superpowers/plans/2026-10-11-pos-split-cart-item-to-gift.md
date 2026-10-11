# POS Split Cart Item to Gift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Thêm tính năng tách dòng sản phẩm trong giỏ hàng POS thành dòng quà tặng giá 0 đ (`is_manual_gift`), hỗ trợ hoàn tác gộp lại, bảo toàn khi chạy khuyến mãi tự động Mua X Tặng Y.

**Architecture:**
- Frontend: Mở rộng `static/js/pos.js` với các hàm `splitCartItemToGift(idx, qty)` và `mergeManualGiftItem(idx)`.
- UI rendering trong `renderActiveTabCart()`: hiển thị nút `🎁 Tách Tặng` khi món có `quantity >= 2`, hiển thị badge quà tặng và nút `🔄 Gộp lại` cho dòng `is_manual_gift`.
- Khuyến mãi: bảo vệ dòng `is_manual_gift` trong `syncBuyXGetYPromotionsInCart`.
- Test: Viết unit tests kiểm tra logic tách/gộp dòng và bảo toàn khuyến mãi tự động trong `tests/test_pos_split_gift_item.py`.

## Global Constraints
- Không làm vỡ layout giỏ hàng hiện tại trên Desktop và Mobile.
- Dòng quà tặng giá 0 đ nhưng vẫn lưu đúng `product_id` để trừ tồn kho khi thanh toán đơn hàng.

---

### Task 1: Logic Tách / Gộp Dòng Quà Tặng & Bảo Vệ Khuyến Mãi

**Files:**
- Modify: `static/js/pos.js`
- Test: `tests/test_pos_split_gift_item.py`

**Interfaces:**
- `splitCartItemToGift(idx, qty = 1)`
- `mergeManualGiftItem(idx)`
- `syncBuyXGetYPromotionsInCart(tab)` (giữ nguyên manual gift)

- [x] **Step 1: Write test case trong Node / Pytest**
Kiểm tra:
1. Tách dòng có SL 3 $\to$ Dòng gốc còn 2, sinh dòng mới SL 1 với `price = 0`, `is_gift = true`, `is_manual_gift = true`.
2. Gộp lại $\to$ Dòng gốc trở lại SL 3, dòng quà tặng biến mất.
3. Chạy `syncBuyXGetYPromotionsInCart` $\to$ Dòng quà tặng thủ công không bị xóa.

- [x] **Step 2: Triển khai code trong `static/js/pos.js`**
- [x] **Step 3: Chạy test xác nhận PASS**

---

### Task 2: Cập Nhật UI Hiển Thị Nút Tách / Gộp trong `renderActiveTabCart()`

**Files:**
- Modify: `static/js/pos.js`
- Test: `tests/test_pos_split_gift_item.py`

- [x] **Step 1: Render nút `🎁 Tách Tặng` cạnh cụm nút số lượng khi `quantity >= 2` và `!item.is_gift`**
- [x] **Step 2: Render badge `🎁 QUÀ TẶNG (0 đ)` và nút `🔄 Gộp lại` cho dòng `is_manual_gift`**
- [x] **Step 3: Kiểm tra hiển thị trên Browser / Playwright**

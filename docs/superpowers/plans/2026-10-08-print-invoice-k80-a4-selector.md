# Kế Hoạch Triển Khai: Bộ Chọn Khổ In K80 / A4 Linh Hoạt Trên Hóa Đơn & Danh Sách Hóa Đơn

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Thêm thanh chuyển đổi khổ in K80 (Khách lẻ) và A4 (Đại lý) trực tiếp trên Modal Xem Trước Hóa Đơn, tự động nhận diện mẫu in phù hợp dựa trên loại khách hàng và hỗ trợ chuyển đổi 1 chạm khi in lại từ danh sách hóa đơn.

**Architecture:** 
- Thêm thanh nút chuyển đổi K80 vs A4 trên header của `#print-modal` trong `templates/index.html` và `templates/pos.html`.
- Xây dựng hàm `switchModalPrintSize(size)` và logic tự động phát hiện Đại lý $\rightarrow$ A4, Khách lẻ $\rightarrow$ K80 trong `static/js/pos.js` và `static/js/modules/productions.js`.
- Viết test tự động xác nhận DOM và logic chuyển đổi khổ in.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `templates/index.html` | Modify — Thêm thanh nút chọn K80 / A4 trên header của `#print-modal` |
| `templates/pos.html` | Modify — Thêm thanh nút chọn K80 / A4 trên header của `#print-modal` |
| `static/js/pos.js` | Modify — Triển khai `switchModalPrintSize`, cache order hiện tại và tự động chọn khổ K80 vs A4 theo khách hàng |
| `static/js/modules/productions.js` | Modify — Đồng bộ `showPrintModal` và `renderAndPrint` với bộ chọn khổ K80 vs A4 từ danh sách hóa đơn |
| `tests/test_print_size_selector.py` | Create — Test tự động kiểm tra thanh chọn khổ in và logic chuyển đổi K80/A4 |

---

### Task 1: UI Cập Nhật Modal In (`templates/index.html` & `templates/pos.html`)

**Files:**
- Modify: `templates/index.html:9990-10010`
- Modify: `templates/pos.html:523-535`
- Test: `tests/test_print_size_selector.py`

- [ ] **Step 1: Write the failing test**
  Viết test kiểm tra `#print-modal` trong `templates/index.html` và `templates/pos.html` có chứa các phần tử `#btn-print-modal-k80`, `#btn-print-modal-a4` và gọi hàm `switchModalPrintSize`.
- [ ] **Step 2: Run test to verify it fails**
  Chạy `pytest tests/test_print_size_selector.py` xác nhận fail.
- [ ] **Step 3: Write minimal implementation**
  Chèn thanh segmented button K80 / A4 vào header của `#print-modal` trong cả 2 template.
- [ ] **Step 4: Run test to verify it passes**
  Chạy lại pytest xác nhận pass.

---

### Task 2: Logic Điều Phối In & Tự Động Nhận Diện Khổ In (`static/js/pos.js` & `static/js/modules/productions.js`)

**Files:**
- Modify: `static/js/pos.js`
- Modify: `static/js/modules/productions.js`
- Test: `tests/test_print_size_selector.py`

- [ ] **Step 1: Write test logic**
  Kiểm tra:
  - Khách lẻ $\rightarrow$ mặc định chọn K80.
  - Khách đại lý / có bảng giá $\rightarrow$ mặc định chọn A4.
  - Hàm `switchModalPrintSize('K80')` và `switchModalPrintSize('A4')` cập nhật preset và render lại đúng kích thước canvas & class active nút.
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Viết mã xử lý**
  - Trong `pos.js`: cài đặt `switchModalPrintSize`, cập nhật `showPrintModal`, `printDraftOrder`.
  - Trong `productions.js`: cài đặt `switchModalPrintSize`, đồng bộ với modal in từ bảng danh sách đơn.
- [ ] **Step 4: Run test & verify pass**
  Chạy `pytest tests/test_print_size_selector.py` và `pytest tests/test_k80_discount.py`.

---

### Task 3: Build Lại POS_Mastercare.exe & Đóng Gói Hoàn Thiện

**Files:**
- Modify: `POS_Mastercare.exe`
- Test: Toàn bộ test suite liên quan đến in ấn

- [ ] **Step 1: Recompile `uv run pyinstaller POS_Mastercare.spec --distpath . -y`**
- [ ] **Step 2: Chạy kiểm thử tổng thể**

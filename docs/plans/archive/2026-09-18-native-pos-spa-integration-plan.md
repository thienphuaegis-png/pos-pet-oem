# Kế Hoạch Triển Khai: Nhúng Màn Hình POS Vào SPA & Sắp Xếp Lại Menu

> **Dành cho Agentic Workers:** Thực thi theo từng bước, không bỏ qua kiểm thử giao diện và cú pháp JavaScript.

**Mục tiêu:** Nhúng toàn bộ giao diện và logic hiện đại của màn hình bán hàng (`pos.html` / `pos.js`) vào trực tiếp tab `#tab-pos` trong `templates/index.html`, sắp xếp lại thứ tự sidebar: Bán Hàng $\to$ Dịch Vụ $\to$ Hóa Đơn, tối ưu tràn viền không cuộn kép và cách ly phím tắt.

**Kiến trúc:** SPA Vanilla JS + TailwindCSS + FastAPI Backend. Tái cấu trúc `templates/index.html`, cập nhật hàm điều hướng trong `static/js/app.js`, và chuyển đổi `static/js/pos.js` thành module đồng bộ an toàn.

---

## Danh Sách File Liên Quan
| File | Trách nhiệm |
|---|---|
| `templates/index.html` | Đổi thứ tự nút sidebar; nhúng toàn bộ HTML của `pos.html` vào `#tab-pos` |
| `static/js/app.js` | Sửa `switchTab()` để toggle padding `p-0 overflow-hidden` khi vào tab POS |
| `static/js/pos.js` | Tái sử dụng state từ `app.js`, kích hoạt hotkeys có điều kiện khi tab POS hiển thị |
| `PROJECT_MAP.html` & `PROJECT_TRACKING.md` | Cập nhật tài liệu hiện trạng sau khi hoàn thành |

---

### Task 1: Sắp Xếp Lại Sidebar Menu Trong `templates/index.html`
**File:** `templates/index.html`

- [ ] **Step 1: Đổi thứ tự các nút trên sidebar**
  - Đưa nút `🛒 Bán Hàng (POS)` lên vị trí số 1, gọi `switchTab('pos')`, gắn class `active-tab`.
  - Đưa nút `🐾 Dịch Vụ & Thú Cưng` lên vị trí số 2, gọi `switchTab('pet-services')`.
  - Đưa nút `🧾 Hóa Đơn` lên vị trí số 3, gọi `switchTab('orders')`.
- [ ] **Step 2: Kiểm tra HTML hợp lệ và các thẻ đóng/mở chuẩn xác**

---

### Task 2: Nhúng Toàn Bộ Cấu Trúc POS Vào `<div id="tab-pos">`
**File:** `templates/index.html`

- [ ] **Step 1: Xóa bỏ 58 dòng thô cũ trong `#tab-pos`**
- [ ] **Step 2: Đưa layout POS hoàn chỉnh từ `pos.html` vào `#tab-pos`**
  - Thêm Top Bar POS: ô tìm kiếm F3, dải đa tab hóa đơn (`#invoice-tabs-bar`), nút `+` thêm hóa đơn F1, đồng hồ, bộ chọn Mẫu in, bộ chọn Nhân viên.
  - Thêm Khu vực Bán Hàng: Cột trái (Bảng giỏ hàng 12 cột) + Cột phải (Khách hàng, Tổng tiền, Giảm giá, Tiền khách đưa, Mệnh giá nhanh, Nút In Tạm Tính, Nút Thanh Toán F9).
  - Thêm các Modal phụ: Modal Tìm khách hàng nhanh, Modal xem trước/in hóa đơn.
- [ ] **Step 3: Nhúng thẻ `<script src="/static/js/pos.js"></script>` vào cuối `templates/index.html`**

---

### Task 3: Tối Ưu Khung Hiển Thị Tràn Viền Trong `static/js/app.js`
**File:** `static/js/app.js`

- [ ] **Step 1: Cập nhật hàm `switchTab(tabId)`**
  - Tìm thẻ container chính `#main-content-area`.
  - Nếu `tabId === 'pos'`: xóa class `p-6 overflow-y-auto`, gán class `p-0 overflow-hidden`. Gọi hàm `window.initPOSModule()` nếu có.
  - Nếu `tabId !== 'pos'`: xóa class `p-0 overflow-hidden`, gán class `p-6 overflow-y-auto`.
- [ ] **Step 2: Đặt tab mặc định khi mở app là `pos`**
  - Khởi tạo trang: `switchTab('pos')` thay vì `switchTab('orders')`.

---

### Task 4: Chuyển Đổi `static/js/pos.js` Thành Module Đồng Bộ & Cách Ly Hotkeys
**File:** `static/js/pos.js`

- [ ] **Step 1: Tránh xung đột khai báo lại biến toàn cục**
  - Kiểm tra nếu `window.allProducts` đã được `app.js` nạp thì dùng chung.
  - Gom các biến quản lý bán hàng vào namespace `window.POS` hoặc biến riêng có guard.
- [ ] **Step 2: Gắn điều kiện cho bộ lắng nghe phím tắt `keydown`**
  - Thêm kiểm tra: `if (document.getElementById('tab-pos')?.classList.contains('hidden')) return;` trước khi xử lý các phím `F1, F3, F4, F9, Enter`.
- [ ] **Step 3: Khởi tạo module khi tab POS mở**
  - Xuất hàm `window.initPOSModule()` để `app.js` gọi mỗi khi chuyển về tab `pos`.

---

### Task 5: Kiểm Thử Toàn Diện & Đồng Bộ Hồ Sơ Dự Án
- [ ] **Step 1: Chạy kiểm tra cú pháp JS (`node -c static/js/app.js` và `node -c static/js/pos.js`)**
- [ ] **Step 2: Kiểm tra render trang bằng curl hoặc browser check**
- [ ] **Step 3: Cập nhật `PROJECT_MAP.html` và `PROJECT_TRACKING.md`**

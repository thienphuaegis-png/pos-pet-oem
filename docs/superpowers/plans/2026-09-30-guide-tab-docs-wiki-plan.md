# Kế Hoạch Triển Khai: Tab Hướng Dẫn Nghiệp Vụ Trực Quan (Docs & Wiki Layout)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Thêm Tab Hướng Dẫn Nghiệp Vụ (`tab-guide`) nằm ngay trên Tab Cài Đặt (`tab-settings`) theo Mẫu 1 (Docs & Wiki Layout) với 7 phân hệ nghiệp vụ, sơ đồ logic Flowchart SVG, quy trình thao tác chuẩn SOP và tình huống quầy.

**Architecture:** Bổ sung nút điều hướng thứ 15 trên `#sidebar-nav` (giữa `shifts` và `settings`). Vùng nội dung `#tab-guide` nằm trực tiếp trong `#main-content-area` trước `#tab-settings`. Bên trong gồm Sub-sidebar 2 cấp danh mục nghiệp vụ và Khung nội dung chi tiết với Sơ đồ luồng SVG offline, các bước thao tác SOP và mẹo xử lý quầy.

**Tech Stack:** HTML5, Tailwind CSS, Inline Vector SVG (Lucide & Custom Flowcharts), Vanilla JS (0 external runtime dependency, 100% Offline).

---

## Global Constraints
- Không dùng ảnh ngoài qua CDN/URL internet (100% offline).
- Giữ nguyên 100% ID DOM của 14 tabs hiện tại, không làm vỡ các test case đang pass.
- Đảm bảo toàn bộ test trong `pytest tests/` pass 100%.

---

## File Structure

| File | Responsibility |
|---|---|
| `templates/index.html` | Thêm nút sidebar `Hướng Dẫn` (icon `book-open`) và khối container `#tab-guide` với 7 sub-docs |
| `static/js/app.js` | Hàm `switchGuideSubTab(subId)` điều hướng mượt mà 7 phân hệ tài liệu |
| `tests/test_html_integrity.py` | Cập nhật `expected_tabs` (13 tabs) và số lượng nút sidebar (15 buttons) |
| `PROJECT_STATE.md` | Đồng bộ trạng thái theo Checkpoint Protocol |
| `PROJECT_MAP.html` | Cập nhật task `guide-1` và bump version |

---

### Task 1: Cập Nhật Test Suite `test_html_integrity.py` Để Chuẩn Bị Cho Tab Hướng Dẫn

**Files:**
- Modify: `tests/test_html_integrity.py`

- [ ] **Step 1: Sửa test case kiểm tra 13 tabs chính và 15 nút sidebar**
  - Thêm `'tab-guide'` vào danh sách `expected_tabs`.
  - Cập nhật assertion `len(buttons) == 15`.
- [ ] **Step 2: Chạy pytest để xác nhận test FAIL (vì chưa có nút và tab)**
- [ ] **Step 3: Ghi nhận lỗi fail chính xác phục vụ bước tiếp theo**

---

### Task 2: Thêm Nút Điều Hướng Sidebar & Khung Giao Diện Tab Hướng Dẫn (`tab-guide`) Vào `templates/index.html`

**Files:**
- Modify: `templates/index.html`

- [ ] **Step 1: Thêm nút Tab Hướng Dẫn vào `#sidebar-nav`**
  - Nằm ngay sau nút `shifts` và ngay trước nút `settings`.
  - Thuộc tính `data-tab="guide"`, `data-tooltip="Hướng Dẫn Nghiệp Vụ"`, icon SVG Lucide `book-open`.
- [ ] **Step 2: Xây dựng cấu trúc HTML `#tab-guide` ngay trước `#tab-settings`**
  - Sub-sidebar 7 phân hệ với các icon SVG và badge số thứ tự.
  - Khung nội dung chi tiết cho từng phân hệ:
    + 1. Bán Hàng Quầy POS & Ca Làm Việc (`guide-sub-pos`)
    + 2. Tiếp Nhận & Dịch Vụ Spa Grooming (`guide-sub-spa`)
    + 3. Khách Sạn Thú Cưng Pet Hotel (`guide-sub-hotel`)
    + 4. Nạp Gói Ví & Cấn Trừ Tiền Trả Trước (`guide-sub-wallet`)
    + 5. Sổ Quỹ Thu Chi & Dòng Tiền Công Nợ (`guide-sub-cashbook`)
    + 6. Kho Hàng, Đơn PO & Gia Công OEM (`guide-sub-inventory`)
    + 7. Kết Nối Mạng LAN & Cấu Hình Mẫu In (`guide-sub-setup`)
- [ ] **Step 3: Vẽ đầy đủ 7 sơ đồ Flowchart vector SVG tương tác**
  - Chuẩn màu Tailwind (Purple, Blue, Emerald, Amber, Rose).
  - Thể hiện rõ các bước và luồng di chuyển của dòng tiền/dữ liệu.

---

### Task 3: Viết Logic Điều Hướng Sub-Doc Trong `static/js/app.js`

**Files:**
- Modify: `static/js/app.js`

- [ ] **Step 1: Thêm hàm `switchGuideSubTab(subId)`**
  - Ẩn các khối `guide-sub-*` và kích hoạt khối được chọn.
  - Đổi màu active nút trên sub-sidebar (`bg-purple-100 text-purple-800`).
  - Hỗ trợ cuộn lên đầu trang đọc tài liệu 0ms.
- [ ] **Step 2: Bổ sung hook trong `switchTab('guide')`**
  - Mặc định mở phân hệ đầu tiên (`pos`) nếu chưa chọn phân hệ nào.

---

### Task 4: Kiểm Thử Toàn Diện & Đồng Bộ Checkpoint Protocol

**Files:**
- Modify: `PROJECT_STATE.md`
- Modify: `PROJECT_MAP.html`

- [ ] **Step 1: Chạy toàn bộ test suites (`pytest tests/`)**
  - `tests/test_html_integrity.py`
  - `tests/test_checkpoint_integrity.py`
  - `tests/test_hotel_system.py`
- [ ] **Step 2: Cập nhật `PROJECT_STATE.md` và `PROJECT_MAP.html`**
- [ ] **Step 3: Git commit chuẩn Conventional Commits & push lên GitHub**

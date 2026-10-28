# Kế Hoạch Triển Khai: Quy Chuẩn Checkpoint & Nâng Cấp Project Map Tree

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Thống nhất quy trình đọc/lưu checkpoint qua `PROJECT_STATE.md`, tích hợp Cây Thư Mục tương tác vào `PROJECT_MAP.html`, loại bỏ file thừa `PROJECT_TRACKING.md`, và cập nhật bộ chuẩn `coding-standards`.

**Architecture:** `PROJECT_STATE.md` là file duy nhất cho AI đọc/lưu trạng thái phiên (< 800 tokens). `PROJECT_MAP.html` là giao diện hiển thị 2 tab (Tiến Độ + Cây Thư Mục) tự đồng bộ dữ liệu. `coding-standards` là bộ chuẩn tự soi để AI luôn tuân thủ quy trình này.

**Tech Stack:** Markdown, HTML5, Tailwind CSS, JavaScript.

---

## File Structure Map

| File | Trách nhiệm |
|---|---|
| `C:\Users\thien\AppData\Local\hermes\skills\software-development\coding-standards\SKILL.md` | Modify: Thêm quy tắc Checkpoint Protocol vào Mục 4 |
| `docs/archive/STATE_2026_09.md` | Create: Lưu trữ toàn bộ log cũ từ 23/9 đến 26/9 |
| `docs/archive/LEGACY_TRACKING.md` | Create: Lưu trữ nội dung cũ của `PROJECT_TRACKING.md` |
| `PROJECT_STATE.md` | Modify: Tinh gọn thành file Checkpoint chuẩn (< 100 dòng, < 800 tokens) |
| `PROJECT_MAP.html` | Modify: Thêm tab Cây Thư Mục, bộ lọc view, nâng cấp version cache buster |
| `PROJECT_TRACKING.md` | Delete: Loại bỏ file dư thừa |
| `tests/test_checkpoint_integrity.py` | Create: Test kiểm tra toàn vẹn checkpoint và DOM của `PROJECT_MAP.html` |

---

### Task 1: Cập nhật Skill `coding-standards` (Quy chuẩn Checkpoint)

**Files:**
- Modify: `C:\Users\thien\AppData\Local\hermes\skills\software-development\coding-standards\SKILL.md`

- [ ] **Step 1: Thêm quy chuẩn Checkpoint Protocol vào Mục 4 của `coding-standards`**
  - Điểm đọc: Bắt buộc đọc `PROJECT_STATE.md` khi bắt đầu phiên làm việc.
  - Điểm ghi: Cập nhật `PROJECT_STATE.md` (< 100 dòng, < 800 tokens) kèm kết quả kiểm thử khi kết thúc phiên.
  - Đồng bộ giao diện: Cập nhật đồng thời `DEFAULT_TASKS` và `ROADMAP_VERSION` trong `PROJECT_MAP.html`.
  - Cấm duy trì file thừa `PROJECT_TRACKING.md`.
- [ ] **Step 2: Kiểm tra nội dung skill sau khi sửa**

---

### Task 2: Lưu trữ log cũ & Tinh gọn `PROJECT_STATE.md`

**Files:**
- Create: `docs/archive/STATE_2026_09.md`
- Modify: `PROJECT_STATE.md`

- [ ] **Step 1: Tạo file `docs/archive/STATE_2026_09.md` chứa toàn bộ lịch sử ngày 23/9 - 26/9**
- [ ] **Step 2: Viết lại `PROJECT_STATE.md` theo chuẩn tinh gọn 4 phần:**
  1. Metadata (Ngày, Cổng, Database, Branch).
  2. Phiên hiện tại (Các tính năng đã hoàn thiện).
  3. Bằng chứng kiểm thử (PASS bao nhiêu test).
  4. Việc kế tiếp (Next tasks với ID rõ ràng).
- [ ] **Step 3: Xác minh `PROJECT_STATE.md` < 100 dòng và không chứa log lịch sử cũ**

---

### Task 3: Nâng cấp `PROJECT_MAP.html` (Tab Cây Thư Mục & Auto Cache Buster)

**Files:**
- Modify: `PROJECT_MAP.html`

- [ ] **Step 1: Thêm thanh chuyển tab trên giao diện:**
  - Nút `[📋 Bảng Tiến Độ]` và `[📂 Cây Thư Mục]` (Project Tree).
- [ ] **Step 2: Thêm component Cây Thư Mục Tương Tác:**
  - Cấu trúc thư mục dự án trực quan: `routers/`, `templates/`, `static/`, `data/`, `tests/`, `docs/`, `scripts/`.
  - Có badge giải thích chức năng từng file/thư mục.
- [ ] **Step 3: Nâng cấp hàm tự động ghi đè cache khi bump `ROADMAP_VERSION`**
- [ ] **Step 4: Cập nhật `DEFAULT_TASKS` khớp 100% với các task của `PROJECT_STATE.md`**

---

### Task 4: Lưu trữ & Xóa bỏ `PROJECT_TRACKING.md`

**Files:**
- Create: `docs/archive/LEGACY_TRACKING.md`
- Delete: `PROJECT_TRACKING.md`

- [ ] **Step 1: Di chuyển nội dung `PROJECT_TRACKING.md` sang `docs/archive/LEGACY_TRACKING.md`**
- [ ] **Step 2: Xóa file `PROJECT_TRACKING.md` khỏi thư mục gốc**

---

### Task 5: Kiểm Thử Toàn Vẹn & Nghiệm Thu

**Files:**
- Create: `tests/test_checkpoint_integrity.py`

- [ ] **Step 1: Viết test `tests/test_checkpoint_integrity.py` kiểm tra:**
  - `PROJECT_STATE.md` tồn tại và dưới 100 dòng.
  - `PROJECT_TRACKING.md` không còn tồn tại ở thư mục gốc.
  - `PROJECT_MAP.html` chứa đủ component Tree View và version mới.
- [ ] **Step 2: Chạy test và xác nhận PASS 100%**

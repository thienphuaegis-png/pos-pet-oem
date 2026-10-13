# Settings Cleanup and AI Agent Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans.

**Goal:** 
1. Tách nhật ký hoạt động thành sub-tab riêng, chỉ load khi xem, bỏ cố định 500 bản ghi.
2. Cho phép lưu link Google Drive Webhook trong tab Thông tin doanh nghiệp.
3. Xóa bỏ khối cấu hình tài khoản & QR thanh toán không dùng trong Cài đặt.
4. Thêm tab Tác Nhân AI trên sidebar (trên tab Cài Đặt) nhận diện ảnh tạo đơn nháp, nhập hàng, OEM, thu chi.

**Tech Stack:** Python 3 (FastAPI, SQLite, Gemini 2.5 Flash Vision), JavaScript (Vanilla ES6+), Tailwind CSS, pytest.

## File Structure

| File | Responsibility |
|---|---|
| `templates/index.html` | Cập nhật sidebar thêm tab AI, tách sub-tab Nhật ký hoạt động, xóa khối QR, thêm Drive link vào form Doanh nghiệp |
| `routers/ai_assistant.py` | Thêm endpoint `POST /api/ai/parse-document-image` nhận diện ảnh đa nghiệp vụ |
| `static/js/modules/ai_agent.js` | Create — Logic kéo thả ảnh, paste `Ctrl+V`, gọi AI vision, hiển thị kết quả và tạo 4 loại đơn |
| `static/js/staff.js` | Tách `renderActivityLog` ra khỏi eager-load, thêm chọn limit 100-2000 |
| `static/js/modules/productions.js` | Cập nhật `saveCompanySettings` lưu `google_drive_webhook_url`, bỏ tham chiếu các element QR đã xóa |
| `tests/test_settings_and_ai_agent_tab.py` | Create — Unit test kiểm tra các endpoint, cấu trúc DOM và logic |

---

### Task 1: Tách Sub-tab Nhật Ký Hoạt Động & Cho Phép Chọn Số Lượng Bản Ghi

- Modify: `templates/index.html` (chuyển khối log thành `#settings-sub-activity-log`, thêm nút tab)
- Modify: `static/js/staff.js` (bỏ eager load trong `renderRolesAndPermissionsTab`, thêm tham số limit)

---

### Task 2: Làm Sạch Tab Thông Tin Doanh Nghiệp (Lưu Link Drive & Xóa Bỏ Cấu Hình QR)

- Modify: `templates/index.html` (xóa khối QR `Cấu Hình Tài Khoản & QR Thanh Toán`, đưa link Drive vào form chính)
- Modify: `static/js/modules/productions.js` (cập nhật `saveCompanySettings`, bỏ tham chiếu element QR)

---

### Task 3: Backend API Bóc Tách Chứng Từ / Hóa Đơn Bằng AI Vision

- Modify: `routers/ai_assistant.py` (viết endpoint `POST /api/ai/parse-document-image`)

---

### Task 4: Frontend Tab Tác Nhân AI Trên Sidebar

- Modify: `templates/index.html` (thêm nút tab `ai-agent` trên sidebar và container `#tab-ai-agent`)
- Create: `static/js/modules/ai_agent.js` (xử lý paste ảnh, kéo thả, render đối soát và tạo 4 loại đơn)

---

### Task 5: Viết Unit Test & Rebuild Exe

- Create: `tests/test_settings_and_ai_agent_tab.py`
- Rebuild: `POS_Mastercare.exe`
- Push GitHub.

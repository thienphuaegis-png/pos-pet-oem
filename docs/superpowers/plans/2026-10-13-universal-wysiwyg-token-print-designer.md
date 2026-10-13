# Kế Hoạch Triển Khai Trình Thiết Kế Mẫu In Toàn Năng WYSIWYG + Token

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans.

**Goal:** Xây dựng Trình Soạn Thảo Mẫu In Đa Nghiệp Vụ WYSIWYG + Token Chips chuẩn KiotViet trong sub-tab Cài Đặt > Thiết Kế Mẫu In, hỗ trợ POS, Nhập hàng, Gia công OEM, Thu/Chi, Spa; kèm Token Picker, Live Preview và bộ Preset 1-chạm.

**Architecture:**
1. `routers/settings.py`: Thêm API endpoint `/api/settings/print-templates/{doc_type}` (GET/POST) và `/api/settings/print-templates/{doc_type}/sample-data` (GET) cung cấp mẫu và dữ liệu mẫu thực tế của 6 loại chứng từ.
2. `static/js/modules/print_designer.js`: Module điều khiển trình soạn thảo WYSIWYG, chuyển đổi Token `[Tên token]` $\leftrightarrow$ `{{token_key}}`, xử lý thanh Toolbar (Font, Size, Align, Bold/Italic, Table, Source mode), Token Picker Modal, và render Live Preview sang khổ giấy K80/A4/A5 Dọc/Ngang.
3. `templates/index.html`: Cập nhật cấu trúc HTML của `#settings-sub-templates` với Top bar (Loại mẫu, Chọn mẫu gợi ý, Đặt lại, In thử, Lưu), Split View 2 cột (Cột trái: Toolbar + ContentEditable Editor; Cột phải: Khung Live Preview + Zoom), và Token Picker Modal.
4. `tests/test_universal_print_designer.py`: Bộ unit test backend kiểm tra lấy mẫu, lưu mẫu, và dữ liệu mẫu của 6 loại chứng từ.

## Task 1: Backend API Print Templates & Sample Data
- [ ] **Step 1: Viết failing test `tests/test_universal_print_designer.py`**
- [ ] **Step 2: Cập nhật `routers/settings.py` các endpoint GET/POST print templates và sample data**
- [ ] **Step 3: Chạy test xác nhận PASS**

## Task 2: Frontend Module WYSIWYG & Token Engine
- [ ] **Step 1: Viết `static/js/modules/print_designer.js` với token mapper, WYSIWYG commands, preview renderer và preset loader**
- [ ] **Step 2: Cập nhật `#settings-sub-templates` trong `templates/index.html`**
- [ ] **Step 3: Nhúng script vào `templates/index.html` và viết test kiểm tra tích hợp giao diện**

## Task 3: Build & Đóng Gói
- [ ] **Step 1: Chạy build lại POS_Mastercare.exe và cập nhật version.json**
- [ ] **Step 2: Commit và push git**

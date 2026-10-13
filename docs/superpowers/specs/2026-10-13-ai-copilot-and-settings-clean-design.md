# Thiết Kế: Cải Tiến Cài Đặt (Nhật Ký Hoạt Động, Google Drive, Bỏ QR) & Tác Nhân AI (AI Copilot)

## 1. Bối Cảnh & Nhu Cầu
Người dùng yêu cầu 4 cải tiến cốt lõi:
1. **Nhật ký hoạt động**: Đang bị cố định 500 bản ghi và load ngầm khi mở Cài đặt. Yêu cầu: Tách thành 1 sub-tab riêng, không tự động load, cho phép chọn số lượng bản ghi linh hoạt (100, 200, 500, 1000, 2000).
2. **Tab Thông tin doanh nghiệp**: Không lưu được link Google Drive Webhook qua nút chính. Yêu cầu: Tích hợp trường Link Drive vào form Thông tin doanh nghiệp và lưu đồng bộ 1-chạm.
3. **Cấu hình tài khoản & QR thanh toán**: Không sử dụng vì đã quản lý qua Sổ Quỹ. Yêu cầu: Xóa bỏ khỏi tab Thông tin doanh nghiệp.
4. **Tác nhân AI (AI Copilot)**: Thêm 1 tab AI mới nằm phía trên tab Cài Đặt. Tác nhân AI dựa vào ảnh thả vào hoặc dán `Ctrl + V` để tự động nhận diện và đề xuất tạo Đơn nháp POS, Phiếu nhập hàng PN, Đơn OEM, hoặc Thu/Chi Sổ Quỹ với giao diện đối soát 1-chạm.

## 2. Kiến Trúc Giải Pháp

### 2.1. Cải tiến Tab Cài Đặt
- `templates/index.html`:
  - Trong `#settings-sub-company`: Xóa bỏ khối thẻ "Cấu Hình Tài Khoản & QR Thanh Toán", tích hợp ô Webhook Google Drive vào form Doanh nghiệp.
  - Tách khối Nhật ký hoạt động thành sub-tab riêng `#settings-sub-activity-log`. Bổ sung dropdown chọn số lượng bản ghi `#activity-log-limit` (100, 200, 500, 1000, 2000).
- `static/js/app.js`:
  - Cập nhật `switchSettingsSubTab`: Kích hoạt `renderActivityLog()` khi chọn sub-tab `activity-log`.
- `static/js/staff.js`:
  - Bỏ lời gọi `renderActivityLog()` trong `loadPermissionsUI()` để không tải ngầm. Đọc giá trị `#activity-log-limit`.
- `static/js/modules/productions.js`:
  - `saveCompanySettings()`: Lưu đồng bộ `google_drive_webhook_url` cùng các trường thông tin doanh nghiệp.

### 2.2. Tác Nhân AI (AI Copilot) Phía Trên Cài Đặt
- **Vị trí**: Nằm giữa `Hướng Dẫn Nghiệp Vụ` và `Cài Đặt Hệ Thống` trên thanh sidebar menu (`data-tab="ai-copilot"`).
- **Backend API (`routers/ai_assistant.py`)**:
  - Endpoint `POST /api/ai/vision-parse`:
    - Nhận ảnh base64 hoặc file ảnh từ client.
    - Gọi mô hình đa phương thức `gemini-2.5-flash` qua Google Gemini API.
    - Trích xuất cấu trúc chuẩn: Loại nghiệp vụ (`retail_order`, `purchase_order`, `oem_order`, `cashbook_voucher`), đối tác, ngày, bảng chi tiết món hàng (tên, số lượng, đơn vị, đơn giá, thành tiền), tổng tiền, giảm giá.
    - So khớp tự động (Heuristic Matching) với CSDL kho `products` và danh bạ `contacts`.
- **Frontend (`templates/index.html` & `static/js/modules/ai_assistant.js`)**:
  - Khu vực tải ảnh: Drag-and-drop, chọn file, hoặc **dán trực tiếp từ clipboard (`Ctrl + V`)**.
  - Xem trước ảnh, nút phân tích bằng AI.
  - Bảng kết quả đối soát: Hiển thị badge nghiệp vụ, thông tin đối tác, bảng món có thể chỉnh sửa inline.
  - Cụm nút điều phối 1-chạm:
    - 🛒 Đẩy vào Giỏ Hàng POS
    - 📥 Tạo Phiếu Nhập Hàng PN
    - 🏭 Tạo Đơn Gia Công OEM
    - 💰 Tạo Phiếu Thu/Chi Sổ Quỹ

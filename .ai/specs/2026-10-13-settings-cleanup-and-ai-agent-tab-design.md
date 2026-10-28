# Thiết Kế: Cải Tiến Cài Đặt (Log, Drive, Xóa QR) & Thêm Tab Tác Nhân AI Bóc Tách Đa Năng

## 1. Yêu Cầu Người Dùng & Bối Cảnh
1. **Nhật ký hoạt động (Activity Log)**:
   - Hiện bị khóa cứng 500 bản ghi, tự động load khi mở phân quyền gây chậm.
   - Chuyển thành một **Sub-tab riêng biệt** trong Cài Đặt. Không eager-load khi mở Cài Đặt. Chỉ load khi click vào tab.
   - Thêm bộ chọn số lượng bản ghi (100, 200, 500, 1.000, 2.000, Tất cả).
2. **Tab Thông tin doanh nghiệp**:
   - Hiện không thêm được link Google Drive Webhook vì form `saveCompanySettings` không đưa trường này vào payload lưu chung.
   - Tích hợp trường Link Webhook Google Drive vào form chính, bấm "Lưu Thông Tin Doanh Nghiệp" là lưu đồng bộ.
3. **Cấu hình tài khoản & QR thanh toán**:
   - Không còn dùng trong Cài đặt vì hệ thống đã quản lý tài khoản ngân hàng tập trung trong Sổ Quỹ (`payment_accounts`).
   - Xóa bỏ hoàn toàn khối giao diện này và code JS liên quan trong Cài đặt để làm sạch form.
4. **Tab Tác Nhân AI (AI Copilot) phía trên Cài Đặt**:
   - Thêm tab mới trên sidebar nằm ngay trên Cài Đặt: `[🤖 Tác Nhân AI]` (id: `tab-ai-agent`).
   - Bỏ ảnh vào (kéo thả, chọn file, hoặc dán clipboard `Ctrl + V`).
   - Tác nhân AI phân tích ảnh và tự động nhận diện 4 nghiệp vụ:
     1. 🛒 **Đơn bán hàng POS / Đơn nháp** (`pos_order`)
     2. 📥 **Phiếu nhập hàng PO/PN** (`purchase_order`)
     3. 🏭 **Đơn gia công OEM** (`oem_order`)
     4. 💰 **Thu / Chi Sổ Quỹ** (`cashflow_voucher`)
   - Tự động so khớp sản phẩm và khách hàng/NCC có sẵn trong CSDL.
   - Cho phép người dùng đối soát trên bảng trực quan và 1-click tạo đơn nháp / đẩy giỏ hàng / ghi sổ quỹ.

## 2. Thiết Kế Kiến Trúc & API

### 2.1. Backend API (`routers/ai_assistant.py`)
- Endpoint mới: `POST /api/ai/parse-document-image`
  - Input: `{ image_base64: str, mime_type: str, prompt_hint: Optional[str] }`
  - LLM: `gemini-2.5-flash` (Vision) hoặc Heuristic fallback.
  - Context Injection: Tự động nạp danh sách sản phẩm mẫu (`id`, `name`, `code`, `sell_price`, `cost_price`) và danh sách đối tác (`id`, `name`, `phone`, `type`).
  - Output Schema:
    ```json
    {
      "detected_type": "pos_order" | "purchase_order" | "oem_order" | "cashflow_voucher",
      "partner_name": "...",
      "matched_partner_id": 123,
      "date": "YYYY-MM-DD",
      "total_amount": 1500000,
      "note": "...",
      "items": [
        {
          "product_name": "...",
          "matched_product_id": 45,
          "quantity": 10,
          "price": 150000,
          "unit": "Chai",
          "confidence": 0.95
        }
      ],
      "cashflow_type": "in" | "out",
      "cashflow_category": "..."
    }
    ```

### 2.2. Frontend Tab Tác Nhân AI (`templates/index.html` & `static/js/modules/ai_agent.js`)
- Sidebar Button: Thêm `<button onclick="switchTab('ai-agent')" ...>🤖 Tác Nhân AI</button>` ngay trên tab `settings`.
- Tab Content (`#tab-ai-agent`):
  - Khu vực 1: Dropzone tải ảnh + Hỗ trợ paste clipboard `Ctrl + V` + Xem trước ảnh có zoom.
  - Khu vực 2: Thẻ phân tích kết quả với badge loại chứng từ (POS / Nhập hàng / OEM / Thu Chi).
  - Khu vực 3: Bảng danh sách hàng hóa bóc tách được (cho phép sửa trực tiếp số lượng, giá).
  - Khu vực 4: Các nút hành động 1-chạm:
    - `[🛒 Đẩy Vào Giỏ Hàng POS]` $\to$ gán vào `tab.cart`, chuyển sang tab Bán Hàng.
    - `[📥 Điền Vào Phiếu Nhập Hàng]` $\to$ mở form tạo phiếu nhập hàng, tự điền items.
    - `[🏭 Điền Vào Đơn Gia Công OEM]` $\to$ mở modal tạo đơn OEM, tự điền items.
    - `[💰 Tạo Phiếu Thu/Chi Sổ Quỹ]` $\to$ tạo trực tiếp vào Sổ Quỹ sau khi người dùng xác nhận.

### 2.3. Cải Tiến Cài Đặt (`templates/index.html`, `static/js/staff.js`, `static/js/modules/productions.js`)
- Tách `settings-sub-activity-log`: Thêm tab button `[📜 Nhật Ký Hoạt Động]` cạnh `[👥 Phân Quyền & Vai Trò]`.
- Trong `staff.js`: Bỏ gọi `renderActivityLog()` trong `renderRolesAndPermissionsTab`. Chỉ gọi khi mở tab `settings-sub-activity-log`.
- Thêm dropdown limit: 100, 200, 500, 1000, 2000.
- Xóa khối "Cấu Hình Tài Khoản & QR Thanh Toán" trong `settings-sub-company`.
- Sửa `saveCompanySettings()`: Lưu trường `google_drive_webhook_url` trực tiếp vào payload POST `/api/settings/company`.

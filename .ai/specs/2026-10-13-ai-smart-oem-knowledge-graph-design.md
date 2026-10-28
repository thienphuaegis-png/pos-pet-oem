# Thiết Kế Nâng Cấp Trí Thông Minh Cho Tác Nhân AI: Context Injection OEM/NCC & Tự Động Điền Đơn

## Mục tiêu
Nâng cấp Tác nhân AI (`routers/ai_assistant.py` và `static/js/modules/ai_agent.js`) để AI không còn nhận diện ngô nghê hay nhầm lẫn giữa Phiếu nhập hàng và Đơn Gia Công OEM:
1. **Nạp bản đồ tri thức CSDL (Knowledge Graph Context)**: Đưa quan hệ giữa Xưởng gia công (`contacts`) và các mặt hàng phụ trách (`supplier_items`, `products`) cùng lịch sử mã hàng (`GC...`) vào prompt và heuristic engine.
2. **Đối soát 2 chiều thông minh**:
   - Khi phát hiện mã `GC...` hoặc tên hàng khớp với các sản phẩm do xưởng OEM phụ trách $\to$ tự động định danh `detected_type = "oem_order"`.
   - Tự động nhận diện chính xác Đối tác Xưởng (ví dụ: `Lucky Star` - ID: 10).
   - Tự động bóc tách các chỉ số tài chính sâu của OEM: `vat_percent`, `discount_percent`, `deposit_amount`, `remaining_payment`.
3. **Bộ chọn linh hoạt (Override Dropdown)**: Cho phép người dùng chuyển đổi nhanh giữa 4 loại nghiệp vụ trên giao diện (Đơn POS, Nhập PN, Gia Công OEM, Thu/Chi Sổ Quỹ) mà không cần quét lại ảnh.
4. **1-Chạm điền đơn OEM**: Nút `[🏭 Điền Đơn Gia Công OEM]` tự động mở modal `modal-create-oem`, điền xưởng `Lucky Star`, danh sách sản phẩm, số lượng, đơn giá, VAT, chiết khấu và tiền cọc sẵn sàng để lưu.

## Kiến trúc dữ liệu
### 1. Bổ sung ngữ cảnh API `/api/ai/parse-document-image`
- Truy vấn bảng `contacts` có `type = 'supplier'` (đặc biệt các đối tác có liên kết gia công OEM trong `supplier_items`).
- Ghép nối danh sách sản phẩm theo từng xưởng:
  ```json
  [
    {
      "factory_id": 10,
      "factory_name": "Lucky Star",
      "managed_products": [
        {"id": 34, "name": "Nước Lau Sàn hương Bạc Hà 1lít", "code": "NLSBH", "cost_price": 18288.0},
        {"id": 35, "name": "Nước Lau Sàn hương Cà Phê 1lít", "code": "NLSCP", "cost_price": 18288.0},
        {"id": 36, "name": "Nước Lau Sàn hương Chanh Sả 1lít", "code": "NLSCS", "cost_price": 18288.0},
        {"id": 37, "name": "Nước Lau Sàn hương Quế Cam 1lít", "code": "NLCQC", "cost_price": 18288.0}
      ]
    }
  ]
  ```
- Cập nhật prompt Gemini Vision và offline heuristic engine:
  - Nếu ảnh có mã `GC...`, "Phụ lục", "Cọc đợt 1", "Còn lại khi nhận hàng" hoặc chứa tên hàng thuộc xưởng OEM $\to$ Bắt buộc chọn `oem_order`.
  - Trả về cấu trúc JSON bổ sung:
    ```json
    {
      "detected_type": "oem_order",
      "partner_name": "Lucky Star",
      "matched_partner_id": 10,
      "vat_percent": 8.0,
      "discount_percent": 5.0,
      "deposit_amount": 49377600,
      "remaining_payment": 44805600,
      ...
    }
    ```

### 2. Frontend Tương Tác
- Thêm Select dropdown trên UI: `Loại nghiệp vụ: [🛒 Đơn POS | 📥 Nhập Hàng PN | 🏭 Gia Công OEM | 💰 Thu/Chi Sổ Quỹ]`. Thay đổi select sẽ tự động cập nhật nút hành động phía dưới.
- Hiển thị thêm các badge tài chính OEM nếu có: `VAT: 8%`, `CK: 5%`, `Đã cọc: 49.377.600 đ`, `Còn lại: 44.805.600 đ`.
- Hàm `createAIOEMOrder()`: Mở `openModalCreateOEM()`, tự chọn nhà máy `Lucky Star` (partner_id=10), nạp các dòng sản phẩm vào bảng items OEM, gán giá trị VAT, CK, Cọc và tính toán lại tổng thành tiền.

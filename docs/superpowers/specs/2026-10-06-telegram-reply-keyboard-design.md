# Thiết Kế Chi Tiết: Giao Diện Bàn Phím Reply Keyboard & Thao Tác 1-Chạm Trên Telegram

- **Ngày tạo:** 2026-10-06
- **Trạng thái:** Approved by Owner (Triển khai Hướng 2: Bàn phím Reply Keyboard cố định + Danh sách 5 đơn gần nhất chọn 1-chạm)

---

## 1. Mục Tiêu Cải Thiện Giao Diện
- Không bắt người dùng phải nhớ hay gõ các lệnh gạch chéo (`/baocao`, `/huyhoadon`, etc.).
- Bàn phím bấm to (Persistent Reply Keyboard) luôn ghim sẵn ở đáy màn hình chat Telegram.
- Thao tác chọn hóa đơn để Hủy hoặc Sửa thanh toán theo dạng **chạm 1 chạm**: Bot tự động tải 5 đơn hàng gần nhất thành các nút bấm inline kèm mã, tên khách và số tiền.

---

## 2. Bố Cục Bàn Phím Cố Định (Reply Keyboard Markup)

Khi Admin gửi bất kỳ tin nhắn nào hoặc gửi `/start`, bot tự động đính kèm `reply_markup` loại `keyboard` (`resize_keyboard=True`):

```text
[ [ 📊 Doanh Thu Hôm Nay ], [ 📦 Hàng Hết / Cần Đặt ] ]
[ [ 🔍 Tra Giá Báo Khách ], [ 📂 Danh Mục Sản Phẩm  ] ]
[ [ ❌ Hủy Hóa Đơn       ], [ 💳 Đổi Thanh Toán     ] ]
```

---

## 3. Đặc Tả Chi Tiết Hành Động Khi Bấm Từng Nút

### 3.1. Nút `[📊 Doanh Thu Hôm Nay]`
- **Hành vi:** Chạy ngay báo cáo doanh thu trong ngày của POS.
- **Phản hồi:** 
  - Khối số liệu: Số đơn, Doanh thu, Thực thu, Công nợ, Dòng tiền theo tài khoản.
  - Hàng nút inline chuyển nhanh: `[📅 Hôm nay]`, `[⏮️ Hôm qua]`, `[📆 Tháng này]`.

### 3.2. Nút `[📦 Hàng Hết / Cần Đặt]`
- **Hành vi:** Chạy ngay danh sách sản phẩm tồn kho `<= 0` (hết hàng hoặc âm kho).
- **Phản hồi:** Danh sách gọn gàng (Tên hàng, mã, tồn hiện tại, đơn vị tính, giá nhập để tiện đặt NCC).

### 3.3. Nút `[📂 Danh Mục Sản Phẩm]`
- **Hành vi:** Liệt kê các nhóm danh mục hàng hóa (Thức ăn, Cát, Phụ kiện, Spa...).
- **Phản hồi:** Các nút inline theo danh mục. Bấm vào danh mục nào thì bot tự lọc ra 5 sản phẩm tiêu biểu và giá bán của nhóm đó.

### 3.4. Nút `[🔍 Tra Giá Báo Khách]`
- **Hành vi:**
  - Bot gửi tin nhắn hướng dẫn: *"Anh gõ tên sản phẩm cần báo giá (Ví dụ: `pate`, `cát`, `royal`):"*
  - Kèm theo các nút inline danh mục gợi ý để bấm xem ngay không cần gõ.
  - Đồng thời ghi nhớ trạng thái chờ `waiting_price_search` cho `chat_id` này. Khi user nhắn tin nhắn tiếp theo, bot tự động hiểu đó là từ khóa tìm kiếm mà không cần gõ `/gia`.

### 3.5. Nút `[❌ Hủy Hóa Đơn]` (1-Chạm)
- **Hành vi:**
  - Bot truy vấn DB lấy 5 đơn hàng mới nhất phát sinh hôm nay.
  - Hiển thị danh sách dạng nút Inline Keyboard:
    ```text
    📋 CHỌN ĐƠN HÀNG CẦN HỦY:
    [ HD10025 • 350.000 đ (Anh Minh) ]
    [ HD10024 • 120.000 đ (Khách lẻ)  ]
    [ HD10023 • 1.450.000 đ (Chị Lan) ]
    [ ⌨️ Nhập mã đơn khác...         ]
    [ ❌ Hủy thao tác                 ]
    ```
  - Bấm chọn đơn -> Chuyển sang màn hình xác nhận 2 bước:
    - Hiện đầy đủ món, tổng tiền, hình thức thanh toán.
    - Hai nút: `[🔴 Xác nhận Hủy Hoàn Kho]` và `[❌ Bỏ qua]`.
  - Nếu bấm `[⌨️ Nhập mã đơn khác...]` -> Bot chuyển sang chờ user gõ mã đơn.

### 3.6. Nút `[💳 Đổi Thanh Toán]` (1-Chạm)
- **Hành vi:**
  - Bot truy vấn 5 đơn hàng gần nhất tương tự mục 3.5.
  - Người dùng bấm chọn đơn -> Bot hiển thị danh sách các tài khoản thanh toán sẵn có (Tiền mặt, Chuyển khoản Vietcombank, MB Bank, v.v.).
  - Bấm vào tài khoản muốn chuyển -> Bot cập nhật lại `account_id` trong sổ quỹ `cashbook` và thông báo thành công.

---

## 4. Quản Lý Trạng Thái Hội Thoại (Lightweight State Store)
- Dùng một dictionary bộ nhớ: `USER_STATE = {chat_id: {"step": "...", "data": {...}, "timestamp": ...}}`.
- Nếu quá 5 phút không tương tác -> Tự động hủy trạng thái chờ để tránh hiểu nhầm tin nhắn chat thông thường.

---

## 5. Quy Trình Triển Khai
1. Cập nhật `services/telegram_bot.py`:
   - Thêm bộ tạo `MAIN_REPLY_KEYBOARD`.
   - Hàm lấy 5 đơn hàng mới nhất `get_recent_orders(limit=5)`.
   - Xử lý các text tương ứng với 6 nút bấm bàn phím.
   - Thêm callback query cho luồng chọn đơn 1 chạm.
2. Thêm unit test bổ sung vào `tests/test_telegram_chatops.py` để verify trọn vẹn luồng bàn phím và chọn đơn 1-chạm.
3. Rebuild binary `POS_Mastercare.exe` và push git.

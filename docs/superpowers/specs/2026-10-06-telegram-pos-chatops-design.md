# Thiết Kế Chi Tiết: Telegram POS ChatOps & Admin Controller

- **Ngày tạo:** 2026-10-06
- **Trạng thái:** Approved by Owner (Triển khai theo Hướng 1: Background Worker Long-Polling trong FastAPI)

---

## 1. Mục Tiêu Nghiệp Vụ
Cho phép chủ shop / quản lý điều hành POS trực tiếp qua Telegram:
1. **Đăng ký Admin an toàn (Cách B):** User gửi lệnh đăng ký qua Telegram, duyệt 1 chạm trên Web POS, lưu vĩnh viễn không cần duyệt lại.
2. **Hủy hóa đơn từ xa:** Xem tóm tắt đơn kèm xác nhận 2 bước inline keyboard `[🔴 Xác nhận]` / `[❌ Giữ lại]`, hoàn tồn kho hàng, tồn BOM, cân đối sổ quỹ và công nợ.
3. **Cảnh báo hàng hết/sắp hết:** Tra cứu danh sách sản phẩm hết hàng (`stock <= 0`) kèm giá nhập và tồn hiện tại để chủ động lên đơn nhập NCC.
4. **Báo cáo doanh thu tức thì:** Xem nhanh báo cáo hôm nay, hôm qua, tháng này (Doanh thu, tiền mặt, chuyển khoản, công nợ).
5. **Tra cứu danh mục & giá bán báo khách:** Tìm nhanh giá bán lẻ và tồn kho sẵn có qua từ khóa sản phẩm để phản hồi khách hàng ngay trên điện thoại.

---

## 2. Kiến Trúc Kỹ Thuật (Hướng 1: Background Worker)

- **Cơ chế:** Worker `telegram_bot_service.py` chạy thread nền (Long-Polling `getUpdates` qua `httpx` hoặc `urllib/requests`).
- **Khởi động:** Gắn vào `lifespan` hoặc startup event của FastAPI (`main.py`).
- **Ưu điểm:**
  - Không cần mở port hay tạo tunnel webhook ngoài internet.
  - Tự động chạy khi POS mở, đóng gói nguyên vẹn trong file `.exe`.
  - Kết nối trực tiếp cơ sở dữ liệu SQLite thông qua hàm nghiệp vụ có sẵn trong `routers/pos.py` và `database.py`.

---

## 3. Thiết Kế Cơ Sở Dữ Liệu (SQLite Schema)

### 3.1. Bảng `channel_settings` (Cấu hình)
- `key` TEXT PRIMARY KEY (ví dụ: `telegram_bot_token`, `telegram_bot_enabled`)
- `value` TEXT NOT NULL

### 3.2. Bảng `telegram_admins` (Danh sách Admin đã duyệt - Dùng vĩnh viễn)
```sql
CREATE TABLE IF NOT EXISTS telegram_admins (
    chat_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    role TEXT DEFAULT 'admin', -- 'admin', 'manager'
    approved_by TEXT,
    approved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
);
```

### 3.3. Bảng `telegram_admin_requests` (Yêu cầu chờ duyệt trên Web POS)
```sql
CREATE TABLE IF NOT EXISTS telegram_admin_requests (
    chat_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. Đặc Tả Chi Tiết Bộ Lệnh Telegram & Luồng Thao Tác

### 4.1. Đăng ký Admin (`/dangky` hoặc `/register`)
- **Telegram:** User gửi `/dangky`.
- **Bot kiểm tra:**
  - Nếu đã có trong `telegram_admins` và `is_active = 1` -> Trả lời: *"Anh đã là Admin hệ thống rồi ạ."*
  - Nếu chưa có: Lưu bản ghi vào `telegram_admin_requests` với `status = 'pending'`.
  - Phản hồi: *"Đã gửi yêu cầu đăng ký Admin (Chat ID: `{chat_id}`). Vui lòng vào màn hình Cài đặt POS để bấm [Duyệt]."*
- **Web POS:**
  - Trong mục **Cài đặt > Kết nối Telegram** hiển thị danh sách yêu cầu chờ duyệt.
  - Cột: Tên Telegram, Username, Chat ID, Thời gian -> Nút **[Duyệt]** / **[Từ chối]**.
  - Bấm **[Duyệt]**: Chuyển bản ghi sang `telegram_admins`, bot tự động gửi tin nhắn đến Telegram user: *"Yêu cầu Admin của anh đã được duyệt thành công! Anh có thể bắt đầu sử dụng các lệnh điều khiển."*

---

### 4.2. Hủy hóa đơn (`/huyhoadon <Mã_Đơn>`)
- **Quyền:** Chỉ user có trong `telegram_admins` mới thực thi được.
- **Bước 1 (Xem thông tin):**
  - Cú pháp: `/huyhoadon HD10023`
  - Bot truy vấn bảng `orders` và `order_items`.
  - Phản hồi tóm tắt:
    ```text
    ⚠️ XÁC NHẬN HỦY HÓA ĐƠN: HD10023
    - Khách hàng: Anh Minh (0909123456)
    - Tổng tiền: 450,000 đ
    - Thanh toán: Tiền mặt
    - Danh sách món:
      • Hạt Royal Canin x 1 (350,000 đ)
      • Cát vệ sinh x 2 (100,000 đ)

    Anh có chắc chắn muốn hủy đơn này không?
    Kho và sổ quỹ sẽ tự động hoàn trả tương ứng.
    ```
  - Inline Buttons:
    - `[🔴 Xác nhận Hủy]` (callback: `confirm_cancel_HD10023`)
    - `[❌ Bỏ qua]` (callback: `dismiss_cancel`)
- **Bước 2 (Thực thi):**
  - Khi bấm xác nhận: Gọi trực tiếp logic hủy đơn trong POS (`delete_order` core logic):
    - Hoàn lại tồn kho sản phẩm (`products.stock` và `product_inventory`).
    - Hoàn lại định lượng nguyên liệu BOM (`inventory`).
    - Hoàn trả sổ quỹ (`cashbook`).
    - Trừ lại công nợ khách hàng (nếu đơn nợ).
    - Cập nhật/Xóa đơn và ghi log `inventory_logs`.
  - Bot cập nhật tin nhắn: *"Đã hủy hóa đơn HD10023 thành công và hoàn trả kho."*

---

### 4.3. Xem hàng hết để đặt (`/hanghet` hoặc `/canhang`)
- **Quy tắc truy vấn:** Lấy tất cả sản phẩm (`type != 'service'`) có `stock <= 0` hoặc `stock <= min_stock`.
- **Nội dung trả về:**
  ```text
  📦 DANH SÁCH HÀNG HẾT / CẦN ĐẶT (5 món):
  1. Hạt Cat Eye 1.5kg
     - Tồn: 0 gói | Giá nhập gần nhất: 85,000 đ
  2. Súp thưởng Wanpy cá hồi
     - Tồn: -2 gói (bán âm) | Giá nhập: 22,000 đ
  3. Cát Min 8L
     - Tồn: 0 bao | Giá nhập: 48,000 đ
  -----------------------------
  Gợi ý: Anh gõ /ncc <tên_hàng> để xem nhà cung cấp cung cấp món này.
  ```

---

### 4.4. Xem báo cáo doanh thu (`/baocao`)
- **Hiển thị menu nhanh:**
  - Nút inline: `[Hôm nay]` | `[Hôm qua]` | `[Tháng này]`
- **Nội dung mẫu (Hôm nay):**
  ```text
  📊 BÁO CÁO DOANH THU HÔM NAY (06/10/2026)
  - Số lượng đơn: 18 đơn
  - Tổng doanh thu: 5,420,000 đ
  -----------------------------
  Chi tiết hình thức thanh toán:
  - Tiền mặt: 2,100,000 đ
  - Chuyển khoản: 2,820,000 đ
  - Ghi nợ: 500,000 đ
  -----------------------------
  Top món bán chạy:
  1. Combo Grooming Chó Nhỏ (3 lần)
  2. Cát vệ sinh Min 8L (8 bao)
  ```

---

### 4.5. Tra cứu danh mục & giá bán báo khách (`/gia <từ_khóa>` hoặc `/danhmuc`)
- **Tra giá nhanh:** `/gia royal canin`
  - Kết quả:
    ```text
    🔍 KẾT QUẢ TÌM KIẾM CHO: 'royal canin'
    1. Royal Canin Medium Adult 4kg
       - Mã: RC-MED-4KG
       - Giá bán: 560,000 đ
       - Còn hàng: 6 bao
    2. Royal Canin Kitten 2kg
       - Mã: RC-KIT-2KG
       - Giá bán: 390,000 đ
       - Còn hàng: 2 bao
    ```
- **Tra theo danh mục:** `/danhmuc` -> Hiện danh sách nhóm sản phẩm (Thức ăn, Cát, Phụ kiện, Spa) để chọn xem bảng giá.

---

### 4.6. Sửa hình thức thanh toán đơn hàng (`/suathanhtoan <Mã_Đơn>`)
- **Mục đích:** Sửa nhầm từ tiền mặt sang chuyển khoản hoặc ngược lại (cập nhật đúng sổ quỹ `cashbook` và tài khoản thanh toán `payment_accounts`).
- **Luồng thao tác:**
  1. Gõ: `/suathanhtoan HD10023`
  2. Bot hiển thị trạng thái hiện tại:
     ```text
     💳 ĐƠN HÀNG: HD10023 (Tổng: 350,000 đ)
     - Khách hàng: Anh Minh
     - Hình thức hiện tại: Tiền mặt (Quỹ Tiền Mặt)
     
     Chọn hình thức thanh toán mới:
     ```
  3. Inline Buttons danh sách tài khoản:
     - `[💵 Tiền mặt]`
     - `[🏦 Chuyển khoản (Vietcombank)]`
     - `[🏦 Chuyển khoản (MB Bank)]`
     - `[⏳ Ghi nợ khách hàng]`
  4. Bấm chọn -> Bot cập nhật lại phiếu thu trong `cashbook` sang đúng `account_id`, cập nhật công nợ nếu chuyển sang ghi nợ, thông báo: *"Đã đổi hình thức thanh toán đơn HD10023 sang [Chuyển khoản (Vietcombank)]."*

---

## 5. Kế Hoạch Triển Khai Tiếp Theo (Writing Plans)
1. Thêm cấu hình Telegram và 2 bảng `telegram_admins`, `telegram_admin_requests` vào `database.py`.
2. Tạo module `services/telegram_bot.py` xử lý Polling, kiểm tra phân quyền admin, router xử lý các lệnh.
3. Tạo router API `/api/settings/telegram/*` để Web POS:
   - Lưu Token Bot.
   - Lấy danh sách duyệt Admin.
   - Bấm Duyệt / Xóa Admin.
4. Thêm giao diện quản lý Telegram vào màn hình Cài đặt POS (`templates/settings.html` / `static/js/modules/settings.js`).
5. Đăng ký background task khởi động bot trong `main.py`.
6. Viết bộ kiểm thử tự động xác minh toàn bộ luồng.

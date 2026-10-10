# Thiết Kế: Nâng Cấp Toàn Diện Hệ Thống Mẫu In & Popup In Lại Hóa Đơn

- **Ngày phê duyệt:** 2026-10-10
- **Tác giả:** Hermes Agent
- **Người phê duyệt:** Bùi Thiên Phú (Chủ shop)
- **Phương án lựa chọn:** 
  1. Cho phép ẩn/bật mẫu in khỏi quầy thu ngân mà không xóa (`is_active: false`).
  2. Lọc 2 tầng trên Popup In: Tab lọc khổ giấy động (`[Tất cả]`, `[K80]`, `[A4]`, `[A5]`) + Dropdown lọc theo đúng khổ giấy đó.
  3. Khóa kích thước Logo (`max-height: e.h`, `object-fit: contain`) & Lấy thông tin tài khoản chuyển khoản động từ `order.payment_account_id` / `order_payments`.
  4. Mở rộng khả năng tùy biến Canvas: Chiều cao Logo, cỡ chữ, căn lề, bật/tắt cột bảng B2B.

---

## 1. Mục Tiêu & Yêu Cầu

### Yêu cầu 1: Làm gọn danh sách mẫu in (Ẩn mẫu không dùng)
- **Vấn đề**: Các mẫu mặc định hệ thống không xóa được, làm danh sách tại POS và Popup in bị quá dài.
- **Giải pháp**:
  - Thêm cờ `is_active: true/false` vào từng preset mẫu in trong `multiTemplates.presets`.
  - Trong tab Cài Đặt In: Thêm switch toggle `[✓ Hiển thị ở màn hình Bán hàng]`.
  - Tại thanh công cụ POS (`#pos-template-select`) và Popup in: Chỉ hiển thị các mẫu có `is_active !== false`.

### Yêu cầu 2: Bộ lọc khổ giấy động & Dropdown theo khổ (Hướng A)
- **Vấn đề**: Popup in hiện tại có 2 nút cứng K80/A4 dùng chung 1 dropdown, không hỗ trợ A5 và không lọc theo khổ.
- **Giải pháp**:
  - Hàng nút chuyển khổ sinh động: `[Tất cả]`, `[K80]`, `[A4]`, `[A5]` dựa trên các khổ giấy của các mẫu đang active.
  - Khi bấm chọn 1 khổ (ví dụ `[A4]`), dropdown bên cạnh chỉ nạp các mẫu thuộc khổ đó.
  - Tự động nhận diện loại đơn khi mở popup: Khách lẻ $\to$ tab K80, Khách sỉ $\to$ tab A4.

### Yêu cầu 3: Sửa Logo to bất thường & Tài khoản Ngân hàng tự động
- **Logo to**: Giới hạn khung ảnh `max-height: ${e.h || 65}px; max-width: ${e.w || 140}px; object-fit: contain;` ở cả màn hình in thật lẫn Canvas Cài đặt.
- **Tài khoản động**:
  - Truy vấn thông tin `payment_account` gắn với đơn hàng (qua `order.payment_account_id` hoặc từ `order_payments`).
  - Hóa đơn và VietQR trích xuất chính xác Tên NH (`bank_code`), Số TK (`account_number`), Chủ TK (`account_owner`) của tài khoản thực tế thu tiền.
  - Fallback về tài khoản mặc định của shop nếu đơn tiền mặt hoặc đơn cũ chưa gán tài khoản.

### Yêu cầu 4: Nâng cấp tùy biến chi tiết trên Canvas Cài Đặt
- Cột thuộc tính (Sidebar phải) bổ sung các trường điều khiển:
  - Khối Logo: Slider / Input số chiều cao tối đa (`h: 40px - 140px`).
  - Khối Bảng hàng (B2B): Checkbox bật/tắt hiển thị từng cột (`show_code`, `show_unit`, `show_discount`, `show_note`).

---

## 2. Kế Hoạch Kiểm Thử
1. Test ẩn mẫu: Tắt switch 1 mẫu trong Cài đặt $\to$ Mẫu đó biến mất khỏi POS bar và Popup in.
2. Test tab khổ giấy: Bấm `[A4]` $\to$ Dropdown chỉ có các mẫu A4; Bấm `[K80]` $\to$ Dropdown chỉ có các mẫu K80.
3. Test Logo: Logo không vượt quá chiều cao quy định, không đè lên chữ.
4. Test Tài khoản ngân hàng: Đơn hàng thanh toán bằng tài khoản ngân hàng nào thì hiển thị đúng số TK và VietQR của ngân hàng đó.

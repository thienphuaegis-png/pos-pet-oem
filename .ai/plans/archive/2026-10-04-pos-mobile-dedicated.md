# Kế Hoạch Triển Khai: POS Mobile Chuyên Dụng (/pos/m)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Xây dựng màn hình bán hàng chuyên biệt cho điện thoại `/pos/m` (Touch-First, nút 44px, không tràn ngang, thanh toán trượt Bottom Sheet) và tự động nhận diện thiết bị khi vào `/pos`.

---

## File Structure

| File | Responsibility |
|---|---|
| `routers/orders.py` hoặc `server.py` | Thêm route `GET /pos/m` trả về template `pos_mobile.html`. Bổ sung nhận diện mobile để redirect nếu cần. |
| `templates/pos_mobile.html` | Template giao diện Touch-First chuyên dụng: Header gọn, search to, danh mục cuộn ngang, danh sách món touch card, floating cart bar, modal/sheet thanh toán. |
| `static/js/pos_mobile.js` | Logic bán hàng độc lập, dùng chung API `/api/products`, `/api/contacts`, `/api/orders`. Không phụ thuộc vào CSS hay DOM của desktop. |
| `templates/pos.html` | Thêm script nhận diện tự động: Nếu màn hình `< 768px` tự động chuyển sang `/pos/m` (có nút chọn chuyển qua lại). |
| `tests/test_pos_mobile_dedicated.py` | Kiểm thử endpoint `/pos/m`, cấu trúc DOM và tính tương thích API. |

---

## Các Bước Triển Khai (Tasks)

### Task 1: Route Backend & Template Shell
- Tạo `templates/pos_mobile.html` với đầy đủ meta viewport, Tailwind CSS, font mobile chuẩn 14-16px, chống tràn `overflow-x-hidden`.
- Thêm route `GET /pos/m` vào `server.py`.
- Thêm script nhận diện trên `templates/pos.html`: nếu mở bằng mobile (`window.innerWidth < 768` và chưa chọn ép Desktop) thì redirect sang `/pos/m`.

### Task 2: Giao Diện Chọn Món & Giỏ Hàng Touch
- Xây dựng `static/js/pos_mobile.js`:
  - Tải dữ liệu từ `/api/products` và `/api/contacts`.
  - Tìm kiếm thời gian thực + lọc theo phân loại (Spa, Thức ăn, Cát, Phụ kiện).
  - Thẻ món rộng rãi với nút `+` to 44px.
  - Floating Cart Dock ghim đáy: hiện số món, tổng tiền, nút mở thanh toán.
  - Full-screen Cart Sheet: xem chi tiết, chỉnh số lượng `+`/`-`, xóa món, chọn khách hàng, chọn tiền mặt / chuyển khoản VietQR.

### Task 3: API Tạo Đơn & In Hóa Đơn
- Kết nối `POST /api/orders` hoàn tất đơn hàng và trừ kho, tính doanh thu.
- Hỗ trợ in hóa đơn hoặc tải hóa đơn ảnh/QR.

### Task 4: Kiểm Thử & Rebuild Executable
- Viết test tự động `tests/test_pos_mobile_dedicated.py`.
- Rebuild file thực thi `POS_Mastercare.exe` để máy client pull về chạy được ngay.

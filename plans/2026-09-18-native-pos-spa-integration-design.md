# Thiết Kế: Nhúng Màn Hình Bán Hàng POS Trực Tiếp Vào SPA & Tái Cấu Trúc Thứ Tự Menu

## 1. Bối Cảnh & Mục Tiêu
- Hiện tại, màn hình POS bán hàng chuyên dụng (`templates/pos.html` + `static/js/pos.js`) đang chạy ở route độc lập `/pos`. Việc mở cửa sổ riêng gây bất tiện cho nhân viên khi phải nhảy qua lại giữa Bán Hàng và Dịch Vụ Spa thú cưng.
- Mục tiêu:
  1. Tích hợp trực tiếp toàn bộ giao diện và logic hiện đại của màn hình POS vào thẻ `<div id="tab-pos">` của trang quản trị chính (`templates/index.html`).
  2. Tối ưu viewport tràn viền khi ở tab POS: gỡ bỏ padding lề `p-6` và chế độ cuộn trang kép, chiếm trọn 100% chiều cao màn hình (`h-screen overflow-hidden`).
  3. Đổi thứ tự menu sidebar: **🛒 Bán Hàng (POS)** $\to$ **🐾 Dịch Vụ & Thú Cưng** $\to$ **🧾 Hóa Đơn** $\to$ các tab quản trị còn lại.
  4. Ngăn ngừa xung đột biến toàn cục giữa `app.js` và `pos.js` bằng cách tái sử dụng state chung và bao đóng module bán hàng.
  5. Giữ nguyên trạng thái giỏ hàng khi chuyển đổi qua lại giữa POS và Dịch Vụ.

---

## 2. Thiết Kế Kiến Trúc & Bố Cục Viewport

### 2.1. Cấu Trúc Menu Sidebar (`templates/index.html`)
Thứ tự các nút trên thanh điều hướng sidebar:
1. `🛒 Bán Hàng (POS)` (`data-tab="pos"`, active mặc định khi tải trang)
2. `🐾 Dịch Vụ & Thú Cưng` (`data-tab="pet-services"`)
3. `🧾 Hóa Đơn` (`data-tab="orders"`)
4. `🏷️ Bảng Giá` (`data-tab="price-lists"`)
5. `📦 Hàng Hóa & Kho` (`data-tab="inventory"`)
6. `📥 Nhập Hàng` (`data-tab="purchases"`)
7. `🏭 Gia Công OEM` (`data-tab="oem"`)
8. `👥 Khách Hàng & Đối Tác` (`data-tab="contacts"`)
9. `💰 Sổ Quỹ Thu Chi` (`data-tab="cashbook"`)
10. `📊 Dòng Tiền & Nợ NCC` (`data-tab="cashflow-debts"`)
11. `📈 Báo Cáo Tổng Hợp` (`data-tab="reports"`)
12. `⚙️ Cài Đặt Hệ Thống` (`data-tab="settings"`)

### 2.2. Điều Phối Container Nội Dung (`#main-content-area`)
- Container chính bọc các tab: `<div id="main-content-area" class="flex-1 overflow-y-auto p-6">`
- Khi `tabId === 'pos'`:
  - Thêm class `p-0 overflow-hidden` và gỡ bỏ `p-6 overflow-y-auto`.
  - Tab `#tab-pos` hiển thị `flex flex-col h-screen overflow-hidden bg-slate-100`.
- Khi `tabId !== 'pos'`:
  - Phục hồi lại class `p-6 overflow-y-auto` và gỡ bỏ `p-0 overflow-hidden`.
  - Khóa tạm thời các phím tắt POS (F1, F3, F4, F9).

### 2.3. Cấu Trúc Bên Trong `<div id="tab-pos">`
Thay thế đoạn code 58 dòng thô sơ hiện tại bằng cấu trúc đầy đủ của `templates/pos.html`:
- **Header POS (Cao 56px - `h-14`)**:
  - Ô tìm kiếm hàng hóa `F3` kèm dropdown nổi hiển thị tồn kho và đơn giá.
  - Thanh danh sách hóa đơn đa tab (`invoice-tabs-bar`) kèm nút `+` thêm hóa đơn (`F1`).
  - Đồng hồ thời gian thực, nút tải lại (F5), bộ chọn Mẫu in hóa đơn (A4 B2B, K80, K58, A5), bộ chọn Thu ngân/Nhân viên.
- **Thân POS (Chiếm trọn chiều cao còn lại - `flex-1 flex overflow-hidden`)**:
  - **Cột Trái (65% width)**: Bảng giỏ hàng chuẩn 12 cột (Xóa, STT, Mã hàng, Tên sản phẩm, ĐVT, Bộ nút tăng giảm `[-] [SL] [+]`, Đơn giá, Thành tiền). Chân bảng có ô ghi chú và tóm tắt số lượng món.
  - **Cột Phải (35% width, 380px - 420px)**:
    - Tìm kiếm và chọn Khách Hàng (mặc định Khách lẻ).
    - Tóm tắt thanh toán: Tổng tiền hàng, Giảm giá (VND/%), Khách cần trả (font to nổi bật).
    - Ô nhập tiền khách đưa kèm dải nút chọn nhanh mệnh giá tiền mặt.
    - Tiền thừa / Nợ lại.
    - Nút `IN TẠM TÍNH (HÓA ĐƠN MẪU)` và nút lớn `THANH TOÁN (F9)`.

---

## 3. Thiết Kế Logic JavaScript & Ngăn Chặn Xung Đột State

### 3.1. Phân Định Trách Nhiệm File
- `app.js`: Giữ vai trò nạp dữ liệu nền tảng (`allProducts`, `allContacts`, `allStaff`, `currentSettings`), điều hướng `switchTab`, và xử lý các module quản trị (Kho, Đơn hàng, PO, OEM, Sổ quỹ, Cài đặt).
- `pos.js`: Chuyển đổi thành module bán hàng chuyên dụng:
  - Tái sử dụng mảng dữ liệu đã fetch từ `app.js` nếu đã có sẵn, hoặc fetch bù nếu cần.
  - Quản lý trạng thái đa giỏ hàng (`invoiceTabs`, `activeTabId`).
  - Lắng nghe sự kiện bàn phím: Chỉ bắt sự kiện `F1, F3, F4, F9, Enter` khi thẻ `#tab-pos` đang active (không có class `hidden`).
  - Xử lý in ấn và thanh toán: Gửi `POST /api/orders`, mở modal in đồng bộ theo preset đang chọn trên thanh công cụ POS.

### 3.2. Đồng Bộ Hóa Khi Chuyển Tab
- Khi thu ngân bấm sang tab `🐾 Dịch Vụ & Thú Cưng`: Giỏ hàng POS của từng tab hóa đơn vẫn giữ nguyên vẹn trong biến `invoiceTabs`.
- Khi quay lại tab `🛒 Bán Hàng (POS)`: Giao diện giỏ hàng tự động render lại đúng tab hóa đơn đang thao tác dở dang, con trỏ tự focus về ô tìm kiếm `F3`.

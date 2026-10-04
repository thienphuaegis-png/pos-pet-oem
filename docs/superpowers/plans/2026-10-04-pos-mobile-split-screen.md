# POS Mobile Split-Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Chuyển đổi giao diện bán hàng `templates/pos.html` sang mô hình Split-Screen 40/60 tối ưu cho màn hình điện thoại di động (< 768px), giữ nguyên 100% bố cục và phím tắt trên Desktop.

**Architecture:** Sử dụng Tailwind responsive utility classes (`flex-col md:flex-row`, `h-[38vh] md:h-full`, `hidden md:flex`) để chia 2 tầng trên mobile (Tầng 1: Giỏ hàng trực tiếp; Tầng 2: Tìm kiếm & Lưới sản phẩm chạm nhanh; Chân trang: Sticky Bottom Bar tổng tiền & thanh toán). Tận dụng toàn bộ hàm JS hiện có trong `static/js/pos.js`.

**Tech Stack:** HTML5, Tailwind CSS, Vanilla JS, FastAPI/Jinja2 templates.

---

## File Structure

| File | Responsibility |
|---|---|
| `templates/pos.html:142-321` | Tái cấu trúc layout container: Flex-col trên Mobile, Flex-row trên Desktop. Thêm lưới sản phẩm chạm nhanh cho mobile. |
| `static/js/pos.js:621-675` | Tối ưu hóa render dòng giỏ hàng: dùng CSS grid/flex responsive cho mobile (không bị tràn 8 cột cố định). |
| `static/css/pos_custom.css` (hoặc inline `<style>` trong `templates/pos.html`) | Media queries bổ trợ cho thanh cuộn êm ái và touch target >= 36px. |

---

## Tasks

### Task 1: Responsive Layout Shell (Mobile Split-Screen 40/60)
**Files:**
- Modify: `templates/pos.html:80-143` (Header gọn cho mobile)
- Modify: `templates/pos.html:144-180` (Tầng trên: Giỏ hàng h-[38vh] md:h-full)
- Modify: `templates/pos.html:181-321` (Sidebar thanh toán thành Bottom Sheet / Drawer trên Mobile)

- [ ] **Step 1: Thu gọn Header trên Mobile**
  - Giữ lại ô tìm kiếm, icon giỏ hàng và nút quay về Quản lý trên mobile.
  - Ẩn bớt đồng hồ, chọn mẫu in và chọn nhân viên vào menu phụ trên màn hình nhỏ (< md).

- [ ] **Step 2: Cấu trúc Tầng 1 (Giỏ Hàng)**
  - Đặt chiều cao `h-[38vh] md:h-full` có `overflow-y-auto` riêng.
  - Đảm bảo ID `#cart-items-container` không thay đổi.

- [ ] **Step 3: Cấu trúc Tầng 2 (Chọn Món Nhanh cho Mobile)**
  - Tích hợp ô tìm kiếm, barcode scanner và lưới sản phẩm chạm nhanh (Quick Catalog Grid).
  - Nhân viên chỉ cần chạm vào thẻ sản phẩm là tự gọi hàm `addItemToCart()` đã có.

- [ ] **Step 4: Chân trang cố định (Sticky Bottom Action Bar)**
  - Hiển thị trên mobile (`flex md:hidden`), ghim đáy: Tổng tiền cần trả + Nút "Thanh Toán".
  - Chạm "Thanh Toán" mở Sheet chi tiết thanh toán (khách đưa, tiền thừa, VietQR).

---

### Task 2: Responsive Cart Item Row (Tránh tràn ngang trên điện thoại)
**Files:**
- Modify: `static/js/pos.js:621-675` (render dòng giỏ hàng)

- [ ] **Step 1: Thay thế grid cố định 8 cột bằng Responsive Grid**
  - Trên màn hình nhỏ (< 640px): Dòng giỏ hàng hiển thị dạng 2 hàng tinh gọn (Hàng 1: Tên món + Nút xóa; Hàng 2: Bộ nút `[-] [SL] [+]` + Đơn giá + Thành tiền).
  - Trên màn hình desktop (>= 640px / md): Giữ nguyên 8 cột như hiện tại.

- [ ] **Step 2: Nút bấm tối thiểu 36px cho thao tác ngón tay**
  - Nút `+`, `-`, nút xóa có vùng chạm rộng rãi, không bị ấn nhầm.

---

### Task 3: Bottom Sheet Thanh Toán & Khách Hàng Trên Mobile
**Files:**
- Modify: `templates/pos.html:181-321`
- Modify: `static/js/pos.js` (Thêm hàm togglePaymentSheet cho mobile)

- [ ] **Step 1: Bọc sidebar thanh toán thành Drawer/Sheet trên mobile**
  - Desktop: Giữ nguyên sidebar cố định bên phải (`w-96 lg:w-[410px]`).
  - Mobile: Trượt mượt từ dưới lên (Bottom Sheet) khi bấm nút "Thanh Toán" ở chân trang.

- [ ] **Step 2: Kiểm tra tương tác đầy đủ trên mobile viewport (390px)**
  - Kiểm tra thêm món, sửa số lượng, đổi khách, quét QR, thanh toán hoàn tất.

# Thiết Kế Giao Diện Bán Hàng Mobile (Split-Screen 40/60)

- **Ngày:** 2026-10-04
- **Màn hình mục tiêu:** `templates/pos.html` (Màn hình bán hàng thu ngân)
- **Phương án lựa chọn:** Phương án 1 (Split-Screen 40/60: Nửa trên Giỏ hàng trực tiếp, Nửa dưới Danh mục & Chọn món).

---

## 1. Vấn đề cần giải quyết
- Màn hình desktop hiện tại dùng bố cục 3 cột (`Giỏ hàng (trái) - Danh sách món (giữa) - Thanh toán (phải)`).
- Khi xem trên điện thoại:
  - Các cột bị tràn ngang hoặc co rúm làm biến dạng bảng giỏ hàng.
  - Sử dụng popup/drawer che toàn bộ danh sách sản phẩm khiến thu ngân không thể vừa chọn món vừa kiểm tra số lượng và tổng tiền theo thời gian thực.

## 2. Giải pháp kỹ thuật (Phương án 1: Split Screen)

### Breakpoint phân định
- Mobile (`< 768px` / dưới `md`): Bố cục dọc chia 2 tầng (40% trên - 60% dưới).
- Desktop/Tablet (`>= 768px` / từ `md` trở lên): Giữ nguyên 100% bố cục 3 cột hiện tại.

### Cấu trúc Mobile (< md):
1. **Nửa trên (Tầng 1 - Chiều cao ~38vh đến 42vh): Giỏ hàng Live**
   - Tiêu đề gọn: "Giỏ hàng (X món)" + nút xóa nhanh.
   - Danh sách món cuộn dọc độc lập:
     - Tên món + phân loại.
     - Bộ nút tăng giảm số lượng `[-] [SL] [+]` và nút xóa `✕` tối thiểu 36x36px dễ bấm ngón tay.
     - Đơn giá và thành tiền hiển thị font mono rõ ràng.
2. **Thanh phân cách & Điều hướng nhanh:**
   - Dải ngăn mỏng hiển thị phân loại và ô tìm kiếm/quét mã barcode.
3. **Nửa dưới (Tầng 2 - flex-1 cuộn dọc độc lập): Chọn món & Dịch vụ**
   - Thanh tìm kiếm + Nút quét mã vạch (Barcode camera).
   - Thanh danh mục cuộn ngang (Spa, Cắt tỉa, Thức ăn, Phụ kiện, Cát...).
   - Lưới sản phẩm 2 cột (`grid-cols-2`): Thẻ chạm to, bấm vào thẻ là thêm ngay vào tầng 1 phía trên mà không che khuất màn hình.
4. **Chân trang dính cố định (Sticky Bottom Bar - 56px):**
   - Bên trái: Tổng tiền thanh toán to rõ (`font-mono font-black text-indigo-600`).
   - Bên phải: Nút "Thanh Toán" (màu xanh emerald) mở modal thanh toán (VietQR động / Tiền mặt).

---

## 3. Ràng buộc & Tương thích
- **YAGNI & Tối giản code:** Không viết lại logic Javascript bán hàng. Các hàm `renderCart()`, `addItem()`, `updateQty()` và các ID DOM `#cart-items-container`, `#total-pay` giữ nguyên cấu trúc để tận dụng toàn bộ logic sẵn có.
- Chỉ dùng các class Tailwind CSS (`flex-col md:flex-row`, `h-[40vh] md:h-full`, `hidden md:block`) để chuyển đổi tự nhiên giữa Mobile và Desktop.

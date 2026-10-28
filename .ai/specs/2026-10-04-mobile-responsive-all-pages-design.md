# Thiết Kế Tối Ưu Giao Diện Toàn Bộ Hệ Thống Trên Điện Thoại (Mobile Responsive All Pages)

- **Ngày:** 2026-10-04
- **Màn hình mục tiêu:** `templates/index.html` (Toàn bộ trang quản trị, dashboard, bảng biểu, danh mục, sổ quỹ, cài đặt).
- **Phương án lựa chọn:** Bottom Bar 5 nút chuẩn App Mobile + Off-canvas Sidebar Drawer + Auto Responsive Tables & Modals.

---

## 1. Cấu Trúc Điều Hướng (Navigation)

### 1.1 Bottom Bar Cố Định (Chỉ hiện trên Mobile `< md`)
Thanh điều hướng cố định chân trang (`h-14 bg-white border-t border-slate-200 z-40`):
1. **🛒 Bán Hàng:** Chuyển sang tab POS hoặc mở `/pos`.
2. **📋 Đơn Hàng:** Chuyển sang tab `orders`.
3. **🐱 Dịch Vụ:** Chuyển sang tab `pet-services`.
4. **👥 Khách Hàng:** Chuyển sang tab `contacts`.
5. **☰ Menu Khác:** Mở drawer danh mục đầy đủ (Hotel, Bảng giá, Kho hàng, Sổ quỹ, Nhân viên, Cài đặt).

### 1.2 Sidebar Drawer (Off-canvas trên Mobile)
- Trên Desktop (`>= md`): Giữ nguyên `#main-sidebar` cố định 240px.
- Trên Mobile (`< md`): `#main-sidebar` ẩn mặc định. Khi bấm "☰ Menu Khác" ở Bottom Bar, Sidebar trượt từ bên trái ra (`fixed inset-y-0 left-0 z-50`) kèm lớp phủ tối màu (backdrop). Bấm ra ngoài hoặc chọn xong 1 tab thì tự đóng drawer.

---

## 2. Tối Ưu Bảng Biểu & Nội Dung (Tables & Cards)

### 2.1 Tránh Bị Che Khuất Bởi Bottom Bar
- Thêm padding đáy `pb-16 md:pb-4` vào nội dung chính để các dòng cuối bảng không bị thanh Bottom Bar đè lên.

### 2.2 Cuộn Ngang Mượt Mà Cho Mọi Bảng Dữ Liệu
- CSS toàn cục cho các bảng trên mobile: tự động bọc trong container `overflow-x-auto` với `-webkit-overflow-scrolling: touch;`.

### 2.3 Modal / Popup Co Giãn Tự Động
- Mọi modal trên điện thoại tự động co giãn `w-full max-w-[calc(100vw-16px)] max-h-[92vh] mx-2 my-auto rounded-2xl` thay vì các class cứng `w-[800px]`, `w-[900px]`.

---

## 3. Ràng Buộc & Tính Tương Thích
- Không phá vỡ bất kỳ ID hay hàm Javascript quản lý tab hiện tại (`switchTab()`, `renderOrders()`, `renderContacts()`).
- Tự động active icon trên Bottom Bar tương ứng với tab đang mở.

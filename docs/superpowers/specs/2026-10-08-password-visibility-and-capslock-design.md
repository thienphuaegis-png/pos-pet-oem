# Thiết Kế: Xem Mật Khẩu & Tự Động Cảnh Báo Caps Lock (Mẫu 3)

- **Ngày phê duyệt:** 2026-10-08
- **Tác giả:** Hermes Agent
- **Người phê duyệt:** Bùi Thiên Phú (Chủ quán)
- **Phương án lựa chọn:** Mẫu 3 — Icon mắt + Nút Xem/Ẩn + Tự động phát hiện & cảnh báo Caps Lock.

---

## 1. Mục Tiêu & Phạm Vi (Scope)

1. **Hiển thị mật khẩu khi cần:** Cho phép người dùng bấm nút xem/ẩn mật khẩu ở ô nhập liệu để kiểm tra đã gõ đúng hay chưa, tránh tình trạng gõ nhầm rồi đăng nhập thất bại.
2. **Cảnh báo Caps Lock tự động:** Khi người dùng đang bật phím `Caps Lock`, hệ thống lập tức hiển thị dòng nhắc nhở `⚠️ Chú ý: Đang bật Caps Lock (viết hoa)` ngay dưới ô mật khẩu, giúp nhân viên nhận biết ngay lý do gõ sai.
3. **Phạm vi áp dụng:**
   - Màn hình Đăng nhập chính (`#login-password`).
   - Màn hình Đổi mật khẩu lần đầu (`#force-pwd-old`, `#force-pwd-new`).
   - Modal Thêm/Sửa tài khoản nhân viên (`#staff-password`).

---

## 2. Thiết Kế Chi Tiết Giao Diện & Tương Tác

### A. Cấu Trúc DOM Input Wrapper
Ô mật khẩu được bọc trong container `position: relative` (hoặc Tailwind `relative flex items-center`):
```html
<div class="relative flex items-center">
    <input id="login-password" type="password" placeholder="••••••••" autocomplete="current-password"
        class="w-full pr-16 ..." 
        onkeyup="checkPasswordCapsLock(event, 'login-caps-warn')"
        onkeydown="checkPasswordCapsLock(event, 'login-caps-warn')">
    <button type="button" onclick="togglePasswordVisibility('login-password', this)"
        class="absolute right-2 px-2 py-1 rounded text-xs text-slate-500 hover:text-sky-600 hover:bg-slate-100 flex items-center gap-1 transition"
        title="Xem/Ẩn mật khẩu">
        <svg class="w-4 h-4" ...><!-- Icon mắt --></svg>
        <span class="pwd-label text-[11px] font-semibold">Xem</span>
    </button>
</div>
<div id="login-caps-warn" class="hidden text-amber-600 text-xs font-semibold mt-1 flex items-center gap-1">
    <span>⚠️</span> <span>Chú ý: Đang bật Caps Lock (viết hoa)</span>
</div>
```

### B. Logic Điều Khiển JS (`static/js/auth.js`)
1. **`togglePasswordVisibility(inputId, btnEl)`**:
   - Nếu `input.type === 'password'`: chuyển sang `text`, đổi icon mắt mở và chữ thành `"Ẩn"`, thêm class active màu xanh sky.
   - Nếu `input.type === 'text'`: chuyển về `password`, đổi icon mắt gạch chéo và chữ thành `"Xem"`.
2. **`checkPasswordCapsLock(e, warnId)`**:
   - Kiểm tra `e.getModifierState && e.getModifierState("CapsLock")`.
   - Nếu `true`: gỡ bỏ class `hidden` của `#login-caps-warn`.
   - Nếu `false`: thêm lại class `hidden`.
   - Sự kiện `blur`: tự động ẩn cảnh báo để giao diện sạch sẽ.

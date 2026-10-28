# Design Spec: Tailwind UI Design Tokens & POS Screen Modernization

## 1. Mục tiêu
- Thiết lập hệ thống Tailwind UI component classes thống nhất cho toàn bộ hệ thống POS PetCare.
- Nâng cấp màn hình Bán Hàng (POS) (`#tab-pos`) cùng Sidebar Footer sang chuẩn Tailwind UI hiện đại:
  - Bỏ toàn bộ Unicode emoji thô sơ, thay bằng Lucide SVG vector sắc nét.
  - Sử dụng card chuẩn Tailwind UI (`bg-white rounded-2xl border border-slate-200/80 shadow-xs ring-1 ring-slate-900/5`).
  - Sử dụng input & button chuẩn Tailwind UI (`ring-1 ring-inset ring-slate-300`, `focus:ring-2 focus:ring-sky-600`).
  - Đảm bảo 100% offline, không chạm vào logic ID hoặc event listener của Javascript.

## 2. Hệ Thống Design Tokens (CSS Layer trong `<style>`)
- `.tui-card`: Khối card nổi trắng, bo góc `rounded-2xl`, viền mờ `border-slate-200/80`, bóng mờ `shadow-xs ring-1 ring-slate-900/5`.
- `.tui-input`: Input form viền `ring-1 ring-inset ring-slate-300`, placeholder `text-slate-400`, focus viền xanh `ring-sky-600`.
- `.tui-btn-primary`: Button chính màu `bg-sky-600 hover:bg-sky-500 active:scale-[0.98] text-white shadow-xs font-semibold`.
- `.tui-btn-secondary`: Button phụ màu `bg-white hover:bg-slate-50 text-slate-900 ring-1 ring-inset ring-slate-300 shadow-xs`.
- `.tui-badge`: Nhãn badge nhỏ gọn `px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset`.

## 3. Nâng cấp Giao diện Màn hình Bán Hàng (POS - `#tab-pos`)
1. **Top Navigation Header:**
   - Ô tìm kiếm: Thay emoji `🔍` & `📷` bằng Lucide `search` và `barcode` / `scan` SVG.
   - Nút Refresh: Dùng Lucide `rotate-cw` SVG.
   - Nút Chọn mẫu in: Thay `🖨️` bằng Lucide `printer` SVG.
   - Nhân viên: Thay `👤` bằng Lucide `user` SVG.
   - Nút Hóa đơn: Thay `🧾` bằng Lucide `receipt` SVG.
2. **Khu vực Giỏ hàng (Left & Center):**
   - Header bảng giỏ hàng: Căn chỉnh chữ hoa mảnh (`text-[11px] font-semibold text-slate-500 uppercase tracking-wider`).
   - Ô ghi chú đơn: Thay `✏️` bằng Lucide `file-text` SVG.
   - Giao diện giỏ hàng trống trong `static/js/pos.js`: Thay `🛒` bằng Lucide `shopping-bag` SVG.
   - Nút xóa từng dòng sản phẩm trong `static/js/pos.js`: Thay `🗑️` bằng Lucide `trash-2` SVG.
3. **Khu vực Thanh toán & Khách hàng (Right Aside):**
   - Khối khách hàng: Thay `👤` bằng Lucide `user` SVG.
   - Thẻ điểm & Lịch sử: Thay `🏆` & `📜` bằng Lucide `award` & `history` SVG.
   - Nút In tạm tính: Dùng Lucide `file-text` SVG, style `tui-btn-secondary` viền vàng amber.
   - Nút Thanh toán: Nút lớn full-width màu `bg-sky-600 hover:bg-sky-500` nổi bật với icon Lucide `credit-card` SVG.

## 4. Nâng cấp Sidebar Footer
- Thay thế `▶` (Mở ca) bằng Lucide `play` SVG.
- Thay thế `⏹` (Kết ca) bằng Lucide `square` SVG.
- Thay thế `🧮` (Đếm tiền) bằng Lucide `calculator` SVG.
- Thay thế `🚪` (Đăng xuất) bằng Lucide `log-out` SVG.

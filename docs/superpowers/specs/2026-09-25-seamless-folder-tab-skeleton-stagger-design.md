# Seamless Folder Tab, Skeleton Shimmer & Staggered Render Design

## 1. Overview & Objective
Nâng cấp trải nghiệm chuyển tab và nạp dữ liệu trên giao diện POS PetCare:
- **Liền mạch (Folder Tab Effect):** Tab đang chọn trong sidebar nối liền không ngắt quãng với vùng nội dung chính (`bg-slate-100` hoặc `bg-slate-50`), loại bỏ viền phải và thêm vạch nhấn `sky-600` ở mép trái.
- **Khung xương tải dữ liệu (Skeleton Shimmer):** Ngay khi bấm tab, vùng bảng/danh sách hiển thị ngay lập tức 4-5 dòng khung xương xám lướt sóng (`animate-pulse`) trong lúc chờ API trả về, loại bỏ hoàn toàn cảm giác đơ/chậm.
- **Hiệu ứng thác nước từng dòng (Staggered Waterfall Fade-in):** Khi nạp dữ liệu xong, các dòng `<tr>` trượt nhẹ lên theo hiệu ứng thác nước với độ trễ vi mô (`calc(var(--i) * 35ms)`), tạo cảm giác mượt mà và sinh động.
- **Chuyển tab mượt (Tab Cross-fade):** Vùng nội dung tab mới lướt nhẹ vào (`opacity` và `translateY(4px)`) trong 0.2s thay vì bật tắt nhấp nháy 0ms.

## 2. Technical Details & CSS Architecture

### A. Folder Tab Seamless Styling
```css
/* Sidebar item active nối liền khối nội dung */
#main-sidebar .tab-btn.active-tab {
    background-color: #f1f5f9 !important; /* slate-100 trùng màu nền main-content */
    color: #0284c7 !important; /* sky-600 */
    font-weight: 700 !important;
    border-radius: 0.75rem 0 0 0.75rem !important; /* Bo góc trái, phẳng mép phải nối sang main */
    margin-right: -1px !important; /* Phủ lên đường border-r của sidebar */
    position: relative;
    border-left: 4px solid #0284c7 !important; /* Vạch nhấn sắc nét */
    box-shadow: -2px 1px 4px rgba(0,0,0,0.03);
    z-index: 10;
}
#main-sidebar.collapsed .tab-btn.active-tab {
    border-radius: 0.75rem !important;
    margin-right: 0 !important;
    border-left-width: 0 !important;
}
```

### B. Skeleton Shimmer Table Placeholder
Tạo tiện ích `renderTableSkeleton(tbodyElement, rows = 5, cols = 8)`:
- Chèn các dòng giả lập với thanh xám bo góc có hiệu ứng `animate-pulse bg-slate-200/70`.
- Tự động gọi ngay trong `switchTab()` trước khi hàm `fetch` bất đồng bộ hoàn tất.

### C. Staggered Waterfall Render
- Thêm class `.stagger-row` vào CSS:
```css
.stagger-row {
    animation: staggerFadeInUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(var(--row-idx, 0) * 35ms);
}
@keyframes staggerFadeInUp {
    from {
        opacity: 0;
        transform: translateY(6px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```
- Khi render bảng (Nhập hàng `renderPurchasesTable`, Thú cưng `renderPetServicesTable`...), mỗi dòng `<tr>` tự động nhận style `style="--row-idx: ${idx};"` và class `stagger-row`.

### D. Tab Smooth Transition
- Mỗi thẻ `<div id="tab-xxx">` có class `.tab-pane-content`:
```css
.tab-pane-content {
    animation: tabFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes tabFadeIn {
    from {
        opacity: 0.4;
        transform: translateY(4px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

## 3. Success Verification
- Bấm chuyển qua lại giữa các tab (POS, Dịch vụ & Thú cưng, Nhập hàng, v.v.):
  1. Tab active đổi nền `bg-slate-100` trùng màu nền chính, nối liền mép sang phải.
  2. Bảng hiện ngay Skeleton placeholder trong 0ms.
  3. Dữ liệu thật đổ về trượt nhẹ nhàng từng dòng.
- 100% test runtime `test_spa_render.js` và backend `pytest` PASS.

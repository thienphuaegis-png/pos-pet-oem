# Floating Card-Row Flow & GPU-Accelerated Stagger Animation Design

## 1. Overview & Objective
Nâng cấp hiển thị danh sách dòng dữ liệu trong các bảng nghiệp vụ (Nhập hàng, Spa & Thú cưng, Khách hàng...):
- Biến mỗi dòng `<tr>` thành một **chiếc thẻ Card vật lý độc lập**:
  - Tách rời các dòng bằng `border-collapse: separate; border-spacing: 0 8px;`.
  - Nền thẻ màu trắng (`bg-white`), bo góc mềm mại ở 2 đầu hàng (`rounded-l-xl`, `rounded-r-xl`).
  - Viền mờ (`border-slate-200/80`), đổ bóng nhẹ nổi lên (`shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all`).
- **Hiệu ứng trượt vật lý tăng tốc phần cứng (GPU-Accelerated 3D Slide):**
  - Sử dụng `transform: translate3d(0, 24px, 0) scale(0.98)` mờ dần thành `translate3d(0, 0, 0) scale(1)`.
  - Kích hoạt `will-change: transform, opacity` và đường cong chuyển động mượt mà `cubic-bezier(0.16, 1, 0.3, 1)`.
  - Stagger delay đẩy từng thẻ lướt lên nối đuôi nhau cách nhau 35ms.

## 2. Technical Strategy
1. **CSS Floating Table & Card Rows:**
   - Class `.table-floating-cards`:
     ```css
     .table-floating-cards {
         border-collapse: separate !important;
         border-spacing: 0 8px !important;
     }
     .table-floating-cards thead th {
         border: none !important;
         background: transparent !important;
         padding-bottom: 4px;
     }
     .table-floating-cards tr.card-row td {
         background-color: #ffffff;
         border-top: 1px solid #e2e8f0;
         border-bottom: 1px solid #e2e8f0;
         transition: all 0.2s ease;
     }
     .table-floating-cards tr.card-row td:first-child {
         border-left: 1px solid #e2e8f0;
         border-top-left-radius: 0.75rem;
         border-bottom-left-radius: 0.75rem;
     }
     .table-floating-cards tr.card-row td:last-child {
         border-right: 1px solid #e2e8f0;
         border-top-right-radius: 0.75rem;
         border-bottom-right-radius: 0.75rem;
     }
     .table-floating-cards tr.card-row:hover td {
         background-color: #f8fafc;
         border-color: #cbd5e1;
     }
     ```
2. **Animation Keyframes:**
   ```css
   @keyframes cardRowSlideUp {
       0% {
           opacity: 0;
           transform: translate3d(0, 24px, 0) scale(0.98);
       }
       100% {
           opacity: 1;
           transform: translate3d(0, 0, 0) scale(1);
       }
   }
   .card-row-anim {
       animation: cardRowSlideUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
       animation-delay: calc(var(--row-idx, 0) * 35ms);
       will-change: transform, opacity;
   }
   ```
3. **Skeleton Cards:**
   - Khung xương cũng hiển thị dưới dạng các thẻ bo tròn nổi rời rạc 8px với gradient ánh bạc.

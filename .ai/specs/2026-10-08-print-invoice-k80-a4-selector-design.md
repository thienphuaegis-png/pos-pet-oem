# Thiết Kế: Bộ Chọn Khổ In K80 / A4 Linh Hoạt Trên Hóa Đơn Bán Hàng & Danh Sách Đơn

- **Ngày phê duyệt:** 2026-10-08
- **Tác giả:** Hermes Agent
- **Người phê duyệt:** Bùi Thiên Phú (Chủ shop)
- **Phương án lựa chọn:** Phương án 1 — Thanh chuyển đổi khổ in 1 chạm trên Modal Xem Trước & Tự động nhận diện Khách lẻ (K80) vs Đại lý (A4).

---

## 1. Mục Tiêu & Phạm Vi (Scope)

1. Tự động nhận diện loại khách hàng khi in hóa đơn:
   - **Khách lẻ**: Mặc định chọn khổ in **K80** (mẫu hóa đơn nhiệt nhỏ gọn cho máy in bill quầy).
   - **Khách Đại lý / Bán sỉ**: Mặc định chọn khổ in **A4 B2B** (mẫu hóa đơn đại lý có đầy đủ bảng 9 cột, thông tin ngân hàng, VietQR và 3 chữ ký).
2. Thêm thanh chuyển đổi khổ in 1 chạm ngay trên Modal Xem Trước & In (`#print-modal`):
   - Nút `[🧾 K80 (Khách Lẻ)]` và `[📄 A4 (Đại Lý)]`.
   - Bấm chuyển đổi thì lập tức re-render bản in sang khổ tương ứng (0ms), không cần tải lại trang hay vào phần cài đặt.
3. Áp dụng đồng bộ cho cả:
   - Màn hình Bán hàng POS (`templates/pos.html`, `templates/index.html`).
   - Màn hình Danh sách hóa đơn (`tab-orders` - khi bấm nút `🖨️ In` lại hóa đơn).

---

## 2. Kiến Trúc Kỹ Thuật (Architecture)

### A. Frontend DOM (`templates/index.html` & `templates/pos.html`)
Thêm thanh chuyển đổi vào header của `#print-modal`:
```html
<div class="print-mode-selector inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 gap-1 text-xs">
    <button type="button" id="btn-print-k80" onclick="switchModalPrintSize('K80')" class="px-2.5 py-1 rounded-md font-bold text-slate-700 transition flex items-center gap-1">
        <span>🧾</span> <span>K80 (Khách Lẻ)</span>
    </button>
    <button type="button" id="btn-print-a4" onclick="switchModalPrintSize('A4')" class="px-2.5 py-1 rounded-md font-semibold text-slate-500 transition flex items-center gap-1">
        <span>📄</span> <span>A4 (Đại Lý)</span>
    </button>
</div>
```

### B. Logic Điều Phối In (`static/js/pos.js` & `static/js/modules/productions.js`)
1. Hàm `isWholesaleOrder(ord)`:
   - Kiểm tra `ord.is_wholesale`, `ord.customer_name` có chứa các từ khóa ("đại lý", "dai ly", "sỉ", "si "), hoặc có `customer_price_list_name`, hoặc có item chứa `price_list_name`.
2. Khi gọi `showPrintModal(orderCode)` / `printDraftOrder()`:
   - Xác định khổ mặc định: Nếu `isWholesaleOrder(ord)` $\rightarrow$ Chọn preset A4 (`a4_b2b` hoặc `A4-portrait`). Ngược lại $\rightarrow$ Chọn preset K80 (`k80_default` hoặc `K80`).
   - Lưu trữ `window.currentLoadedPrintOrder = ord` để khi bấm chuyển khổ thì render lại tức thì.
   - Cập nhật style nút active trên thanh chuyển đổi.
3. Hàm `switchModalPrintSize(size)`:
   - Chuyển `posPrintConfig.active_preset` sang mẫu tương ứng với `size` ('K80' hoặc 'A4').
   - Gọi `renderAndPrint(window.currentLoadedPrintOrder, window.currentPrintIsDraft)` để cập nhật preview và css `@page size`.

# Thiết Kế: Bộ Chọn Mẫu In Đa Dạng (Hybrid) Trên Modal Xem Trước & In Hóa Đơn

- **Ngày phê duyệt:** 2026-10-10
- **Tác giả:** Hermes Agent
- **Người phê duyệt:** Bùi Thiên Phú (Chủ shop)
- **Phương án lựa chọn:** Phương án 2 — Hybrid: Kết hợp 2 nút bấm nhanh (K80 Khách Lẻ / A4 Đại Lý) + Dropdown Select nạp động toàn bộ mẫu in POS có trong hệ thống.

---

## 1. Vấn Đề & Mục Tiêu

### Vấn đề hiện tại:
- Modal xem trước & in hóa đơn (`#print-modal`) chỉ có 2 nút cứng: `[🧾 K80 (Khách Lẻ)]` và `[📄 A4 (Đại Lý)]`.
- Khi người dùng tạo thêm các mẫu in khác trong phần Cài đặt (ví dụ: *K80 Tiết Kiệm*, *K58 Mini*, *A4 Dọc*, *A5 Bàn Giao*, hoặc các mẫu tùy biến riêng), người dùng không thể chọn các mẫu này khi xem trước hoặc in lại hóa đơn.

### Mục tiêu giải pháp:
1. Giữ nguyên 2 nút bấm nhanh `K80` và `A4` cho thao tác thường ngày tại quầy thu ngân (chiếm 90% lượt dùng).
2. Thêm một dropdown danh sách mẫu in (`#modal-print-preset-select`) ngay cạnh 2 nút bấm trên thanh tiêu đề của `#print-modal`.
3. Tự động nạp toàn bộ các preset mẫu in thuộc nhóm POS từ cấu hình `posPrintConfig.presets`.
4. Cơ chế đồng bộ hai chiều (Two-way sync):
   - Khi bấm nút `K80` hoặc `A4`: Dropdown tự động nhảy theo mẫu tương ứng.
   - Khi chọn một mẫu bất kỳ từ Dropdown:
     - Giao diện xem trước render lại ngay lập tức (0ms).
     - Nút K80/A4 tự động cập nhật trạng thái active nếu mẫu thuộc khổ K80 hoặc A4; nếu chọn mẫu khác (A5, K58...) thì cả 2 nút về trạng thái trung tính.
     - Đồng bộ lại dropdown trên thanh POS bar (`#pos-template-select`).

---

## 2. Kiến Trúc Giao Diện (UI / DOM)

### A. Vị trí trên Modal (`templates/index.html` và `templates/pos.html`)
Khu vực tiêu đề của `#print-modal`:
```html
<div class="flex items-center gap-2">
    <div class="print-mode-selector inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 gap-1 text-xs">
        <button type="button" id="btn-print-modal-k80" onclick="switchModalPrintSize('K80')" class="px-2.5 py-1 rounded-md font-bold transition flex items-center gap-1 cursor-pointer">
            <span>🧾</span> <span>K80 (Khách Lẻ)</span>
        </button>
        <button type="button" id="btn-print-modal-a4" onclick="switchModalPrintSize('A4')" class="px-2.5 py-1 rounded-md font-semibold transition flex items-center gap-1 cursor-pointer">
            <span>📄</span> <span>A4 (Đại Lý)</span>
        </button>
    </div>
    <select id="modal-print-preset-select" onchange="changeModalPrintPreset(this.value)" class="text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-1 bg-white text-slate-700 shadow-xs focus:ring-1 focus:ring-sky-500 focus:outline-none max-w-[220px] truncate cursor-pointer">
        <!-- Nạp động qua JS -->
    </select>
</div>
```

---

## 3. Kiến Trúc Xử Lý Logic (JavaScript)

### A. Hàm nạp danh sách mẫu (`populateModalPrintPresets`)
- Quét qua `posPrintConfig.presets` (hoặc `multiTemplates.presets`).
- Lọc các preset thuộc `category === 'pos'` (hoặc preset bán hàng).
- Tạo các thẻ `<option>` với nhãn chuẩn: `${preset.name} [${shortPaperSize}]${boldTag}`.
- Đặt `value` tương ứng với `presetKey`.
- Đặt `selected` cho preset đang active.

### B. Hàm chuyển mẫu từ dropdown (`changeModalPrintPreset(presetKey)`)
- Kiểm tra tính hợp lệ của `presetKey` trong danh sách presets.
- Gán `posPrintConfig.active_preset = presetKey`.
- Cập nhật trạng thái hiển thị của 2 nút bấm K80 / A4 dựa vào `paper_size`:
  - Khổ `K80` $\rightarrow$ highlight nút K80.
  - Khổ `A4` hoặc `A4-landscape` / `A4-portrait` $\rightarrow$ highlight nút A4.
  - Khổ khác (`K58`, `A5`...) $\rightarrow$ đưa cả 2 nút về style bình thường (neutral).
- Đồng bộ dropdown `#pos-template-select` trên thanh công cụ POS (nếu tồn tại).
- Gọi hàm re-render `renderAndPrint(window.currentLoadedPrintOrder, !!window.currentPrintIsDraft)` để hiển thị tức thì 0ms.

### C. Đồng bộ khi bấm nút K80 / A4 (`switchModalPrintSize`)
- Ngoài việc chuyển đổi preset và đổi style nút K80/A4 như hiện tại, cập nhật thêm giá trị của `#modal-print-preset-select` trỏ đúng vào `targetPreset`.

### D. Đồng bộ khi mở modal (`showPrintModal` và `printDraftOrder`)
- Khi mở modal in, gọi `populateModalPrintPresets(activePresetKey)` để dropdown luôn có đầy đủ danh sách mới nhất và chọn đúng preset đang áp dụng cho đơn hàng đó.

---

## 4. Kế Hoạch Kiểm Thử (Verification Plan)
1. Kiểm tra DOM trên `templates/index.html` và `templates/pos.html` có đầy đủ `#modal-print-preset-select`.
2. Kiểm tra khi mở modal in đơn lẻ (`showPrintModal`), dropdown nạp đủ các mẫu K80, A4, K58, A5...
3. Kiểm tra khi click nút K80 / A4: dropdown đồng bộ chọn đúng mẫu tương ứng.
4. Kiểm tra khi chọn mẫu khác từ dropdown: preview tự cập nhật đúng khổ giấy và template tương ứng.
5. Chạy test suite `pytest` để đảm bảo không gãy bất kỳ test in ấn hiện hữu nào.

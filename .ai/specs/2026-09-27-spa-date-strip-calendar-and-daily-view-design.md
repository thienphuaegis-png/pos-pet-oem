# Thiết Kế Chi Tiết: Thanh Lịch Dải Ngày (Date Strip) & Hiển Thị Trọn Vẹn Ca Spa Trong Ngày

- **Ngày tạo:** 2026-09-27
- **Tác giả:** Hermes (Nous Research) & Bùi Thiên Phú
- **Trạng thái:** Đã duyệt thiết kế (Approved - Hướng 1)
- **Module:** POS Offline PetCare - Module Dịch Vụ Spa (`static/js/modules/spa.js`, `templates/index.html`)

---

## 1. Mục Tiêu & Yêu Cầu Nghiệp Vụ

1. **Hiển thị trọn vẹn ca trong ngày (Hôm nay):**
   - Bảng điều phối Spa hiển thị **toàn bộ các ca của ngày hôm nay** (không ẩn ca đã về như bản thử nghiệm trước).
   - Bao gồm:
     - Các ca chưa về: `⏳ Chờ Làm` (`pending`), `🔄 Đang Làm` (`in_progress`), `✅ Đã Xong (Chờ Đón)` (`completed`).
     - Các ca đã về trong ngày: `🏠 Đã Về` (`checked_out` có `ticket_date` là hôm nay).
   - Nhận diện trực quan: Dòng ca đã về có viền xanh lá (`border-l-4 border-l-emerald-500`), badge xanh lá `🏠 Đã Về`, nút in Bill nhanh `🧾 Bill`.

2. **Cụm lọc nhanh trạng thái hôm nay (Quick Filter Pills):**
   - Đặt ngay trên bảng để nhân viên chuyển chế độ nhìn 1 chạm:
     - `⚡ Tất Cả Trong Ngày (N)`: Hiển thị trọn vẹn 100% ca trong ngày.
     - `⏳ Chưa Về (X)`: Chỉ lọc ca nhân viên đang và cần xử lý (Pending, In Progress, Completed).
     - `🏠 Đã Về (Y)`: Lọc riêng các ca đã hoàn tất trả bé trong ngày.

3. **Dải Lịch Ngang 7 Ngày (Date Strip) & Bộ Chọn Ngày:**
   - Đặt ngay trên cùng của View Bảng Spa (`#pet-sub-view-services`).
   - Hiển thị dải các ngày quanh ngày hôm nay (từ 2 ngày trước đến 4 ngày sau).
   - Mỗi nút ngày gồm: Thứ (T2, T3...), Ngày/Tháng (27/09), và số lượng ca (`N ca`).
   - Thẻ hôm nay được làm nổi bật với màu tím tím thương hiệu (`bg-purple-700 text-white font-black`).
   - Click ngày bất kỳ -> Bảng Spa tức thì tải ca của ngày đó (0ms client-side filter từ mảng `allPetServiceTickets`).
   - Kèm nút `input type="date"` nhỏ gọn để tra cứu ngày xa bất kỳ ngoài dải 7 ngày.

---

## 2. Thiết Kế Giao Diện & Component HTML

### 2.1. Container Date Strip & Bộ Lọc Trạng Thái (`templates/index.html`)

Đặt tại đầu `#pet-sub-view-services`:

```html
<!-- DẢI LỊCH NGANG (DATE STRIP) -->
<div class="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-2">
        <span class="text-xs font-bold text-slate-600 flex items-center gap-1">
            <i class="fa-regular fa-calendar-days text-purple-600"></i> Lịch Ngày:
        </span>
        <div id="spa-date-strip-container" class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <!-- Render động bằng JS: 7 ngày quanh hôm nay -->
        </div>
    </div>

    <!-- Chọn ngày tự do -->
    <div class="flex items-center gap-2">
        <div class="flex items-center bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-2xs">
            <span class="text-xs text-slate-500 mr-1.5 font-medium">📅 Ngày khác:</span>
            <input type="date" id="input-spa-custom-date" onchange="selectSpaStripDate(this.value)" class="text-xs font-bold text-slate-700 outline-none bg-transparent cursor-pointer">
        </div>
        <button onclick="selectSpaStripDate('today')" class="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-purple-100 text-purple-800 hover:bg-purple-200 transition">
            Về Hôm Nay
        </button>
    </div>
</div>

<!-- THANH CÔNG CỤ & LỌC NHANH TRONG NGÀY -->
<div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
    <div class="flex items-center gap-2">
        <span class="text-xs font-bold text-slate-700">Lọc ca:</span>
        <div class="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
            <button onclick="setSpaDailyQuickFilter('all')" id="btn-spa-filter-daily-all" class="px-3 py-1.5 font-bold rounded-md bg-purple-700 text-white shadow-xs">
                ⚡ Tất Cả (<span id="count-daily-all">0</span>)
            </button>
            <button onclick="setSpaDailyQuickFilter('not_checked_out')" id="btn-spa-filter-daily-unreturned" class="px-3 py-1.5 font-medium text-slate-600 hover:text-slate-900 rounded-md">
                ⏳ Chưa Về (<span id="count-daily-unreturned">0</span>)
            </button>
            <button onclick="setSpaDailyQuickFilter('checked_out')" id="btn-spa-filter-daily-returned" class="px-3 py-1.5 font-medium text-slate-600 hover:text-slate-900 rounded-md">
                🏠 Đã Về (<span id="count-daily-returned">0</span>)
            </button>
        </div>
    </div>
    ...
</div>
```

---

## 3. Thiết Kế Logic JavaScript (`static/js/modules/spa.js`)

1. **Biến trạng thái mới:**
   - `petServiceDailyQuickFilter = 'all';` (`'all' | 'not_checked_out' | 'checked_out'`)
   - `petServiceSelectedStripDate = 'today';` (`'today' | 'YYYY-MM-DD'`)

2. **Hàm dựng Dải Ngày `renderSpaDateStrip()`:**
   - Lấy ngày hôm nay làm mốc (theo múi giờ địa phương Việt Nam `Asia/Ho_Chi_Minh`).
   - Sinh mảng 7 ngày: từ `today - 2 ngày` đến `today + 4 ngày`.
   - Tính toán số ca thực tế của từng ngày từ mảng `allPetServiceTickets`.
   - Render HTML các button ngày với nhãn Thứ (Thứ 2..Chủ Nhật), Ngày/Tháng (27/09), số lượng ca (`X ca`).

3. **Cập nhật logic bộ lọc `renderPetServicesTable()`:**
   ```javascript
   let filtered = allPetServiceTickets.filter(t => {
       // 1. Lọc theo ngày chọn trên Date Strip (mặc định 'today')
       const targetDate = (petServiceSelectedStripDate === 'today') ? todayStr : petServiceSelectedStripDate;
       if (t.ticket_date && t.ticket_date !== targetDate) return false;

       // 2. Lọc theo Quick Filter trong ngày:
       if (petServiceDailyQuickFilter === 'not_checked_out') {
           if (t.status === 'checked_out') return false;
       } else if (petServiceDailyQuickFilter === 'checked_out') {
           if (t.status !== 'checked_out') return false;
       }
       // Nếu là 'all' thì giữ nguyên cả chưa về lẫn đã về!

       // 3. Lọc theo status dropdown / KPI / từ khóa tìm kiếm
       ...
       return true;
   });
   ```

4. **Trình bày dòng bảng (`tr`):**
   - Nếu `t.status === 'checked_out'`:
     - Class: `bg-emerald-50/40 hover:bg-emerald-50/70 border-l-4 border-l-emerald-500`
     - Cột trạng thái: `<span class="bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full text-[11px] border border-emerald-300">🏠 Đã Về</span>`
     - Cột thao tác: Hiện nút `🧾 Bill` (in bill K80) + `↩️ Mở lại` + `🗑️ Xóa`.

---

## 4. Kế Hoạch Kiểm Thử (Verification Plan)

1. **Test Tách Biệt & Đầy Đủ Trong Ngày:**
   - Mock ca có status `pending`, `in_progress`, `completed`, `checked_out` cùng ngày `2026-09-27`.
   - Khi chọn `⚡ Tất Cả Trong Ngày`: Bảng phải hiển thị đủ cả 4 ca.
   - Khi chọn `⏳ Chưa Về`: Bảng chỉ hiển thị 3 ca (`pending`, `in_progress`, `completed`), không chứa ca `checked_out`.
   - Khi chọn `🏠 Đã Về`: Bảng chỉ hiển thị 1 ca `checked_out`.
2. **Test Chuyển Ngày Trên Date Strip:**
   - Bấm vào ngày `28/09`: Bảng tự động hiển thị danh sách ca đặt hẹn ngày 28/09.
   - Bấm quay lại `Hôm nay`: Bảng quay về ngày 27/09.
3. **Chạy test suite tự động:**
   - Chạy `node tests/test_spa_render.js` và toàn bộ pytest kiểm tra integrity.

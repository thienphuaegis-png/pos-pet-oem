# Kế Hoạch Đại Tu Giao Diện Chuẩn Elaya Anti-Slop (`templates/index.html` & `templates/pos.html`)

**Trạng thái:** [x] ĐÃ HOÀN THÀNH & PASS TEST (`tests/test_ui_elaya_anti_slop_7fixes.py`)

---

## 1. Bảng Phát Hiện Lỗi Ngầm & Ràng Buộc Test Khi Sửa Giao Diện

| Lỗi ngầm / Ràng buộc nếu sửa mù | Hậu quả thực tế | Vị trí `file:line` | Cách xử lý an toàn |
|---|---|---|---|
| Xóa `<svg viewBox>` trong `.sidebar-icon` để thay bằng `<i class="ph ...">` | Gãy test `test_sidebar_lucide_badge_icons` (bắt buộc 20 nút `.tab-btn` phải có `span.sidebar-icon > svg[viewBox]`) | `tests/test_html_integrity.py:50-60` | Giữ cấu trúc `<span class="sidebar-icon"><svg viewBox="...">`, đổi toàn bộ sang `currentColor` đồng nhất |
| Xóa `border-l-4 border-l-emerald-500` trong `static/js/modules/spa.js` | Gãy test `test_spa_table_call_and_paid_row.py` | `tests/test_spa_table_call_and_paid_row.py:38` | Chỉ khử `border-l-4` trên `templates/index.html` & `templates/pos.html`, giữ nguyên chuỗi trong `spa.js` |
| Dùng CDN Phosphor Icons thuần (`unpkg.com`) không có bản local | Khi chạy offline hoặc đóng gói `POS_Mastercare.exe` không có mạng sẽ mất toàn bộ icon | `templates/index.html`, `templates/pos.html` | Tải CSS + Webfont Phosphor lưu local tại `static/vendor/phosphor/` |
| Đổi `html { font-size: 17px; }` nhưng quên đồng bộ `initAppZoom()` | Hàm `initAppZoom()` đang tính `(saved / 100 * 16) + 'px'`, làm lệch tỉ lệ giữa lúc mới mở trang (17px) và lúc bấm zoom (16px) | `templates/index.html:13`, `static/js/app.js:4556` | Khóa `html { font-size: 16px; }` đồng bộ 100% với `initAppZoom()` |
| Đổi bố cục Bento Báo Cáo làm mất ID thẻ DOM | `reports_analytics.js` gọi `setTxt`/`setHtml` trên 20 ID (`rep-kv-*`, `rep-kpi-*`) sẽ không hiển thị số liệu | `static/js/modules/reports_analytics.js:367-390` | Giữ nguyên 100% 20 ID DOM bên trong bố cục Bento 2 cột (`1.35fr 1fr`) |

---

## 2. Bản Đồ Ánh Xạ 7 Hạng Mục Khử AI Slop (Data & Token Mapping)

| # | Hạng mục | Hiện trạng trong code (`Before`) | Chuẩn Elaya Anti-Slop (`After`) | Vị trí `file:line` |
|---|---|---|---|---|
| **1** | **Sidebar 14 màu cầu vồng** | 20 nút `.tab-btn` dùng 14 cặp `bg-*-100 text-*-600/700` khác nhau; `POS_NAV_GROUPS` tô màu từng nhóm | Dùng `currentColor` đồng nhất (`text-slate-600`, nền trong suốt); chỉ tô màu mục đang chọn (`.active-tab`: `bg-slate-100 text-sky-600`) | `templates/index.html:264-297`, `1033-1155`, `static/js/app.js:4657` |
| **2** | **Viền lệch `border-left: 4px` & tai thỏ lõm** | `.tab-btn.active-tab` dùng `border-left: 4px solid #0284c7` + `::before`/`::after` tai thỏ lõm; 22 thẻ KPI dùng `border-l-4` | Xóa `::before`/`::after` tai thỏ lõm; dùng viền phẳng 4 cạnh `1px solid #e2e8f0` (`border border-slate-200 rounded-lg`) chuẩn Elaya B4 | `templates/index.html:330-430`, `3666-3706`, `4686-4716`, `6003-6018`, `6702-6718`, `7048-7063` |
| **3** | **Gradient tím-hồng & chữ nghiêng Tab AI** | Header `#tab-ai-agent` dùng `bg-gradient-to-r from-purple-50 via-slate-50 to-indigo-50`; 49 chỗ gradient tím-hồng; `#ai-staff-briefing-text` dùng `<em>` & 43 chỗ `italic` | Đổi sang bề mặt phẳng `bg-white border border-slate-200`; nút chính đồng bộ 1 màu accent; bỏ toàn bộ `<em>` và `italic` | `templates/index.html:9860-9992`, `3124`, `5691`, `5711`, `5867`, `6330`, `8279`, `static/js/modules/ai_agent.js:539` |
| **4** | **Root `17px` & `font-black` (900)** | `html { font-size: 17px; }`; 152 chỗ `font-black` + 23 chỗ `font-extrabold` ở `index.html`, 8 chỗ ở `pos.html`; cỡ chữ lẻ `text-[9px]`/`10px`/`11px` | `html { font-size: 16px; font-variant-numeric: tabular-nums; }`; hạ toàn bộ `font-black`/`font-extrabold` về max `font-bold` (700); khóa bậc Tailwind (`12/14/16/18/24/36px`) | `templates/index.html:13` + toàn bộ `templates/index.html` & `templates/pos.html` |
| **5** | **Bo góc đồng tâm (Concentric Radius)** | Khung ngoài `rounded-2xl` (16px) hoặc `rounded-xl` (12px) + khung trong cũng `rounded-xl` (12px) gây cộm góc | Chuẩn hóa `R_in = R_out - gap`: Khung ngoài `rounded-2xl` (`16px`) + đệm `p-2` (`8px`) → khung trong `rounded-lg` (`8px`) | `templates/index.html:88-99`, `#tab-reports`, `#tab-ai-agent`, `#pos-payment-sidebar` (`pos.html:270-399`) |
| **6** | **Thay toàn bộ Emoji sang Phosphor Icons** | 22 emoji trong `pos.html` (`🔍`, `📷`, `🖨️`, `🧾`, `💰`...) và 666 emoji trong `index.html` | Đồng bộ 100% sang bộ icon Phosphor nét đơn (`<i class="ph ph-...">`) lưu local offline | Toàn bộ `templates/pos.html` & `templates/index.html` |
| **7** | **Phá bố cục 3 cột đều nhau ở Báo Cáo** | 6 thẻ KPI chia 2 hàng × 3 cột đều nhau (`grid-cols-1 md:grid-cols-3`) | Gom thành **Bento 2 cột bất đối xứng (`1.35fr 1fr`)**: Cột trái lấy **Doanh thu thuần** (`#rep-kpi-revenue`, `36px`) làm tâm điểm + Gross/Trả hàng; Cột phải gồm **Lợi nhuận gộp** (`#rep-kv-profit`) + Giá vốn/Số hóa đơn | `templates/index.html:6580-6698` |

---

## 3. Ma Trận Tác Động Sự Kiện (Event Impact Matrix)

1. **Trigger (UI/DOM):** Không thay đổi tên hàm `onclick`/`oninput`/`onchange` hoặc `id`/`data-tab` của bất kỳ nút/ô nhập nào.
2. **Entity State:** Trạng thái `.active-tab` trên `#sidebar-nav` và các biến KPI động (`rep-kv-*`, `ai-kpi-*`, `pos-final-amount-display`) giữ nguyên cơ chế cập nhật qua JS.
3. **Ledger / Financial:** Không chạm vào logic tính tiền, sổ quỹ, công nợ.
4. **Stock / Debt:** Không chạm vào logic tồn kho, BOM, phiếu nhập.
5. **Reversal & Siblings:** Đồng bộ cả `templates/index.html` (bao gồm tab POS nhúng), `templates/pos.html` (màn hình POS độc lập), và `static/js/modules/ai_agent.js` (chỗ sinh `<em>` động).

---

## 4. Câu Hỏi Cần Anh Chốt

- **Phạm vi thay Emoji & `font-black`:** Anh muốn áp dụng cả 7 quy tắc này **toàn diện trên toàn bộ các tab của `templates/index.html` & `templates/pos.html`** (kể cả thay toàn bộ 666 emoji bằng Phosphor Icons local offline + hạ toàn bộ 157 chỗ `font-black` xuống `font-bold`), hay chỉ áp dụng trước cho **Sidebar + Tab POS + Tab AI + Tab Báo Cáo**?
  - **(a) Toàn bộ tất cả các tab trong `templates/index.html` & `templates/pos.html` + cài Phosphor Icons offline (Đề xuất)**
  - **(b) Chỉ áp dụng cho Sidebar, Tab POS, Tab AI và Tab Báo Cáo trước**
  - **Đáp án:** (chờ anh)

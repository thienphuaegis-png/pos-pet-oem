# Kiểm Toán Cơ Chế Đọc/Ghi Dữ Liệu & Các Tác Vụ Đang Quét Lặp Nhiều Lần

**Ngày kiểm toán:** 2026-11-06  
**Trạng thái:** HOÀN TẤT TRIỂN KHAI CẢ 5 MỤC & ĐÃ KIỂM THỬ (PASS 100%)

---

## 1. Toàn Cảnh Luồng Đọc & Ghi Hiện Tại

1. **Luồng Tải Giao Diện (`/static/*`):** Trình duyệt $\to$ **Vercel Edge CDN (`hkg1` Hong Kong)** $\to$ trả thẳng JS/CSS có cache (`0.4s–1.5s`), không chạm máy chủ tiệm.
2. **Luồng Đọc Dữ Liệu (`GET /api/*`):** Trình duyệt $\to$ Vercel Proxy (`hkg1`, nén `gzip`) $\to$ **Tailscale Funnel** (băng thông miễn phí ~`25–40 KB/s`) $\to$ FastAPI (`main.py`) $\to$ **SQLite WAL** (`data/pos.db` cổng `8998` / `data/pos_instance2.db` cổng `8997`).
   - Xác thực JWT cache vào `request.state._authenticated_user` (`dependencies.py:27`) nên mỗi request chỉ đọc bảng `staff` 1 lần.
3. **Luồng Ghi Dữ Liệu (`POST / PUT / DELETE /api/*`):**
   - Ghi vào `pos.db` ở chế độ **`WAL` (`Write-Ahead Logging`)** + `busy_timeout = 30000ms` (`database.py:634-635`) $\to$ **Đọc không chặn Ghi, Ghi không chặn Đọc**, thời gian ghi 1 đơn hàng tại SQLite chỉ **2–8ms**.
   - Middleware `activity_logger.py:15-42` đẩy log kiểm toán vào `queue.Queue(2000)` chạy trên luồng nền riêng nên không làm chậm thao tác lưu đơn của thu ngân.

---

## 2. Kết Quả Đo Thực Nghiệm (`EXPLAIN QUERY PLAN` trên 15.000 đơn, 45.000 dòng hàng, 13.000 khách, 800 SP)

| # | Tác vụ đang quét lặp / nghẽn | Vị trí `file:line` | Bằng chứng `EXPLAIN QUERY PLAN` & Số đo | Hậu quả thực tế & Cách triệt tiêu |
|---|---|---|---|---|
| **1** | **Tải nguyên bảng 13.000 Khách Hàng (`~4,8 MB` JSON) không phân trang** | `static/js/modules/contacts.js:197`<br>`static/js/modules/spa.js:4077, 4897`<br>`static/js/modules/productions.js:11133`<br>`static/js/app.js:5185` | `13.000` khách + `JOIN pets` sinh **`4.943.784 bytes` (~4,8 MB JSON)**; qua đường hầm Funnel ~35 KB/s tốn **15–35 giây** (nén) / **137s** (thô). | Mở tab **Khách Hàng**, **Tạo Phiếu Spa**, hoặc **Dòng Tiền & Nợ NCC** (chỉ cần NCC nhưng kéo luôn 13.000 khách lẻ!) bị đơ rất lâu.<br>$\to$ **Sửa:** Đổi Dòng Tiền sang `?type=supplier`, Spa sang tìm kiếm động `?type=customer&compact=1&limit=30`, Tab Khách Hàng phân trang tại server (`page`, `limit=50`). |
| **2** | **Hàm `datetime(created_at, '+7 hours')` trong `WHERE` phá vỡ Index, quét toàn bảng 5–10 lần/lượt** | `routers/cashbook.py:1035, 1052, 1150, 1228, 1259`<br>`services/commission.py:217, 227, 259, 270`<br>`routers/hrm.py:1566, 1901` | `SCAN oi` + 45.000 PK lookups mất **`55.19ms/câu`**. Đổi sang `created_at BETWEEN datetime(?, '-7 hours') AND ...` dùng `COVERING INDEX` chỉ còn **`4.72ms/câu` (nhanh gấp 11,7 lần)**. | Mở **Báo Cáo Tổng Hợp** chạy `_calc_period` 2 lần = **10 lần quét sạch bảng `orders` & `order_items`**; mở **HRM Hoa Hồng / Tính Lương** quét toàn bảng `orders` **5 lần**.<br>$\to$ **Sửa:** Chuyển `-7 hours` sang vế tham số `?` để ăn thẳng Index `idx_orders_created_at`. |
| **3** | **Quét lồng nhau $O(P \times I)$ trong `/api/products` + tải lặp ở 7 màn hình** | `routers/products.py:47-51`<br>`static/js/app.js:3488, 3759, 4148, 5290`<br>`static/js/modules/productions.js:8`<br>`static/js/modules/spa.js:4185, 4545` | `SCAN p \| CORRELATED SCALAR SUBQUERY \| SCAN i` (`800 SP x 150 NL = 120.000` vòng quét lồng nhau mất `26.6ms` mỗi lần gọi). | Gọi `/api/products` lặp lại mỗi lần chuyển sang Tồn kho, Sản xuất, Spa, Cài đặt...<br>$\to$ **Sửa:** Tách `NOT IN` 2 tập `code`/`name` có sẵn (1 lượt quét `<1ms`) + dùng chung cache `window.getSharedProducts()` (chỉ reload khi có thêm/sửa/bán hàng). |
| **4** | **Kiểm tra Schema + Backfill + Vòng lặp $N+1$ trên MỌI request KOC / HRM** | `services/koc_service.py:54-190, 1318-1330`<br>`routers/marketplace.py:1739-1740`<br>`services/hrm_schema.py:42`<br>`services/commission.py:85, 192, 233` | Mỗi request KOC chạy lại 3 `CREATE TABLE`, 2 `PRAGMA`, 3 `CREATE INDEX` + 1 `SELECT` backfill toàn bảng `koc_videos`; `list_koc_profiles` chạy $2 \times N$ subquery `LOWER(...)`; `list_sources_summary` chạy $2 \times M$ câu SQL trong vòng `for`. | Bấm duyệt KPI 10 bài = chạy kiểm tra schema & quét `koc_videos` **20 lần**; xem DS 165 KOC = quét `koc_videos` **330 lần**.<br>$\to$ **Sửa:** Gắn cờ `_SCHEMA_INITIALIZED_DBS` theo đường dẫn DB (chỉ chạy 1 lần lúc mở DB) + gộp `list_sources_summary` & `list_koc_profiles` thành `GROUP BY` 1 lượt. |
| **5** | **Bắn log thao tác UI mỗi 2 giây qua đường hầm (`clientlog.js`)** | `static/js/clientlog.js:22` | `setInterval(flush, 2000)` gọi `POST /api/client-log` liên tục mỗi 2s khi có click/phím. | Nhiều máy mở trình duyệt cùng lúc sẽ bắn hàng chục request/phút qua Vercel $\to$ Funnel làm nghẽn băng thông các lệnh chính.<br>$\to$ **Sửa:** Giãn chu kỳ gom lô lên `10–15s` (hoặc gửi ngay khi có lỗi `JS_ERROR` / `HTTP_5xx` / đóng tab). |

---

## 3. Quyết Định Của Anh (`clarify`)

| # | Câu hỏi | Đáp án đã chốt |
|---|---|---|
| **1** | Anh muốn dừng ở báo cáo chẩn đoán hay cho em tối ưu luôn các điểm quét lặp này? | **Tối ưu triệt để cả 5 điểm quét lặp luôn** (`1a` — đã triển khai & pass test_db_io_anti_rescan.py) |

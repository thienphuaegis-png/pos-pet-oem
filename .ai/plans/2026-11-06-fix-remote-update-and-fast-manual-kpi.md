# Chẩn Đoán & Thiết Kế: Sửa Đứng Cửa Sổ Cập Nhật Từ Xa + Thao Tác Duyệt Tay KPI Tức Thì

**Ngày:** 2026-11-06  
**Trạng thái:** ĐÃ CHỐT CLARIFY (1a, 2a) — CHỜ ANH DUYỆT ĐỂ CODE  
**Phạm vi:** `server.py`, `deploy/CAP_NHAT.bat`, `CAP_NHAT.bat`, `scripts/auto_update_runner.py` (hoặc `deploy/CAP_NHAT.bat`), `routers/marketplace.py`, `templates/index.html`, `static/js/modules/marketplace.js`, `static/js/app.js`

---

## 1. Bằng Chứng Thực Tế: Tại Sao Anh Đã Chạy Cập Nhật Mà Chưa Thấy Chỗ Tính KPI Bằng Tay?

Đã kiểm tra trực tiếp phản hồi sống từ máy chủ tiệm qua `https://mcarepet.vercel.app/api/version`, `https://petnt.vercel.app/api/version` và `/openapi.json`:

| Kiểm tra trực tiếp trên máy chủ tiệm | Kết quả trả về thực tế | Ý nghĩa |
|---|---|---|
| `GET /api/version` (`mcarepet` & `petnt`) | `version: "v3.6.113"`, `commit_hash: "69220a5"` | Máy chủ tiệm **vẫn đang kẹt ở bản hôm qua (05/11)**, **CHƯA** lên bản `3a67c51` vừa đẩy! |
| `GET /openapi.json` (`KocVideoUpdateRequest`) | Chỉ có `views, status, product_note` (thiếu `manual_kpi`) | Tiến trình Python trên cổng `8998` / `8997` chưa nhận code mới, nên bảng KOC của anh vẫn là giao diện cũ chưa có nút `[ ] Tính KPI` và cột `Ngày Đăng`. |

---

## 2. Gốc Lỗi Khiến Cập Nhật Từ Xa Bị Đứng Cửa Sổ & Không Lên Bản Mới

| # | Lỗi gốc trong code hiện tại | Hậu quả thực tế anh vừa gặp | Vị trí `file:line` |
|---|---|---|---|
| **1** | **Ống pipe `netstat \| findstr \| findstr` chạy cả trong chế độ `/auto` + xung đột cờ `CREATE_NO_WINDOW \| DETACHED_PROCESS`** | Commit `fe22573` (04/11) thêm dòng `netstat -aon 2>nul \| findstr ":8998 :8997" \| findstr "LISTENING"` nằm **trước** `if /i not "%~1"=="/auto"`. Trên Windows, `DETACHED_PROCESS` làm vô hiệu `CREATE_NO_WINDOW`; khi `cmd.exe` không có console cha chạy lệnh pipe `\| findstr`, Windows bật **1 cửa sổ đen mới (`findstr.exe`) bị kẹt cứng stdin** cho tới khi anh bấm `[X]` tắt tay mới chạy tiếp (tái phát đúng lỗi `findstr` ngày 25/10 ở `be54325`). | `deploy/CAP_NHAT.bat:67`, `server.py:270` |
| **2** | **`deploy/CAP_NHAT.bat` thiếu `GCM_INTERACTIVE=never`, thiếu fallback HTTPS sạch & dùng `git pull --ff-only` dễ gãy** | Repo là public HTTPS, nhưng nếu `khoa_tiem.txt` hết hạn, remote đang để SSH lỗi, hoặc có 1 file bị lệch dòng CRLF trên máy tiệm, `git pull --ff-only` thất bại (`RC != 0`) → nhảy xuống dòng `154` **tự khởi động lại bản cũ `69220a5`** (`FAILED_PULL`). | `deploy/CAP_NHAT.bat:7, 132-156` |
| **3** | **Trần chờ khởi động `30s` quá sát cho Dual-Server (`8998` + `8997`)** | `start_server.vbs` gọi `share_online.py --dual-local` bật lần lượt 2 cổng (`15s + 15s = 30s`). Máy tiệm nạp thư viện chậm hơn 30s sẽ bị dòng `201` hiểu nhầm là lỗi khởi động và nhảy vào **`:rollback` (`git reset --hard !OLD!`)** xóa bản mới quay ngược về `69220a5`! | `deploy/CAP_NHAT.bat:193-212`, `deploy/start_server.vbs:13` |
| **4** | **Click `[ ] Tính KPI` từng dòng gọi lại `loadKocTab()` toàn trang** | Khi anh cần duyệt tay 50–80 video `< 200 view` (như 79 bài cột `L=1` trong `Tiktok_ChiTiet`), mỗi lần click phải chờ tải lại 461 dòng (~1.5s/lần qua Tunnel). | `static/js/modules/marketplace.js:2709` |

---

## 3. Bản Đồ Ánh Xạ Dữ Liệu & Luồng Thao Tác (Data & UI Mapping)

| Thành phần | Nguồn / Cơ chế xử lý | File / Vị trí | Ghi chú |
|---|---|---|---|
| **Trình cập nhật ngầm 0 cửa sổ** | Bỏ cờ `DETACHED_PROCESS` xung đột (chỉ dùng `CREATE_NO_WINDOW \| CREATE_NEW_PROCESS_GROUP` + `SW_HIDE` + `close_fds=True`), xóa sạch mọi ống `\| findstr` và `\| Out-String` trong `deploy/CAP_NHAT.bat` | `server.py:270`, `deploy/CAP_NHAT.bat:67, 204` | Triệt tiêu 100% cửa sổ đen bung lên khi bấm Cập nhật từ xa |
| **Kéo code Git an toàn không treo** | Đặt `GCM_INTERACTIVE=never`, thử SSH/token trước → tự fallback về HTTPS sạch `https://github.com/thienphuaegis-png/pos-pet-oem.git`, tăng chờ khởi động lên `75s` (kiểm tra cả `8998` & `8997`) | `deploy/CAP_NHAT.bat:106-205` | Không bao giờ bật popup hỏi tài khoản GitHub hay rollback oan |
| **Cách 1 tính KPI tay: Click 1 chạm từng dòng (0ms)** | Cột `Duyệt Tay` có nút `[ ] Tính KPI` ↔ `[x] Tính KPI` cập nhật **Optimistic UI tức thì (<10ms)** trên dòng + thẻ tổng KPI mà không reload bảng | `static/js/modules/marketplace.js:2604, 2709` | Phù hợp chấm rà soát nhanh từng video `199, 195, 193 view` |
| **Cách 2 tính KPI tay: Duyệt hàng loạt / Gợi ý theo KOC** | Endpoint `POST /api/marketplace/koc/videos/bulk-kpi` (`video_ids` + `manual_kpi` hoặc `mode="top1_zero_koc"`) + thanh chọn nhiều dòng | `routers/marketplace.py`, `templates/index.html`, `static/js/modules/marketplace.js` | Tuỳ chọn theo đáp án câu 1 của anh |
| **Cách 3 tính KPI tay: Nhập số tổng (+/- video)** | Nút `Công Thức Hoa Hồng` (hoặc nút `Chung/Riêng` trên dòng chiến dịch) → ô `Cộng / trừ video thủ công (+/-)` | `templates/index.html:17655`, `static/js/modules/marketplace.js:3084` | Đã có trong `3a67c51` — hiện ngay khi máy chủ lên bản mới |

---

## 4. Ma Trận Tác Động Sự Kiện (Event Impact Matrix)

| Chiều tác động | Xử lý |
|---|---|
| **1. Trigger (UI / API)** | (A) Nút `⚡ Cập Nhật Ngay` gọi `POST /api/system/apply-update`; (B) Nút `[ ] Tính KPI` / Thanh duyệt hàng loạt gọi `PUT /koc/videos/{id}` hoặc `POST /koc/videos/bulk-kpi`. |
| **2. Entity State** | (A) Máy chủ cập nhật lên commit mới nhất, tự chạy `init_db()` trên cả `pos.db` & `pos_instance2.db`, ghi `logs/update_status.txt = OK`; (B) Lưu bền `koc_videos.manual_kpi`. |
| **3. Ledger / Financial** | Cộng/trừ tức thì `Video tính thưởng` và `Thành tiền hoa hồng` trên màn KOC + đẩy sang `HRM -> Hoa Hồng & Tip` / `Bảng Lương` kỳ `DRAFT`. |
| **4. Stock / Debt** | Không chạm tồn kho, sổ quỹ hay công nợ. (`data/*.db`, `.env`, `deploy/khoa_tiem*` được bảo toàn 100% khi cập nhật). |
| **5. Reversal & Siblings** | Cập nhật lỗi thật ở `init_db()` vẫn tự động rollback an toàn về bản backup WAL; duyệt nhầm video bấm lại 1 chạm hoặc bấm `Bỏ duyệt hàng loạt` hoàn tác về tự động (`manual_kpi = 0`). |

---

## 5. Đáp Án Đã Chốt (2026-11-06)

| # | Câu hỏi | Đáp án đã chốt |
|---|---|---|
| 1 | Bộ công cụ tính KPI bằng tay cho video `< 200 view` | **1a:** Đầy đủ cả **3 cách**: (1) Click lẻ `[ ] Tính KPI` ăn ngay **0 giây** (Optimistic UI không giật/tải lại bảng); (2) **Checkbox tích chọn duyệt hàng loạt** + nút **`Gợi ý: Tự chọn 1 bài cao view nhất / KOC đang 0 bài`** (`POST /api/marketplace/koc/videos/bulk-kpi`); (3) Ô **Cộng/trừ video thủ công (+/-)** trong `Công Thức Hoa Hồng`. |
| 2 | Xử lý lệch file code / lỗi kéo Git khi Cập nhật từ xa | **2a:** Đặt `GCM_INTERACTIVE=never` + xóa sạch ống `\| findstr` gây đứng cửa sổ trong `deploy/CAP_NHAT.bat`; nếu `git pull --ff-only` vướng file code lệch hoặc token cũ hết hạn thì **tự động `git fetch` HTTPS sạch + `git reset --hard FETCH_HEAD`** (chỉ đồng bộ code, bảo toàn 100% `data/pos.db`, `data/pos_instance2.db`, `.env`, `logs/`, `deploy/khoa_tiem*`), đồng thời nâng thời gian chờ Dual-Server `8998+8997` lên `75s` để không bị rollback oan. |

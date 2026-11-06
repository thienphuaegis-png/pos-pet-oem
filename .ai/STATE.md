# PROJECT STATE — POS Petcare & Retail (Cloud D1 + Vercel + Local dual-server)

**Checkpoint:** 2026-11-06 — KOC / KOL: Duyệt Tay 0ms + Hàng Loạt + Sắp Xếp Nhanh & Sửa Triệt Để Cập Nhật Từ Xa
**Lịch sử checkpoint:** `.ai/checkpoints/PROJECT_STATE.json`, `.ai/checkpoints/CHECKPOINT_2026_10_25.md`
**Server:** Local `http://127.0.0.1:8998` (MCare, `data/pos.db`) + `:8997` (PetNT, `data/pos_instance2.db`) — `CAI_TAILSCALE_2_MAY_CHU.bat` / `CHAY_2_MAY_CHU.bat`
**Cloud:** `https://mcarepet.vercel.app` & `https://petnt.vercel.app` (Edge Static CDN + Proxy `hkg1` + Cloudflare D1); deploy `scripts/deploy_2_vercel.py`
**Working dir:** `D:/Projects_Hermes/pos-petcare2`
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`, HEAD `9de9a11`)
**Version:** `v3.6.112+` (`version_helper.py` + git)

---

## 1. Phiên Hiện Tại ✅ (2026-11-06)
- **Tăng Tốc Chấm KPI KOC (0ms + Duyệt Hàng Loạt + Gợi Ý Top 1 + Sắp Xếp Nhanh) & Triệt Tiêu Treo Cửa Sổ Cập Nhật Từ Xa (`deploy/run_update_hidden.vbs`, `deploy/CAP_NHAT.bat`, `CAP_NHAT.bat`, `server.py`, `routers/marketplace.py`, `schemas.py`, `templates/index.html`, `static/js/modules/marketplace.js`):** Bọc `deploy/CAP_NHAT.bat /auto` qua `wscript.exe //B //NoLogo deploy/run_update_hidden.vbs` (`SW_HIDE`), gỡ sạch mọi ống pipe `| findstr` làm bung cửa sổ đen khi chạy `DETACHED_PROCESS`, thêm `GCM_INTERACTIVE=never`, fallback `git fetch` HTTPS + `reset --hard FETCH_HEAD` (bảo toàn 100% `data/*.db`, `.env`), và nâng chờ khởi động Dual-Server lên `75s`. Trên Tab KOC: cập nhật optimistic 0ms khi bấm lẻ `[ ] Tính KPI`, thêm checkbox chọn nhiều dòng (`Shift+Click` chọn dãy) + `POST /api/marketplace/koc/videos/bulk-kpi` + nút `Gợi ý: Tự chọn 1 bài cao nhất / KOC đang 0 bài` (`mode='top1_zero_koc'`) + bộ sắp xếp 0ms (`#koc-video-sort` & click tiêu đề cột theo View, Ngày đăng, Gom kênh `@KOC` 0 bài lên đầu, Kết quả KPI).
- **Nâng Cấp KOC / KOL: Duyệt Tay Video Dưới KPI, Ngày Đăng Thật & Chống Trùng Video Cũ (`services/koc_service.py`, `routers/marketplace.py`, `schemas.py`, `templates/index.html`, `static/js/modules/marketplace.js`, `routers/hrm.py`, `static/js/modules/hrm.js`):** Thêm cột `koc_videos.manual_kpi` (`1`=Duyệt tay, `0`=Tự động, `-1`=Loại tay) giữ bền 100% khi bấm `Đồng Bộ Từ Sheet` hoặc `Quét Lại Tất Cả` kèm tiến độ kênh (`Kênh: X đạt + Y duyệt / Z video`) và bộ lọc `Kênh đang 0 bài KPI`; giải mã tức thì `Ngày đăng` (`published_at`) từ TikTok Snowflake ID (`int(video_id) >> 32`, múi giờ VN `UTC+7`) cho toàn bộ video cũ không tốn API; tự động loại video trùng kỳ trước (`build_prev_dup_lookup`) và video đăng quá hạn tháng cũ (có ô chỉnh `grace_days_prev_month`, mặc định `5` ngày + ô `manual_adjust_videos` cộng/trừ tổng + nút `Ngoại lệ`).
- **Checkbox Tính Thuế VAT Riêng Từng Món Đơn Đại Lý (`templates/index.html`, `templates/pos.html`, `static/js/pos.js`, `routers/pos.py`, `routers/products.py`, `routers/inventory.py`):** Thêm `#chk-pos-enable-vat` (`tab.add_vat`) mặc định tắt giữ giỏ 9 cột; khi tick mở cột `.vat-col` (ô nhập `%` tự do từng món, nạp sẵn `products.vat_rate` mặc định). Sửa gốc lỗi `final_amount` bỏ quên VAT: cộng chuẩn thuế sau giảm giá phân bổ vào `Khách cần trả`, Sổ quỹ (`PT-BH`), Công nợ, VietQR, trần Trả hàng (`/returnable-items` & `/api/pos/returns`) và bản in A4 9 cột (`Ghi chú` + dòng `Thuế GTGT` chân trang).
- **Tăng Tốc Tab Hóa Đơn (`static/js/modules/productions.js`, `routers/pos.py`, `routers/partners.py`):** Bỏ waterfall chờ tuần tự `/api/staff` + `/api/contacts` trước khi gọi `/api/orders`; thay thẻ `<select>` nhồi 13.000 khách bằng combobox tìm kiếm tối đa 25 dòng (`compact=1`, hỗ trợ `limit` ở backend); gom 300 subquery đếm `item_count` thành 1 CTE `GROUP BY`.
- **Sửa Nghẽn `mcarepet.vercel.app` & `petnt.vercel.app` (`deploy/vercel_bridge/vercel.json`, `deploy/vercel_bridge/api/index.js`, `scripts/deploy_2_vercel.py`):** Gốc lỗi do proxy vùng Mỹ (`iad1`) kéo cả 27 file `/static/*` qua Tailscale Funnel + gán `no-store` vượt timeout 25s (mất 29.35s–34.54s). Đóng gói `/static/*` lên thẳng Edge CDN Vercel, ghim function về `hkg1` (timeout 55s) → tải JS còn `0.46s–1.60s`, tổng trang `5.13s`.
- *(Đợt 2 cùng ngày `dd3fa93`)*: Nhập nhiều khoản Thưởng/Phụ cấp/Trừ khác Bảng Lương (`manual_items_json`), quét view TikTok theo lô 8 video + fallback HTML, bộ chọn tháng Popover 12 tháng Firefox/Chrome.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- 2026-11-06 (Đợt 2) `pytest` trên `test_remote_update.py`, `test_deploy_scripts.py`, `test_koc_manual_kpi_and_dedup.py`, `test_koc_management_and_commission.py`, `test_payroll_manual_items_and_koc_scan.py`, `test_html_integrity.py`, `test_git_hygiene.py`, `test_checkpoint_integrity.py`: **48/48 pass**; probe Playwright headless port `9108` xác nhận `JS_ERRORS: []`, click lẻ 0ms & `Shift+Click` + sort hoạt động chuẩn.
- 2026-11-06 `pytest` trên `test_koc_manual_kpi_and_dedup.py`, `test_koc_management_and_commission.py`, `test_payroll_manual_items_and_koc_scan.py`, `test_checkpoint_integrity.py`, `test_html_integrity.py`, `test_git_hygiene.py`: **pass 100%** (`node --check` trên `marketplace.js`, `hrm.js` exit 0).
- 2026-11-05 `pytest` trên `test_pos_b2b_partial_vat_and_orders_perf.py`, `test_multi_vat_and_option_b.py`, `test_query_performance_guard.py`, `test_checkpoint_integrity.py`, `test_html_integrity.py`, `test_git_hygiene.py`: **pass 100%** (commit `9de9a11`).
- Đo thực tế `https://mcarepet.vercel.app/` sau deploy: `X-Vercel-Id: hkg1::hkg1`, 14 tài nguyên tải song song giảm từ **29.35s** xuống **5.13s** (`HTTP 200`).
- `node --check` (`pos.js`, `app.js`, `productions.js`, `deploy/vercel_bridge/api/index.js`) = exit 0; `codegraph sync .` đã đồng bộ AST (`69 files`).

---

## 3. Files Thay Đổi Chính
- Backend: `schemas.py`, `routers/pos.py`, `routers/products.py`, `routers/inventory.py`, `routers/partners.py`.
- Frontend & Deploy: `templates/index.html`, `templates/pos.html`, `static/js/pos.js`, `static/js/app.js`, `static/js/modules/productions.js`, `deploy/vercel_bridge/*`, `scripts/deploy_2_vercel.py`.
- Tests: `tests/test_pos_b2b_partial_vat_and_orders_perf.py`.

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] Chạy `deploy\CAP_NHAT.bat` trên máy chủ tiệm + `Ctrl + F5` để nhận bản `9de9a11` (checkbox cột Thuế VAT, Tab Hóa Đơn nhanh & quét view TikTok theo lô).
- [ ] Đồng bộ đơn thực tế Tháng 10/2026 trên `Bán Hàng Sàn TMĐT → Pancake` và đối soát bảng lương tháng 10.
- [ ] Xác nhận & sửa phân hạng KH bị nhảy sang LAZADA do bug cũ (#1, #29313 trên `pos_instance2.db`; #22256).

---

## 5. Phiên Bản & Hạ Tầng
- Chạy: Vercel Edge Static CDN + Proxy `hkg1` (`mcarepet.vercel.app`, `petnt.vercel.app`) nối Tailscale Funnel / Cloudflare Tunnel về dual-server local (`8998` / `8997`).
- Nhánh Git: `main` (đồng bộ `origin/main` tại `9de9a11`).

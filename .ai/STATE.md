# PROJECT STATE — POS Petcare & Retail (Cloud D1 + Vercel + Local dual-server)

**Checkpoint:** 2026-11-05 — Checkbox Cột Thuế VAT Riêng Từng Món Đại Lý + Tăng Tốc Tab Hóa Đơn + Static Edge CDN Vercel (`9de9a11`)
**Lịch sử checkpoint:** `.ai/checkpoints/PROJECT_STATE.json`, `.ai/checkpoints/CHECKPOINT_2026_10_25.md`
**Server:** Local `http://127.0.0.1:8998` (MCare, `data/pos.db`) + `:8997` (PetNT, `data/pos_instance2.db`) — `CAI_TAILSCALE_2_MAY_CHU.bat` / `CHAY_2_MAY_CHU.bat`
**Cloud:** `https://mcarepet.vercel.app` & `https://petnt.vercel.app` (Edge Static CDN + Proxy `hkg1` + Cloudflare D1); deploy `scripts/deploy_2_vercel.py`
**Working dir:** `D:/Projects_Hermes/pos-petcare2`
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`, HEAD `9de9a11`)
**Version:** `v3.6.112+` (`version_helper.py` + git)

---

## 1. Phiên Hiện Tại ✅ (2026-11-05 — Đợt 3)
- **Checkbox Tính Thuế VAT Riêng Từng Món Đơn Đại Lý (`templates/index.html`, `templates/pos.html`, `static/js/pos.js`, `routers/pos.py`, `routers/products.py`, `routers/inventory.py`):** Thêm `#chk-pos-enable-vat` (`tab.add_vat`) mặc định tắt giữ giỏ 9 cột; khi tick mở cột `.vat-col` (ô nhập `%` tự do từng món, nạp sẵn `products.vat_rate` mặc định). Sửa gốc lỗi `final_amount` bỏ quên VAT: cộng chuẩn thuế sau giảm giá phân bổ vào `Khách cần trả`, Sổ quỹ (`PT-BH`), Công nợ, VietQR, trần Trả hàng (`/returnable-items` & `/api/pos/returns`) và bản in A4 9 cột (`Ghi chú` + dòng `Thuế GTGT` chân trang).
- **Tăng Tốc Tab Hóa Đơn (`static/js/modules/productions.js`, `routers/pos.py`, `routers/partners.py`):** Bỏ waterfall chờ tuần tự `/api/staff` + `/api/contacts` trước khi gọi `/api/orders`; thay thẻ `<select>` nhồi 13.000 khách bằng combobox tìm kiếm tối đa 25 dòng (`compact=1`, hỗ trợ `limit` ở backend); gom 300 subquery đếm `item_count` thành 1 CTE `GROUP BY`.
- **Sửa Nghẽn `mcarepet.vercel.app` & `petnt.vercel.app` (`deploy/vercel_bridge/vercel.json`, `deploy/vercel_bridge/api/index.js`, `scripts/deploy_2_vercel.py`):** Gốc lỗi do proxy vùng Mỹ (`iad1`) kéo cả 27 file `/static/*` qua Tailscale Funnel + gán `no-store` vượt timeout 25s (mất 29.35s–34.54s). Đóng gói `/static/*` lên thẳng Edge CDN Vercel, ghim function về `hkg1` (timeout 55s) → tải JS còn `0.46s–1.60s`, tổng trang `5.13s`.
- *(Đợt 2 cùng ngày `dd3fa93`)*: Nhập nhiều khoản Thưởng/Phụ cấp/Trừ khác Bảng Lương (`manual_items_json`), quét view TikTok theo lô 8 video + fallback HTML, bộ chọn tháng Popover 12 tháng Firefox/Chrome.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
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

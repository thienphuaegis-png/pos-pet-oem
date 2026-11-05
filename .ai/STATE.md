# PROJECT STATE — POS Petcare & Retail (Cloud D1 + Vercel + Local dual-server)

**Checkpoint:** 2026-11-05 — Chi tiết khoản Thưởng/Phụ cấp Bảng Lương + Quét View TikTok theo lô chống nghẽn + Bộ chọn Tháng Firefox/Chrome
**Lịch sử checkpoint:** `.ai/checkpoints/CHECKPOINT_2026_10_25.md` (trước đó `CHECKPOINT_2026_10_23.md`)
**Archived Plan:** `.ai/plans/archive/2026-11-05-payroll-items-koc-tiktok-scan-and-month-picker.md` (Mockup: `.ai/sketches/2026-11-05-payroll-adjust-and-koc-tiktok-ux.html`)
**Server:** Local `http://127.0.0.1:8998` (MCare, `data/pos.db`) + `:8997` (PetNT, `data/pos_instance2.db`) — `CHAY_2_MAY_CHU.bat` → `scripts/share_online.py --dual`
**Cloud:** `https://mcarepet.vercel.app` & `https://petnt.vercel.app` (Cloudflare D1); deploy `scripts/deploy_2_vercel.py`
**Working dir:** `D:/Projects_Hermes/pos-petcare2`
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`, HEAD `267beb9`)
**Version:** `v3.6.110+` (`version_helper.py` + git)

---

## 1. Phiên Hiện Tại ✅ (2026-11-05 — Đợt 2)
- **Chi Tiết Khoản Thưởng / Phụ Cấp / Giảm Trừ Bảng Lương (`services/hrm_schema.py`, `services/payroll_service.py`, `routers/hrm.py`, `static/js/modules/hrm.js`):** Thêm `manual_items_json` vào `payroll_lines`; bấm trực tiếp ô `PC Xăng/Khác`, `Thưởng khác`, `Trừ khác` trên Bảng Lương hoặc nút `Điều chỉnh Thưởng/PC` trong Phiếu Lương để nhập nhiều dòng khoản mục lẻ (`loại + tên khoản + số tiền`), tự cộng tổng, giữ bền vững qua `Tính Lương` và in tường minh lên Phiếu Lương.
- **Sửa Dứt Điểm Quét View TikTok 461+ Video (`routers/marketplace.py`, `services/koc_service.py`, `static/js/modules/marketplace.js`):** Bổ sung `import asyncio` bị thiếu (gốc lỗi 500 làm nổ `JSON.parse`), bọc `safeKocJson`, điều tiết `tikwm.com` `1.08s/video` + fallback đọc HTML TikTok (`__UNIVERSAL_DATA_FOR_REHYDRATION__`), tách 2 nút `Quét View Chưa Có (N)` / `Quét Lại Tất Cả` chạy từng lô `8 video` kèm thanh tiến trình + `Tạm dừng` / `Dừng hẳn`.
- **Đồng Bộ Bộ Chọn Tháng Firefox/Chrome (`static/js/app.js`, `templates/index.html`, `static/js/modules/spa.js`):** Thay sạch cả 4 thẻ `<input type="month">` bị trắng trên Firefox (`#koc-month-filter`, `#koc-src-month`, `#my-payslip-month`, `#spa-staff-filter-month`) bằng Popover lưới 12 tháng + nút nhanh `Tất cả / Tháng này / Tháng trước`.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- 2026-11-05 `pytest` trên `test_payroll_manual_items_and_koc_scan.py` + 9 bộ test KOC / HRM / Pancake / Elaya / HTML / D1 / Query Guard / Checkpoint / Git Hygiene: **66 passed, 0 failed**.
- `pyflakes` (6 file Python) = 0 undefined names; `node --check` (`app.js`, `hrm.js`, `marketplace.js`, `spa.js`) = exit 0.

---

## 3. Files Thay Đổi Chính
- Backend: `services/hrm_schema.py`, `services/payroll_service.py`, `routers/hrm.py`, `services/koc_service.py`, `routers/marketplace.py`.
- Frontend: `templates/index.html`, `static/js/app.js`, `static/js/modules/hrm.js`, `static/js/modules/marketplace.js`, `static/js/modules/spa.js`.
- Tests: `tests/test_payroll_manual_items_and_koc_scan.py`.

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] Commit & push bản sửa lỗi để máy tiệm bấm **Cập Nhật Ngay**, sau đó bấm `Quét View Chưa Có (461)` cho chiến dịch `THANH 10/2026`.
- [ ] Đồng bộ đơn thực tế Tháng 10/2026 trên `Bán Hàng Sàn TMĐT → Pancake` và đối soát bảng lương tháng 10.
- [ ] Xác nhận & sửa phân hạng KH bị nhảy sang LAZADA do bug cũ (#1, #29313 trên `pos_instance2.db`; #22256).

---

## 5. Phiên Bản & Hạ Tầng
- Chạy: Cloud D1 + Vercel (2 domain) và/hoặc local dual-server qua Cloudflare Tunnel. EXE PyInstaller đã bỏ từ `265349d`.
- Nhánh Git: `main` (đã đồng bộ `origin/main` tại `0ce289d`).

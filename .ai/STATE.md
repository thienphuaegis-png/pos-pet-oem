# PROJECT STATE — POS Petcare & Retail (Cloud D1 + Vercel + Local dual-server)

**Checkpoint:** 2026-11-05 — Hoàn thành trọn gói Plan đồng bộ HRM & Hoa hồng Pancake (`hrm-ux-sync-grouping-and-commissions`)
**Lịch sử checkpoint:** `.ai/checkpoints/CHECKPOINT_2026_10_25.md` (trước đó `CHECKPOINT_2026_10_23.md`)
**Archived Plan:** `.ai/plans/archive/2026-11-04-hrm-ux-sync-grouping-and-commissions.md` (Mockup: `.ai/sketches/2026-11-04-hrm-ux-overhaul-and-commissions.html` — ĐÃ CODE & VERIFY)
**Server:** Local `http://127.0.0.1:8998` (MCare, `data/pos.db`) + `:8997` (PetNT, `data/pos_instance2.db`) — `CHAY_2_MAY_CHU.bat` → `scripts/share_online.py --dual`
**Cloud:** `https://mcarepet.vercel.app` & `https://petnt.vercel.app` (Cloudflare D1); deploy `scripts/deploy_2_vercel.py`
**Working dir:** `D:/Projects_Hermes/pos-petcare2`
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`)
**Version:** `v3.6.85` (`version_helper.py` + git, HEAD `758f282`)

---

## 1. Phiên Hiện Tại ✅ (2026-11-05)
- **Engine Chấm Công & Lưới Tháng (`services/payroll_engine.py`, `services/payroll_service.py`, `static/js/modules/hrm.js`):** Không trừ phạt Vắng `-500.000 đ/ngày` cho NV cả kỳ chưa có lượt quẹt vân tay (`0 công, 0 phạt`, bỏ gạch đỏ); Lưới Chấm Công chỉ đọc, 2 hàng tiêu đề (`01..31` + `T2..T7, CN`), tô nền hồng cột `CN`, ghim `Mã NV + Họ và Tên`.
- **Ghim Cột Bảng Lương & Mở Đủ 29 Cột `Nhân Sự` (`routers/hrm.py`, `static/js/modules/hrm.js`, `templates/index.html`):** `sticky left` cụm `⚠ + Mã NV + Họ và Tên` (kể cả dòng `Tổng cộng`); tab `Nhân Sự` mở 29 cột kèm Popover `Cột hiển thị` (`GET/PUT /api/hrm/staff-columns`) và ghi chú nền 85% KPI (`5.525.000 đ` → `6.500.000 đ`).
- **Thanh Thời Gian Dùng Chung + Sửa Mất Tên + Gom Nhóm Tổng Theo NV:** Nút `Tháng này | Tháng trước | Khoảng ngày` đồng bộ 2 chiều HRM & Sàn Pancake; sửa mất tên NV ở `Tăng Ca` & `Tạm Ứng` + sửa `pa.account_type`; ngày `DD/MM/YYYY (Thứ)`; gom nhóm theo NV kèm tổng từng người + `<tfoot>` tổng kỳ ở `Xin Off`, `Tăng Ca`, `Tạm Ứng`, `Điều Chỉnh Lương`.
- **Hoa Hồng POS & Tiến Độ Đủ/Thiếu Pancake (`services/commission.py`, `services/pancake.py`, `routers/hrm.py`, `static/js/modules/hrm.js`):** Chế độ `dept` tự hưởng `% Bán POS` của Bộ phận (tách rõ đơn TK `Admin`); thưởng đạt mốc `120tr` của `NV17` về `+975.000 đ` (lên đúng `6.500.000 đ`), bỏ ẩn NV `0 đ` mặc định, luôn hiện tiến độ `Thực đạt / Mốc (Đạt / Thiếu ... đ)`.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- 2026-11-05 `pytest` trên `test_hrm_ux_sync_grouping_and_commissions.py` + 13 bộ test HRM / Commission / Pancake / D1 / HTML / Elaya / Query Guard / Checkpoint: **80 passed, 0 failed** (34.5s).
- `pyflakes` (6 file Python) = 0 lỗi; `node --check` (`hrm.js`, `marketplace.js`, `app.js`) = exit 0.

---

## 3. Files Thay Đổi Chính
- Backend: `services/payroll_engine.py`, `services/payroll_service.py`, `services/commission.py`, `services/pancake.py`, `routers/hrm.py`.
- Frontend: `templates/index.html`, `static/js/modules/hrm.js`, `static/js/modules/marketplace.js`, `static/js/app.js`.
- Tests: `tests/test_hrm_ux_sync_grouping_and_commissions.py`, `tests/test_marketplace_pancake.py`, `tests/test_hrm_attendance_detail_sort_sum_and_50k_fix.py`.

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] Kiểm tra trực quan trên trình duyệt & commit toàn bộ đợt nâng cấp HRM + Hoa hồng Pancake (`feat(hrm,pancake): sync period bar, sticky columns, staff grouping, and KPI progress`).
- [ ] Đồng bộ đơn thực tế Tháng 10/2026 trên `Bán Hàng Sàn TMĐT → Pancake` (chọn `Tháng trước`) và gán nick `Thùy Dương -> NV17` để lên số thật.
- [ ] Xác nhận & sửa phân hạng KH bị nhảy sang LAZADA do bug cũ (#1, #29313 trên `pos_instance2.db`; #22256).

---

## 5. Phiên Bản & Hạ Tầng
- Chạy: Cloud D1 + Vercel (2 domain) và/hoặc local dual-server qua Cloudflare Tunnel. EXE PyInstaller đã bỏ từ `265349d`.
- Nhánh Git: `main` (đã đồng bộ `origin/main` tại `0ce289d`).

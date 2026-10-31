# PROJECT STATE — POS Petcare & Retail (Cloud D1 + Vercel + Local dual-server)

**Checkpoint:** 2026-10-31 — Dual-server 8998/8997 + 2 domain Vercel, chặn tồn âm, quy tắc mã chứng từ, ví Spa theo danh mục, xuất Excel sổ quỹ/đơn hàng, tối ưu D1 (v3.6.85)
**Lịch sử checkpoint:** `.ai/checkpoints/CHECKPOINT_2026_10_25.md` (trước đó `CHECKPOINT_2026_10_23.md`)
**Active Plan:** `.ai/plans/2026-10-30-fix-pos-search-and-cloud-load-speed.md`
**Server:** Local `http://127.0.0.1:8998` (MCare, `data/pos.db`) + `:8997` (PetNT, `data/pos_instance2.db`) — `CHAY_2_MAY_CHU.bat` → `scripts/share_online.py --dual`
**Cloud:** `https://mcarepet.vercel.app` & `https://petnt.vercel.app` (Cloudflare D1); deploy `scripts/deploy_2_vercel.py`
**Working dir:** `D:/Projects_Hermes/pos-petcare2` (đổi tên từ `pos-offline-petcare2`)
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`)
**Version:** `v3.6.85` (động từ `version_helper.py` + git, HEAD `0ce289d`)

---

## 1. Phiên Hiện Tại ✅ (2026-10-28 → 2026-10-31)
- **Dual-server + Vercel bridge (`0ce289d`):** 2 server local độc lập (8998 → `pos.db`, 8997 → `pos_instance2.db`, `POS_SIBLING_MODE=1` tắt Telegram bot bản 2). Mỗi cổng mở 1 Cloudflare Tunnel, URL ghi vào `settings.live_tunnel_url` trên D1; `GET /` trên Vercel ping tunnel (cache 15s) và 307 redirect về máy local nếu online, `?cloud=1` để ép dùng bản cloud. File: `server.py`, `scripts/share_online.py`, `scripts/deploy_2_vercel.py`, `backup_service.py` (dùng `get_db_path()`).
- **POS/Spa/Sổ quỹ (`1ef3331`):** chặn bán/đổi hàng làm tồn âm; quy tắc mã chứng từ tùy chỉnh; bật/tắt dùng ví Spa theo danh mục (`pet_service_categories.allow_spa_wallet`, chỉ combo VIP, không phụ thu/nhuộm); xuất Excel sổ quỹ theo khoảng ngày.
- **Cloud D1 (`90353f2`, `cf9bde5`, `7aa6e8c`):** gốc lỗi POS không tìm được hàng = D1 thiếu cột `requires_bom` → `/api/products` 500; thêm cột + fallback. Gộp multi-query thành batch D1, bỏ table scan Spa KPI/briefing, contacts compact, httpx keep-alive; logo PetNT giữ khi D1 hết quota (fallback SQLite); POS cart hết giật; menu thao tác phiếu nhập không bị cắt.
- **Đơn hàng (`2f6356f`, `d6b17e9`, `4e88b70`):** xuất Excel đơn đã lọc/đã chọn kèm sheet chi tiết dòng; in phiếu giao hàng A4 không giá.
- **HRM/Báo cáo/Auth (`fcd0031`, `649827a`):** import nhân sự từ Google Sheet tạo hàng loạt tài khoản đăng nhập bằng SĐT; sửa Excel báo cáo 500 + chia theo tháng; UI đăng nhập tách đôi, đổi mật khẩu, xóa nhân viên.
- **BOM/Nhập hàng/Guide (`c7fd8dc`, `cdbccad`, `63e7a0a`):** tách hàng bán lẻ vs hàng tự sản xuất, loại nguyên liệu, toggle BOM 1 chạm; lưới hàng chờ đặt từ phiếu yêu cầu; mẫu in sổ quỹ; sửa tour spotlight.
- **Migrate Cloud (`265349d`):** chuyển sang Cloudflare D1 + Vercel 2 instance, bỏ đóng gói EXE offline.
- **Checkpoint fix (phiên này):** `tests/test_checkpoint_integrity.py` hardcode path cũ → đổi sang path tương đối `ROOT`; `scripts/generate_checkpoint.py` lấy tên project từ thư mục. `database.py` `init_db()` trên DB trắng query `settings` trước khi tạo bảng (migration `migration_spa_cat_allow_wallet_v1` từ `1ef3331`) → thêm `CREATE TABLE IF NOT EXISTS settings` ngay trước.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- 2026-10-31 full suite `pytest tests/ --ignore=tests/manual`: **929 passed, 13 failed, 10 skipped** (235s).
- 13 fail còn lại phụ thuộc DB thật/đang chạy, không do checkpoint: dữ liệu `Lucky Star`/SP37 (`test_ai_agent_smart_oem`, `test_oem_bom_cost_calculation` ×2), `database is locked` khi server 8998 bật (`test_cashbook_supplier_debt_no_duplicate`, `test_k80_discount`), `UNIQUE contacts.id` (`test_cashbook_edit_delete`), assert UI cũ (`test_k80_discount`, `test_po_and_oem_6col_table`, `test_ui_elaya_anti_slop_7fixes`), `test_points_and_tier_upgrade`, `test_rbac_and_supplier_dedup` ×2, `test_ai_batch_drafts_and_projected_stock`, `test_bugfixes_2026_10::test_reset_data_customers_lowercase`.
- Fix `settings` trước migration: `test_cashbook_print_template`, `test_purchase_requests_pending_items` từ fail → pass.
- Feature tests mới: `test_pos_spa_10_requirements_2026_10_31`, `test_query_performance_guard`, `test_hrm_sheets_import`, `test_reports_analytics`, `test_order_delivery_note_print`, `test_password_visibility`, `test_bom_retail_separation_and_ingredient_exclusion`, `test_d1_adapter`: pass.
- `tests/test_checkpoint_integrity.py` & `tests/test_html_integrity.py`: xem commit `docs(checkpoint)` 2026-10-31.

---

## 3. Files Thay Đổi Chính
- `server.py`, `scripts/share_online.py`, `scripts/deploy_2_vercel.py`, `CHAY_2_MAY_CHU.bat`, `TAT_POS.bat`: dual-server + Vercel bridge.
- `database.py`: D1 adapter (batch, keep-alive, fallback SQLite khi hết quota), migration `requires_bom`, `allow_spa_wallet`.
- `routers/pos.py`, `routers/cashbook.py`, `routers/partners.py`, `routers/products.py`, `routers/inventory.py`, `routers/hrm.py`, `routers/ai_assistant.py`.
- `static/js/pos.js`, `static/js/modules/{productions,spa,hrm,purchases,contacts,reports_analytics}.js`, `templates/index.html`.

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] Sửa 13 test fail: cô lập DB test (`POS_DB_PATH` tmp) thay vì đọc `data/pos.db` thật; cập nhật assert UI cũ.
- [ ] Khóa chỉnh sửa trực tiếp trên lưới lương (bỏ nút Sửa số để bảo toàn tính bất biến kế toán).
- [ ] Bỏ droplist dư "Loại điều chỉnh" trong modal điều chỉnh lương (chỉ giữ 2 ô Lương CB & Phụ cấp).
- [ ] Bảng riêng quản lý Nhân Viên Miễn Chấm Công (mặc định đủ công trừ off chế độ & xin off).
- [ ] Nút tự báo công Check-in/Check-out trên trang Phiếu Lương cho nhân sự Remote.
- [ ] Chuẩn hóa parser máy chấm công vân tay (format DD/MM/YYYY) & tính lương Sales Pancake (KPI 85%/100%), Part-time theo giờ.

---

## 5. Phiên Bản & Hạ Tầng
- Chạy: Cloud D1 + Vercel (2 domain) và/hoặc local dual-server qua Cloudflare Tunnel. EXE PyInstaller đã bỏ từ `265349d`.
- Nhánh Git: `main` (đã đồng bộ `origin/main` tại `0ce289d`).

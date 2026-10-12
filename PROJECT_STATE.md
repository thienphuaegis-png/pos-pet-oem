# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-10-12 — Sàn TMĐT (Shopee/TikTok), Truy Cập Từ Xa Tailscale Funnel, Module Toggle Sàn TMĐT & Sửa Cache-Bust Exe
**Server:** `http://127.0.0.1:8998` — FastAPI + SQLite (`data/pos.db`), bind `0.0.0.0`
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`)
**Archive Log:** `docs/archive/STATE_2026_10.md` (phiên 2026-10-11), `docs/archive/STATE_2026_09.md`

---

## 1. Phiên Hiện Tại ✅ (2026-10-12)
- **Bán Hàng Sàn TMĐT (`routers/marketplace.py`, `static/js/modules/marketplace.js`):**
  - Kênh Shopee + TikTok Shop: đồng bộ đơn, map SKU sàn ↔ kho POS, thống kê ngày, trợ lý Gemini.
  - Bookmarklet lấy đơn trực tiếp trong trình duyệt (né HttpOnly token), quét mọi tab trạng thái, lọc ngày.
  - Kéo-thả import Excel đơn hàng: Shopee, TikTok, Pancake.
- **Sổ Quỹ:** danh mục thu/chi tùy chỉnh (quick-add + modal quản lý); cột created_by/updated_by dời cuối bảng, updated_at giờ VN.
- **Truy Cập Từ Xa:**
  - `CHAY_ONLINE_CLOUDFLARE.bat`: Cloudflare quick tunnel (không quota dung lượng, link đổi mỗi lần chạy).
  - `CAI_TAILSCALE.bat`: cài Tailscale (winget), firewall 8998 chỉ cho `100.64.0.0/10`, `tailscale up --hostname=pos-server --unattended`, bật Funnel `--bg 8998`.
    - Máy có Tailscale: `http://pos-server:8998` (không giới hạn băng thông).
    - Máy không cài: link `https://pos-server.<tailnet>.ts.net` (Funnel; free plan, có giới hạn băng thông không công bố). Tắt: `tailscale funnel reset`.
- **Module Toggle Sàn TMĐT (`routers/settings.py`, `database.py`, `static/js/staff.js`, `templates/index.html`):**
  - Thêm `module_marketplace` vào `MODULE_KEYS` + `DEFAULT_MODULES`; tab sidebar gắn `data-module="module_marketplace"`; grid toggle 5 cột.
- **Sửa Cache-Bust Khi Chạy Exe (`version_helper.py`):**
  - Lỗi gốc: exe chạy git trong `_MEIPASS` (không có `.git`), nên commit hash không đổi, `?v=` không đổi và trình duyệt giữ JS cũ.
  - Sửa: `ROOT = Path(sys.executable).parent` khi frozen.
- **Ma trận phân quyền:** thêm header cột thiếu "Nhân Viên" (role `staff`).
- Exe rebuild 2 lần (sau `c64b848` và `d7ded37`).

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- Uvicorn test port 8997: `GET /api/settings/modules` trả `module_marketplace: true`; `/` có `data-module="module_marketplace"` và `staff.js?v=c64b848_20261012`; `staff.js` chứa label mới.
- `version_helper.get_app_version_info()` (Python) trả `c64b848 2026.10.12`.
- **Chưa verify:** exe mới trên máy chủ thật; `CAI_TAILSCALE.bat` chưa chạy lần nào (máy dev không có Tailscale).

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `routers/marketplace.py`, `static/js/modules/marketplace.js` | Sàn TMĐT: sync đơn, SKU map, import Excel, bookmarklet |
| `CAI_TAILSCALE.bat` | Cài Tailscale + Funnel 1 chạm |
| `CHAY_ONLINE_CLOUDFLARE.bat` | Tunnel Cloudflare |
| `routers/settings.py`, `database.py`, `schemas.py` | `module_marketplace` |
| `static/js/staff.js`, `templates/index.html` | Ô toggle Sàn TMĐT, header cột Nhân Viên |
| `version_helper.py` | ROOT theo thư mục exe khi frozen |
| `POS_Mastercare.exe` | Rebuild |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] Máy chủ: chạy `CAP_NHAT.bat`, Ctrl+F5, xác nhận có ô "Bán Hàng Sàn TMĐT" và ẩn tab được.
- [ ] Máy chủ: chạy `CAI_TAILSCALE.bat`, lấy link Funnel `*.ts.net`, test từ 4G.
- [ ] Đặt mật khẩu mạnh cho tài khoản admin/nhân viên (link Funnel công khai).
- [ ] Kiểm tra chân sidebar hiển thị commit mới trên exe (xác nhận fix cache-bust).
- [ ] Kiểm tra báo cáo dòng tiền sau giao dịch đổi/trả hàng.
- [ ] Đồng bộ thời gian thực quầy offline với Supabase Cloud.

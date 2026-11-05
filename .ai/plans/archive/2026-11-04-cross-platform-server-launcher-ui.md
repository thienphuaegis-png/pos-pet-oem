# Plan: Giao Diện Khởi Động & Điều Khiển Máy Chủ Đẹp Trên Máy Cũ & Linux

- **Ngày**: 2026-11-04
- **Trạng thái**: CHỜ ANH DUYỆT (`/brainstorming`)

## 1. Phân Tích Nguyên Nhân Gốc Từ Ảnh Chụp `C:\POS`

| Vấn đề nhìn thấy trên ảnh | Nguyên nhân kỹ thuật thực tế | File / Vị trí hiện tại |
|---|---|---|
| Chữ tiếng Việt vỡ thành `kh?i ch?y ng?m`, `c?ng`, `du?c` | Khi `.bat` tự nâng quyền Admin bằng `Start-Process -Verb RunAs`, cửa sổ `conhost.exe` mới quay về codepage mặc định (`cp1252`/`cp437`) và Python chưa đặt `PYTHONUTF8=1` / `sys.stdout.reconfigure(encoding='utf-8')`. | `CAI_TAILSCALE_2_MAY_CHU.bat:9`, `scripts/setup_tailscale_dual.py:1` |
| Icon đầu dòng biến thành `?` hoặc `??` | Font Raster/Consolas của `cmd.exe` máy Windows cũ và TTY trên Linux không có bộ glyph Emoji màu (`🚀`, `⚠️`, `🎉`, `✅`). | `scripts/setup_tailscale_dual.py:194-242`, `scripts/share_online.py:127-175` |
| Log thô `!-- proxy http://127.0.0.1:8998` trộn lẫn tiếng Anh + tiếng Việt | Script đang in trực tiếp stdout của `tailscale.exe` ra màn hình thay vì bóc tách ngầm rồi vẽ 1 bảng tổng kết gọn. | `scripts/setup_tailscale_dual.py:120-124` |
| Chưa có bộ chạy chuẩn cho Linux | Các file khởi động/cập nhật hiện mới viết dạng `.bat` / `.vbs` cho Windows (mới chỉ có `deploy/setup_oracle.sh` cũ cho 1 cổng). | `CAI_TAILSCALE_2_MAY_CHU.bat`, `deploy/start_server.vbs` |

---

## 2. Bản Đồ Ánh Xạ Dữ Liệu (Data Mapping)

| Trường thông tin hiển thị | Nguồn dữ liệu thực tế | File / Endpoint | Ghi chú |
|---|---|---|---|
| Trạng thái 2 máy chủ (`8998` & `8997`) | `GET http://127.0.0.1:8998/api/ping` & `:8997/api/ping` | `server.py:345`, `scripts/share_online.py:112` | Có sẵn, trả về version & store |
| Cấu hình Tailscale Funnel & DNS `*.ts.net` | `tailscale status --json`, `tailscale funnel status --json` & `data/tailscale_funnel.json` | `scripts/setup_tailscale_dual.py:48, 224` | Có sẵn, đã gitignore `data/tailscale_funnel.json` |
| Trạng thái gắn tên miền cố định Vercel | `GET https://mcarepet.vercel.app/api/tunnel/status` & `petnt.vercel.app` | `deploy/vercel_bridge/api/index.js:247` | Có sẵn |
| Phiên bản & Cập nhật 1-chạm | `GET /api/version`, `GET /api/system/check-update`, `POST /api/system/apply-update` | `server.py:243-344` | Có sẵn |
| Khởi động cùng hệ điều hành (Windows / Linux) | Windows Startup `.lnk` (`start_server.vbs`) / Linux `systemd` user/system service (`pos-petcare.service`) | `scripts/setup_tailscale_dual.py:168`, *(thêm helper Linux)* | Tự dò `sys.platform` |

---

## 3. Ma Trận Tác Động Sự Kiện (Event Impact Matrix — 5 Chiều)

1. **Trigger (UI / CLI)**:
   - Người dùng bấm `CAI_TAILSCALE_2_MAY_CHU.bat` (Windows) hoặc `./deploy/pos_ctl.sh` (Linux), hoặc mở thẻ `Máy Chủ & Đường Truyền` trong Web POS (`GET /api/system/server-overview` — chỉ quyền `owner`/`admin`).
2. **Entity State**:
   - Tiến trình cổng `8998` (`data/pos.db`) & `8997` (`data/pos_instance2.db`) chuyển sang `Running`; Funnel `443`/`8443` bật `--bg`; file `data/tailscale_funnel.json` cập nhật trạng thái.
3. **Ledger / Financial (Dòng tiền)**:
   - Không tác động sổ quỹ, hóa đơn hay số dư tài khoản.
4. **Stock / Debt (Dòng hàng / Nợ)**:
   - Không tác động tồn kho hay công nợ; giữ nguyên 100% nguyên tắc tách biệt 2 file DB (`pos.db` vs `pos_instance2.db`).
5. **Reversal & Siblings (Hoàn tác & Đa nền tảng)**:
   - Tắt đường truyền công khai bằng 1 nút/lệnh (`tailscale funnel reset` + xóa `data/tailscale_funnel.json`).
   - Hoạt động đồng nhất trên Windows cũ (Win7/10 `conhost`), Windows 11, Linux Desktop và Linux SSH không màn hình.

---

## 4. Quyết Định Đã Chốt

| # | Hạng mục thiết kế | Phương án anh đã chốt |
|---|---|---|
| 1 | Giao diện điều khiển máy chủ | **Kết hợp Web Panel + Clean TUI**: Trên máy có màn hình/trình duyệt (Windows cũ & mới, Linux Desktop) ẩn CMD đen, mở **Trang Trạng Thái Máy Chủ** trên trình duyệt (`http://127.0.0.1:8998/server-status`) và tích hợp thẻ **Máy Chủ & Đường Truyền** ngay trong `Cài Đặt Hệ Thống` POS. Trên Linux SSH hoặc trong lúc cài đặt hiển thị bảng **Clean TUI** phẳng không Emoji (tự hạ cấp ASCII trên máy cổ, 0 lỗi dấu `?`). |
| 2 | Hỗ trợ hệ điều hành Linux | **Cả Linux VPS/Server (`systemd` + SSH) lẫn Linux Desktop (Ubuntu/Mint)**: Tạo bộ điều khiển `pos_server.sh` (`install`, `start`, `stop`, `status`, `update`, `funnel`) chạy song song 2 cổng `8998` (`pos.db`) & `8997` (`pos_instance2.db`) tự bật lại khi reboot. |
| 3 | Phạm vi chuẩn hóa file chạy | **Đồng bộ toàn bộ file khởi động & cập nhật** (`CAI_TAILSCALE_2_MAY_CHU.bat`, `CHAY_2_MAY_CHU.bat`, `CHAY_POS.bat`, `CHAY_ONLINE_CLOUDFLARE.bat`, `CHAY_BAN_SONG_SONG_CLOUDFLARE.bat`, `CAP_NHAT.bat`, `scripts/setup_tailscale_dual.py`, `scripts/share_online.py`, `launcher.py`) qua module hiển thị chung `scripts/cli_ui.py` (ép UTF-8 + fallback ASCII tự động, không còn ký tự `?`). |

---

## 5. Lộ Trình Thực Thi (Chờ Anh Duyệt "OK")

1. **Module giao diện CLI đa nền tảng (`scripts/cli_ui.py`)**:
   - Tự bật `UTF-8` + `ENABLE_VIRTUAL_TERMINAL_PROCESSING` trên Windows; tự dò encoding thực tế của stdout (`utf-8` vs `cp1252`/`ascii`) để tự chuyển sang bảng ASCII không dấu nếu máy quá cổ — cam kết **0 ký tự `?`**, **0 Emoji vỡ chữ**.
2. **Trang Trạng Thái Web (`GET /server-status`) & Thẻ Quản Lý trong `Cài Đặt Hệ Thống`**:
   - API `GET /api/system/server-overview` + `POST /api/system/sync-tunnel` (bảo vệ quyền `owner`/`admin` cho thao tác quản trị; trang `/server-status` cục bộ `127.0.0.1` cho phép xem nhanh trạng thái 2 cổng `8998`/`8997`, Tailscale Funnel, Vercel, nút Copy Link & QR Code).
3. **Bộ điều khiển Linux (`pos_server.sh`)**:
   - Hỗ trợ Ubuntu/Debian/CentOS (Desktop & VPS SSH): tự cài `.venv`, cài Tailscale Linux, đăng ký `systemd` cho cả 2 cổng `8998` & `8997`, bật Funnel `443` & `8443` và in bảng `Clean TUI` hoặc mở trình duyệt nếu có `$DISPLAY`.
4. **Chuẩn hóa toàn bộ `.bat` & Script Python + Kiểm chứng (`pytest` + Headless Browser)**:
   - Xóa sạch mọi Emoji gây lỗi font trong các script launcher; cập nhật `.ai/MAP.html` sau khi hoàn tất.

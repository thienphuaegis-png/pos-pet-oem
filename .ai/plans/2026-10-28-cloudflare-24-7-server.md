# Đưa POS lên máy chủ 24/7 qua Cloudflare — CHỜ ANH DUYỆT

Mục tiêu đã chốt: máy chủ chạy 24/7 kể cả khi tắt máy tiệm; nhân viên nhiều chi nhánh truy cập; domain đang ở nhà đăng ký khác (Mắt Bão/PA...).

## 1. Sự thật kỹ thuật (đọc code, chưa chạy thử trên Linux)

| Điểm | Hiện trạng | Bằng chứng |
|---|---|---|
| App là FastAPI + uvicorn, process chạy lâu | Cần máy chạy Python thật | `main.py:76-93` |
| DB SQLite file 20MB, WAL | Cần ổ đĩa bền vững | `database.py:227-240`, `data/pos.db` |
| Đã có nhánh Postgres (`DATABASE_URL`) nhưng `init_db()` bỏ qua migration | Schema PG lệch: 53 bảng vs 71 bảng SQLite | `database.py:373-375`, `data/init_supabase.sql` |
| 4 thread nền (backup, Telegram poll, activity log, server) | Không chạy được trên Workers | `backup_service.py:166`, `services/telegram_bot.py:895`, `activity_logger.py:41` |
| Nút "Cập nhật" đã có nhánh Linux (git pull + restart) | Dùng lại được | `server.py:279-300` |
| Script cài VPS Ubuntu có sẵn (systemd + nginx) | Dùng lại, bỏ nginx nếu dùng tunnel | `deploy/setup_oracle.sh` |
| Backup Google Drive dùng ổ `G:\` | Trên Linux tự bỏ qua; webhook Apps Script vẫn chạy | `backup_service.py:34,66-84` |
| `cloudflared` đang dùng link tạm `trycloudflare.com` | Link đổi mỗi lần chạy | `CHAY_ONLINE_CLOUDFLARE.bat` |

**Kết luận:** Cloudflare KHÔNG tự chạy được app này làm máy chủ.
- Workers Python: không có thread, không có ổ đĩa, D1 là API async → phải viết lại toàn bộ ~236 chỗ gọi DB.
- Cloudflare Containers: ổ đĩa mất khi container restart → mất `pos.db`.

Cloudflare đóng vai **cửa ngõ** (domain, HTTPS, chặn người lạ, giấu IP). Máy chủ thật là **1 VPS Linux**.

## 2. Ba hướng

| Hướng | Cách | Chi phí | Công sửa code | Rủi ro |
|---|---|---|---|---|
| **A (đề xuất)** | VPS Linux + code giữ nguyên SQLite + `cloudflared` tunnel tên cố định + Cloudflare Access | VPS 0–150k/tháng, Cloudflare 0đ | Rất ít | VPS chết = cả hệ thống dừng → cần backup tự động |
| B | VPS + chuyển sang Postgres (Supabase/Neon) | 0–600k/tháng | Vừa: bù 18 bảng thiếu, migration PG | Lệch SQL giữa 2 DB, khó debug |
| C | Viết lại cho Workers + D1 | 0–125k/tháng | Rất lớn (viết lại backend) | Không đáng |

## 3. Sơ đồ hướng A

```
Nhân viên chi nhánh (trình duyệt)
        │ https://pos.<domain-anh>
        ▼
Cloudflare (DNS + HTTPS + Access: OTP email / chặn IP lạ)
        │ tunnel mã hóa, VPS không mở cổng nào
        ▼
VPS Ubuntu: cloudflared ──► uvicorn 127.0.0.1:8998 ──► data/pos.db
                                            └─ backup mỗi giờ → Google Drive (webhook)
```

## 4. Phase (sau khi anh duyệt)

- **Phase 0 – Chuẩn bị (anh làm, em hướng dẫn từng bước):** tạo tài khoản Cloudflare, thêm domain, đổi nameserver ở Mắt Bão/PA sang Cloudflare (gói Free bắt buộc đổi NS; mất 1–24h). Thuê VPS.
- **Phase 1 – Chạy thử trên VPS:** clone repo, cài `.venv`, copy bản sao `pos.db`, chạy systemd service, kiểm `pytest` + đăng nhập thật. Sửa chỗ vướng Linux (vd `pystray` ở `main.py`, đường dẫn Windows).
- **Phase 2 – Tunnel cố định:** `cloudflared tunnel create pos` → route `pos.<domain>` → service systemd. Bỏ nginx + đóng cổng 80/443/8999 trên VPS.
- **Phase 3 – Bảo vệ:** Cloudflare Access (whitelist email nhân viên, OTP) phía trước login POS; giữ `login_attempts` hiện có.
- **Phase 4 – Chuyển dữ liệu (cut-over):** chọn giờ đóng cửa, tắt POS máy tiệm, copy `pos.db` mới nhất lên VPS, các chi nhánh đổi link. Máy tiệm thành máy khách.
- **Phase 5 – Backup:** bật webhook Google Drive mỗi giờ + snapshot VPS hằng ngày. Thử khôi phục 1 lần.

## 5. Đánh đổi anh cần biết

1. **Mất internet ở tiệm = không bán được.** Hiện tại POS chạy offline trong LAN. Lên cloud thì mọi chi nhánh phụ thuộc mạng. Phương án dự phòng: 4G điện thoại phát wifi.
2. Máy in, đầu đọc mã vạch vẫn dùng bình thường (in từ trình duyệt máy khách).
3. Nút "Cập nhật" chạy nhánh Linux (`git pull`), không dùng `CAP_NHAT.bat` / exe nữa.

## Câu hỏi đã trả lời (vòng 1)

| # | Câu hỏi | Đáp án anh chọn |
|---|---|---|
| 1 | Hướng kiến trúc | C – viết lại backend cho Workers + D1 |
| 2 | VPS | Trả phí Singapore/VN ~100–150k/tháng |
| 3 | Mất mạng ở tiệm | Cần bán offline rồi đồng bộ sau |

## Mâu thuẫn cần chốt lại

- **1C + 2 mâu thuẫn:** Workers + D1 không cần VPS. Chọn C thì bỏ VPS; thuê VPS thì là hướng A/B.
- **Quy mô C (đo trên code thật):** 30.575 dòng backend, 23 router, 368 endpoint, 1.896 lệnh gọi DB đồng bộ. D1 trên Python Workers là gọi async (`await`) → phải sửa toàn bộ 1.896 chỗ + đổi `?`/`PRAGMA`/`INSERT OR` nếu lệch. 4 thread nền → Cron Triggers. Ghi file (Excel export, backup) → R2. Chưa xác nhận `openpyxl`/`Pillow`/`bcrypt`/`qrcode` chạy được trên Pyodide → **phải spike trước**.
- **Offline + đồng bộ độc lập với A/C:** mỗi tiệm phải có DB riêng + engine đồng bộ xử lý xung đột (tồn kho 2 nơi cùng trừ, mã hóa đơn trùng, công nợ). Đây là việc lớn nhất trong toàn bộ dự án, làm với A hay C đều như nhau.

## Câu hỏi vòng 2

1. Bỏ VPS, đi C? Hay quay lại A (lên online trong 1–2 ngày), C để sau?
2. Offline: làm ngay từ đầu, hay pha sau khi đã có máy chủ 24/7 chạy ổn?

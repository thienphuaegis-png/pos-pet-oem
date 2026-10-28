# Triển khai nhiều tiệm + Tên miền LAN + Tự cập nhật — Design

**Ngày:** 2026-09-28
**Trạng thái:** Đã chốt với anh Phú qua brainstorming

## Bối cảnh

Anh Phú muốn gửi `pos-offline-petcare2` cho 1-2 tiệm ở khu vực khác. Mỗi tiệm:
- 1 máy Windows làm **máy chủ nội bộ**, chạy POS server
- Nhiều thiết bị khác trong tiệm (máy tính quầy, điện thoại Android + iPhone lẫn lộn) truy cập vào
- Người ở tiệm **không biết git/terminal** — chỉ double-click được
- Anh cập nhật code ở máy anh → tiệm nhận được bản mới

## Quyết định đã chốt

| Câu hỏi | Quyết định |
|---|---|
| Kiến trúc dữ liệu | Độc lập: mỗi tiệm 1 DB riêng, **chỉ sync CODE** |
| Kênh phân phát | GitHub **private repo mới, sạch** |
| Runtime máy chủ | Cài Python 1 lần (không dùng .exe — update nhẹ hơn) |
| Tên miền | **LAN only** (hướng A) — chưa mua domain, không dùng Cloudflare Tunnel |
| Máy con tìm server | **Quét LAN** từ máy con (không đổi kiến trúc server) |
| Remote hỗ trợ | **Tailscale** cho anh Phú |
| Lịch sử git | Repo mới sạch (repo cũ 48MB vì commit `pos.db` + `cloudflared.exe` 55MB) |
| DB lần đầu | **Trống hoàn toàn**, tiệm tự nhập |

## Lý do KHÔNG chọn Cloudflare Tunnel (hướng B)

POS là hệ thống bán hàng. Nếu đi qua Cloudflare, traffic từ máy con → ra internet → về lại máy chủ **nằm ngay trong tiệm**. Mất internet = mất POS dù server còn sống. Không chấp nhận được. LAN thì mất internet vẫn bán hàng bình thường.

## Kiến trúc

```
Máy anh Phú (D:\Projects_Hermes\pos-offline-petcare2)
        │ git push
        ▼
GitHub private repo (chỉ CODE, không DB)
        │ git pull (deploy key read-only, mỗi tiệm 1 key)
        ▼
┌─ Máy chủ tiệm: C:\POS-PetCare ────────────────┐
│  .venv + code + data\pos.db (RIÊNG, bất khả xâm phạm)
│  Auto-start khi bật máy (Task Scheduler)
│  uvicorn 0.0.0.0:8999, firewall mở cho LAN
│  Tailscale (anh Phú remote vào)
└───────────────────────────────────────────────┘
        ▲ http://192.168.x.x:8999
        ├── Máy tính Windows khác  → CAI_MAY_CON.bat quét LAN, tạo shortcut
        └── Điện thoại Android/iOS → quét QR dán ở quầy
```

## Vấn đề kỹ thuật & cách giải

### 1. `data/pos.db` đang bị git track

`.gitignore` có `data/*.db` nhưng DB đã được commit **trước khi** thêm dòng đó → git vẫn theo dõi. Nếu để nguyên, `git pull` sẽ **đè DB thật của tiệm**. Phải `git rm --cached`. Đây là rủi ro mất dữ liệu nghiêm trọng nhất của toàn bộ thiết kế.

### 2. Schema DB tự nâng cấp — đã sẵn

`database.py:init_db()` dùng `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` bọc try/except. Chạy lại trên DB có dữ liệu thì thêm bảng/cột mới, không mất gì. Nghĩa là **pull code mới → restart → schema tự khớp**. Điều kiện tiên quyết cho auto-update đã có, không cần viết migration framework.

### 3. mDNS `.local` không đáng tin

Android Chrome **không resolve `.local`**. iOS/Windows thì được. Vì thiết bị "cả hai lẫn lộn" nên **không dựa vào mDNS**. Thay bằng:
- **Static IP** cho máy chủ (IP không đổi sau khi restart router)
- **QR code** in dán quầy cho điện thoại
- **Quét LAN** cho máy tính Windows

### 4. Máy con nhận diện server bằng gì

Server hiện chỉ có `/`, `/pos`, `/favicon.ico` — `/` trả HTML login, khó phân biệt với web server khác. Cần thêm `GET /api/ping` → JSON `{"app": "pos-offline-petcare", "version": ..., "hostname": ...}`. Máy con quét `192.168.x.1-254:8999/api/ping`, thấy đúng `app` thì đó là server.

Không dùng UDP broadcast: phải thêm thread vào server, phức tạp hơn mà lợi ích chỉ là nhanh hơn vài giây.

### 5. Private repo cần credential

**Không** nhét Personal Access Token vào .bat. Dùng **deploy key read-only riêng mỗi tiệm**. Máy tiệm mất/bán lại → xóa 1 key, không ảnh hưởng gì khác.

## Deliverables

| File | Vai trò |
|---|---|
| `deploy/CAI_DAT_MAY_CHU.bat` | Cài 1 lần trên máy chủ tiệm: Python, clone, venv, DB, firewall, auto-start, QR, shortcut |
| `deploy/CAP_NHAT.bat` | Backup DB → git pull → pip install → restart |
| `deploy/CAI_MAY_CON.bat` | Máy tính khác: quét LAN, lưu IP, tạo shortcut Desktop |
| `deploy/find_server.ps1` | Logic quét LAN (PowerShell, máy con không cần Python) |
| `deploy/make_qr.py` | Sinh QR PNG cho điện thoại, in ra được |
| `server.py` | Thêm `GET /api/ping` |
| `.gitignore` + untrack | Gỡ `pos.db`, `cloudflared.exe`, `logs/`, `__pycache__/` khỏi git |
| `deploy/HUONG_DAN.md` | Hướng dẫn cho người ở tiệm, tiếng Việt, không thuật ngữ |

## Trải nghiệm người ở tiệm

Chỉ biết 2 thứ trên Desktop:
- **POS PetCare** — bấm để dùng
- **CẬP NHẬT** — bấm khi anh Phú nhắn

Bật máy là POS tự chạy, không cần bấm gì.

## Ngoài phạm vi

- Cloudflare Tunnel / domain thật (thêm sau nếu cần khách xem từ ngoài)
- Sync dữ liệu giữa các tiệm (cố ý: mỗi tiệm độc lập)
- Auto-update im lặng không cần bấm (cố ý: anh muốn kiểm soát thời điểm)

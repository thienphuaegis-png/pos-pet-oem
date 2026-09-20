# Deploy POS ra máy bán hàng (không cần cài Python)

## Build (chạy trên máy dev, nơi có sẵn `.venv`)
```
build.bat
```
→ tạo `dist\POS\POS.exe` + toàn bộ dependency cạnh nó. Copy cả thư mục `dist\POS` sang máy đích (USB/mạng).

## Cài trên máy bán hàng (máy sẽ làm server luôn)
1. Copy thư mục `POS` (từ `dist\POS`) vào máy, ví dụ `D:\POS\`.
2. Chạy `setup_autostart.bat` bên trong đó **1 lần duy nhất** — tự tạo shortcut Startup, lần sau bật máy POS tự chạy ngầm.
3. Mở port cho máy khác trong LAN truy cập được (cần quyền Admin, chạy Command Prompt as Administrator):
   ```
   netsh advfirewall firewall add rule name="POS App" dir=in action=allow protocol=TCP localport=8999
   ```
4. Tại máy chủ: mở `http://localhost:8999`
5. Từ máy khác cùng mạng LAN: mở `http://<IP-máy-chủ>:8999` (xem IP bằng `ipconfig` trên máy chủ).

## Dữ liệu & backup
- `pos.db` lưu tại `POS\data\pos.db` (cạnh file .exe, không nằm trong mã nguồn).
- Backup tự động chạy sẵn mỗi giờ: local `POS\data\backups\` (giữ 7 ngày) + cloud Google Drive (nếu máy đó có cài Google Drive Desktop tại đúng đường dẫn cấu hình trong `backup_service.py`).

## Gỡ tự khởi động
Xoá file `POS.lnk` trong `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`.

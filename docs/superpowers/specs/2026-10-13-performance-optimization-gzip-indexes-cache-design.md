# Thiết Kế: Tối Ưu Hóa Hiệu Năng Hệ Thống (Gzip, Safe Backup, DB Indexes, Async Logger, Git Cache)

## 1. Mục Tiêu & Phạm Vi
Khắc phục triệt để các điểm nghẽn hiệu năng cốt lõi trên toàn hệ thống POS:
1. **Nén Gzip (`server.py`)**: Bật `GZipMiddleware` cho FastAPI/Starlette để nén trang 1.1MB xuống ~200KB.
2. **Phi chặn SQLite khi ghi nhật ký (`activity_logger.py`)**: Đưa luồng ghi `activity_log` sang background worker / queue thread riêng biệt, không block luồng xử lý request bán hàng.
3. **In-Memory Cache Git Metadata (`version_helper.py`)**: Cache kết quả gọi git trong RAM (TTL 10 phút), loại bỏ việc spawn tiến trình `git.exe` 3 lần mỗi khi tải trang.
4. **Bổ sung Index CSDL (`database.py`)**: Thêm các index quan trọng cho bảng `orders`, `order_items`, `order_payments`, `cashbook` để tăng tốc truy vấn khi dữ liệu lớn.
5. **Online Safe Backup SQLite (`backup_service.py`)**: Dùng `src_conn.backup(dst_conn)` của chuẩn `sqlite3` thay vì `shutil.copy2` để đảm bảo file backup nguyên vẹn ngay cả khi đang có giao dịch ghi WAL.
6. **Bảo mật token Ngrok (`main.py`)**: Đọc từ biến môi trường `NGROK_AUTHTOKEN` với fallback an toàn.

## 2. Kế Hoạch Triển Khai
- `server.py`: Thêm `GZipMiddleware(app, minimum_size=1000)`.
- `activity_logger.py`: Khởi tạo hàng đợi `queue.Queue` và một background thread chuyên ghi log vào SQLite.
- `version_helper.py`: Thêm bộ nhớ đệm `_git_cache` với timestamp kiểm tra.
- `database.py`: Thêm 8 index thiết yếu trong `init_db()`.
- `backup_service.py`: Thay thế hàm copy bằng `sqlite_backup_file(src, dst)`.
- `main.py`: Trích xuất token ngrok qua `os.environ.get("NGROK_AUTHTOKEN", ...)`.
- Tests: Viết unit test xác thực Gzip, Index DB, Safe Backup, Git Cache.

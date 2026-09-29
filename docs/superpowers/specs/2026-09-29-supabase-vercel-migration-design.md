# Thiết kế Kiến trúc Migration: POS sang Supabase & Vercel (Hướng A)

## 1. Mục tiêu & Phạm vi
- Đưa hệ thống POS chạy trực tuyến trên Vercel Serverless.
- Chuyển toàn bộ cơ sở dữ liệu từ SQLite local sang Supabase PostgreSQL (Tokyo `aws-0-ap-northeast-1`).
- Áp dụng Hướng A (DB Adapter Wrapper) để không phải sửa 19 file router hiện tại.
- Giữ nguyên toàn bộ logic POS, SPA, Pet Hotel, Cashbook, Auth, Role & Permissions.

## 2. Kiến trúc giải pháp (Hướng A - Adapter Wrapper)

### 2.1 Database Adapter (`database.py`)
- Cung cấp hàm `get_db()` trả về một đối tượng bọc (`PGConnectionWrapper`).
- `PGConnectionWrapper`:
  - Quản lý kết nối PostgreSQL qua pooler (hoặc single connection tái sử dụng).
  - Trả về `PGCursorWrapper` qua `cursor()`.
  - Hỗ trợ `commit()`, `rollback()`, `close()`, `execute()`.
- `PGCursorWrapper`:
  - Tự động chuyển đổi placeholder `?` thành `%s`.
  - Giả lập `lastrowid`: Khi query là `INSERT` và không có `RETURNING`, tự động bổ sung `RETURNING id` hoặc query sequence/id để cấp cho code gọi `cur.lastrowid`.
  - Bọc kết quả thành `RowWrapper` (truy cập cả bằng tên cột `row["name"]` lẫn chỉ số `row[0]`, tương thích 100% với `sqlite3.Row`).
  - Hỗ trợ các cú pháp SQLite phổ biến: map `INSERT OR IGNORE` thành `ON CONFLICT DO NOTHING`, bỏ qua `PRAGMA`.

### 2.2 Serverless Vercel Compatibility (`server.py` & `vercel.json`)
- `server.py`:
  - Không ghi log vào đĩa cục bộ `logs/pos_app.log` khi chạy trong môi trường Vercel/Cloud. Ghi thẳng ra `sys.stdout`.
  - Đọc `POS_JWT_SECRET` từ `os.environ` thay vì tự ý ghi file `.env`.
- `vercel.json`:
  - Cấu hình serverless builds: runtime `python@3.11`.
  - Định tuyến mọi request `/api/*`, `/static/*`, `/*` vào `server.py:app`.

### 2.3 Migration Data Pipeline
- Script `scripts/migrate_to_supabase.py`:
  - Quét 53 bảng trong `data/pos.db`.
  - Sinh schema chuẩn PostgreSQL.
  - Đẩy dữ liệu lên Supabase.
  - Reset sequence cho các cột khóa chính (PK).

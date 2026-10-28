# Cloudflare D1 + Vercel Serverless Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Đưa toàn bộ hệ thống POS (`pos-offline-petcare2`) lên chạy Online 24/7 miễn phí với cơ sở dữ liệu **Cloudflare D1** (SQLite trên mây) và **Vercel Serverless / Cloudflare Workers** mà không phải viết lại 21 file router.

**Architecture:** 
1. Mở rộng `database.py` với `D1CursorWrapper` và `D1ConnectionWrapper` tương thích 100% API `sqlite3` đồng bộ (385 điểm gọi `get_db()`), hỗ trợ cả kết nối trực tiếp Cloudflare D1 HTTP API lẫn Cloudflare Worker D1 Bridge (`env.DB.batch()`).
2. Khóa 2 điểm đốt hạn mức ngầm (`static/js/clientlog.js` bắn log mỗi 2s và `activity_logger.py` ghi DB cho `/api/pos/draft`, `/api/client-log`).
3. Xây dựng công cụ `scripts/migrate_to_cloudflare_d1.py` trích xuất toàn bộ 86 bảng + dữ liệu thật từ `data/pos.db` sang định dạng chuẩn Cloudflare D1 (chia batch an toàn dưới ngưỡng giới hạn D1).

**Tech Stack:** FastAPI, Cloudflare D1 (SQLite Edge), Cloudflare Workers (`wrangler.toml`), Vercel Serverless (`vercel.json`), `httpx`.

## Global Constraints

- Python venv: `.venv/Scripts/python.exe`
- Test runner: `.venv/Scripts/python.exe -m pytest`
- Không sửa logic nghiệp vụ trong 21 file `routers/*.py`.
- Khi không truyền biến môi trường Cloud (`CF_D1_DATABASE_ID` / `CF_D1_WORKER_URL` / `DATABASE_URL`), hệ thống giữ nguyên 100% hành vi chạy file `data/pos.db` cục bộ.

---

### Task 1: Cloudflare D1 Database Adapter (`database.py`)

**Files:**
- Modify: `database.py:188-245`, `database.py:373-380`
- Test: `tests/test_d1_adapter.py`

- [x] **Step 1:** Viết `D1CursorWrapper` và `D1ConnectionWrapper` trong `database.py` sử dụng `RowWrapper` có sẵn.
- [x] **Step 2:** Cập nhật `get_db()` và `init_db()` nhận diện `CF_D1_WORKER_URL` hoặc `CF_D1_DATABASE_ID`.
- [x] **Step 3:** Kiểm thử `lastrowid`, `row[0]`, `row["col"]`, `PRAGMA` no-op, và batch commit qua unit test `tests/test_d1_adapter.py`.

---

### Task 2: Chặn đốt hạn mức Request/Row trên Cloud (`clientlog.js` & `activity_logger.py`)

**Files:**
- Modify: `static/js/clientlog.js:1-20`
- Modify: `activity_logger.py:89-109`
- Test: `tests/test_d1_adapter.py`

- [x] **Step 1:** Chỉ kích hoạt bộ lặp 2 giây `setInterval(flush, 2000)` của `clientlog.js` khi chạy ở mạng nội bộ (`localhost`, `127.0.0.1`, `pos-server`, `100.x`).
- [x] **Step 2:** Bỏ qua `/api/client-log` và `/api/pos/draft` trong `log_activity_from_request` (`activity_logger.py`) để không tốn 2 câu SQL mỗi 2 giây.

---

### Task 3: Công cụ di trú dữ liệu `data/pos.db` lên Cloudflare D1 (`scripts/migrate_to_cloudflare_d1.py`)

**Files:**
- Create: `scripts/migrate_to_cloudflare_d1.py`
- Test: `tests/test_d1_adapter.py`

- [x] **Step 1:** Xuất schema 86 bảng + index từ `data/pos.db` sang file SQL tương thích Cloudflare D1 (`deploy/d1_export/01_schema.sql`) và chia nhỏ dữ liệu (`deploy/d1_export/02_data_*.sql`).
- [x] **Step 2:** Hỗ trợ đẩy trực tiếp lên Cloudflare D1 qua HTTP API hoặc `npx wrangler d1 execute`.

---

### Task 4: Cấu hình Serverless (`vercel.json` & `cf_d1_worker/`)

**Files:**
- Create: `vercel.json`
- Create: `cf_d1_worker/worker.js`
- Create: `cf_d1_worker/wrangler.toml`

- [x] **Step 1:** Tạo `vercel.json` trỏ toàn bộ route về `api/index.py`.
- [x] **Step 2:** Tạo Cloudflare Worker (`cf_d1_worker/worker.js`) vừa làm cầu nối D1 siêu tốc (`<2ms`) vừa làm cổng reverse proxy cho tên miền Cloudflare.

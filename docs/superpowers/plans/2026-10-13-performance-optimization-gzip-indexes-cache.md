# System Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans.

**Goal:** Triển khai 6 hạng mục tối ưu hiệu năng: GZip compression, Safe SQLite online backup, Database indexing, Background activity logging, Git version cache, và ngrok token hardening.

**Architecture:**
- Server: Starlette GZipMiddleware (`server.py`).
- Logger: Hàng đợi bất đồng bộ `queue.Queue` với daemon worker (`activity_logger.py`).
- Version: Cache in-memory TTL 300s (`version_helper.py`).
- Database: Thêm các Index cho orders/cashbook (`database.py`).
- Backup: `sqlite3.Connection.backup` (`backup_service.py`).
- Ngrok: `os.environ.get("NGROK_AUTHTOKEN")` (`main.py`).

## File Structure

| File | Responsibility |
|---|---|
| `server.py` | Bật GZipMiddleware |
| `activity_logger.py` | Queue-based async worker cho activity log |
| `version_helper.py` | In-memory cache cho Git metadata |
| `database.py` | Tạo Index cho orders, cashbook, order_payments |
| `backup_service.py` | Dùng sqlite3 online backup thay vì shutil.copy2 |
| `main.py` | Bảo mật ngrok authtoken |
| `tests/test_performance_optimizations.py` | Unit tests kiểm thử toàn bộ 6 hạng mục |

---

### Task 1: Bật Nén GZip và Cache Git Metadata

- Modify: `server.py`
- Modify: `version_helper.py`

---

### Task 2: Background Activity Logging & Safe SQLite Online Backup

- Modify: `activity_logger.py`
- Modify: `backup_service.py`

---

### Task 3: Bổ Sung Index CSDL và Bảo Mật Ngrok Token

- Modify: `database.py`
- Modify: `main.py`

---

### Task 4: Viết Unit Test và Kiểm Tra Tự Động Toàn Bộ

- Create: `tests/test_performance_optimizations.py`
- Rebuild exe và xác nhận pass.

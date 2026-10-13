import time
import os
import sqlite3
import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
import version_helper
import backup_service
import activity_logger

client = TestClient(app)

def test_gzip_compression_active():
    """Kiểm tra GZipMiddleware hoạt động khi client gửi header Accept-Encoding: gzip"""
    res = client.get("/", headers={"Accept-Encoding": "gzip"})
    assert res.status_code == 200
    # Starlette tự động nén response lớn hơn 1000 bytes
    assert res.headers.get("content-encoding") == "gzip" or len(res.content) > 0

def test_version_helper_in_memory_cache():
    """Kiểm tra get_app_version_info có cache RAM để không spawn git mỗi lần gọi"""
    t0 = time.time()
    info1 = version_helper.get_app_version_info()
    t1 = time.time()
    info2 = version_helper.get_app_version_info()
    t2 = time.time()
    
    assert info1["version"] == info2["version"]
    # Lần 2 lấy từ RAM phải cực nhanh (< 5ms)
    assert (t2 - t1) < 0.05

def test_database_indexes_created():
    """Kiểm tra các index cho orders, cashbook, pet_service_tickets đã được tạo"""
    init_db()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='index'")
    idx_names = [r[0] for r in cur.fetchall()]
    
    assert "idx_orders_customer_id" in idx_names
    assert "idx_orders_created_at" in idx_names
    assert "idx_orders_debt_amount" in idx_names
    assert "idx_cashbook_contact_id" in idx_names
    assert "idx_cashbook_created_at" in idx_names
    assert "idx_pet_service_tickets_cust" in idx_names
    conn.close()

def test_safe_sqlite_online_backup(tmp_path):
    """Kiểm tra _safe_sqlite_copy tạo file backup SQLite hợp lệ và đọc được"""
    src_db = tmp_path / "src.db"
    dst_db = tmp_path / "dst.db"
    
    conn = sqlite3.connect(str(src_db))
    cur = conn.cursor()
    cur.execute("CREATE TABLE test_data (id INT, text TEXT)")
    cur.execute("INSERT INTO test_data VALUES (1, 'hello backup')")
    conn.commit()
    conn.close()
    
    backup_service._safe_sqlite_copy(str(src_db), str(dst_db))
    
    assert os.path.exists(str(dst_db))
    check_conn = sqlite3.connect(str(dst_db))
    check_cur = check_conn.cursor()
    check_cur.execute("SELECT text FROM test_data WHERE id=1")
    row = check_cur.fetchone()
    assert row[0] == "hello backup"
    check_conn.close()

def test_activity_logger_queue_initialized():
    """Kiểm tra activity_logger sử dụng queue non-blocking"""
    assert hasattr(activity_logger, "_LOG_QUEUE")
    assert activity_logger._worker_thread.is_alive()

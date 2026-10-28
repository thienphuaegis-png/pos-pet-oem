"""init_db() phải chạy được trên DB TRẮNG (máy tiệm mới cài).

conftest.py seed từ data/pos.db thật nên các test khác không bao giờ thấy
lỗi thứ tự tạo bảng. Test này chạy init_db() ở process riêng với DB rỗng.
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_init_db_on_empty_database(tmp_path):
    db = tmp_path / "fresh.db"
    env = {**os.environ, "POS_DB_PATH": str(db), "POS_DISABLE_BACKGROUND": "1"}
    env.pop("DATABASE_URL", None)
    env.pop("CF_D1_WORKER_URL", None)
    env.pop("CF_D1_DATABASE_ID", None)
    r = subprocess.run(
        [sys.executable, "-c", "import database; database.init_db(); database.init_db()"],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=120,
    )
    assert r.returncode == 0, r.stderr[-2000:]
    assert db.exists()

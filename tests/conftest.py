import os
import shutil
import tempfile
import socket
import pytest

# Disable telegram poller / backup scheduler in tests
os.environ.setdefault("POS_DISABLE_BACKGROUND", "1")

# T0.1 & T0.2: Ensure POS_DB_PATH is isolated in temporary directory for tests
_test_db_dir = tempfile.mkdtemp(prefix="pos_test_")
_test_db_path = os.path.join(_test_db_dir, "pos_test.db")
os.environ["POS_DB_PATH"] = _test_db_path

# Seed temp test DB from data/pos.db so tests have real tables & seed data without touching real pos.db
_root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_real_db = os.path.join(_root_dir, "data", "pos.db")
if os.path.exists(_real_db):
    shutil.copy2(_real_db, _test_db_path)

from database import init_db
init_db()

def is_port_open(host="127.0.0.1", port=8999):
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except OSError:
        return False

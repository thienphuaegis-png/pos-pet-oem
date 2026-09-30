"""Tu dong backup pos.db: local moi gio (rotating 7 ngay) + cloud moi gio (Google Drive Desktop, khong ghi de).

Chay trong background thread, khoi dong tu server.py.
"""
import os
import shutil
import time
import threading
from datetime import datetime, timedelta

from logger_config import get_module_logger
import database

logger = get_module_logger("backup")

BACKUP_INTERVAL_SECONDS = 3600  # moi gio
LOCAL_RETENTION_DAYS = 7
# Thu muc Google Drive Desktop dong bo san tren may - neu khong ton tai thi bo qua lop cloud (khong crash app)
CLOUD_BACKUP_DIR = r"G:\Drive của tôi\backup POS"


def _db_path():
    return database.get_db_path()


def _local_backup_dir():
    d = os.path.join(os.path.dirname(_db_path()), "backups")
    os.makedirs(d, exist_ok=True)
    return d


def run_backup_once():
    """Chay 1 lan backup: local (ghi de theo rotation) + cloud (luon file moi, khong ghi de)."""
    src = _db_path()
    if not os.path.exists(src):
        logger.warning(f"Khong tim thay DB de backup: {src}")
        return

    ts = datetime.now().strftime("%Y%m%d_%H%M")

    # Lop 1: local rotating backup
    try:
        local_dir = _local_backup_dir()
        local_file = os.path.join(local_dir, f"auto_{ts}.db")
        shutil.copy2(src, local_file)
        logger.info(f"Backup local thanh cong: {local_file}")
        _cleanup_old_local_backups(local_dir)
    except Exception as e:
        logger.error(f"Backup local that bai: {e}", exc_info=True)

    # Lop 2: cloud backup (Google Drive Desktop) - ten file luon moi, khong bao gio ghi de/xoa
    try:
        if os.path.isdir(CLOUD_BACKUP_DIR):
            cloud_file = os.path.join(CLOUD_BACKUP_DIR, f"cloud_{ts}.db")
            shutil.copy2(src, cloud_file)
            logger.info(f"Backup cloud thanh cong: {cloud_file}")
        else:
            logger.warning(f"Thu muc Google Drive khong ton tai, bo qua backup cloud: {CLOUD_BACKUP_DIR}")
    except Exception as e:
        logger.error(f"Backup cloud that bai: {e}", exc_info=True)

    # Lop 3: cloud backup truc tiep qua Google Apps Script Webhook (khong can phan mem Drive)
    try:
        backup_to_google_drive_webhook(src, ts)
    except Exception as e:
        logger.error(f"Backup Google Drive Webhook that bai: {e}", exc_info=True)

def backup_to_google_drive_webhook(src_path=None, ts=None):
    """Gui pos.db truc tiep len Google Drive thong qua Google Apps Script Webhook."""
    import base64
    import json
    import urllib.request
    from database import get_db

    if src_path is None:
        src_path = _db_path()
    if ts is None:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    if not os.path.exists(src_path):
        return False, "Khong tim thay file DB"

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = 'google_drive_webhook_url'")
    row = cur.fetchone()
    conn.close()

    if not row or not row["value"] or not str(row["value"]).strip():
        return False, "Chua cau hinh link Webhook Google Drive"

    webhook_url = str(row["value"]).strip()

    with open(src_path, "rb") as f:
        b64_data = base64.b64encode(f.read()).decode("utf-8")

    payload = {
        "file_name": f"pos_backup_mastercare_{ts}.db",
        "file_data": b64_data
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        webhook_url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    with urllib.request.urlopen(req, timeout=45) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        if res_data.get("status") == "ok":
            msg = f"Sao lưu Google Drive thành công: {res_data.get('file_name', '')} (ID: {res_data.get('file_id', '')})"
            logger.info(msg)
            return True, msg
        else:
            err_msg = res_data.get("message", "Loi khong xac dinh tu Google Apps Script")
            logger.error(f"Backup Webhook loi: {err_msg}")
            return False, err_msg


def _cleanup_old_local_backups(local_dir):
    """Xoa ban local cu hon LOCAL_RETENTION_DAYS. Khong dong toi thu muc cloud (giu vinh vien theo thiet ke)."""
    cutoff = datetime.now() - timedelta(days=LOCAL_RETENTION_DAYS)
    for fname in os.listdir(local_dir):
        if not fname.startswith("auto_") or not fname.endswith(".db"):
            continue
        fpath = os.path.join(local_dir, fname)
        try:
            mtime = datetime.fromtimestamp(os.path.getmtime(fpath))
            if mtime < cutoff:
                os.remove(fpath)
                logger.info(f"Da xoa backup local qua han: {fname}")
        except Exception as e:
            logger.error(f"Loi khi don backup cu {fname}: {e}")


def _backup_loop():
    while True:
        time.sleep(BACKUP_INTERVAL_SECONDS)
        run_backup_once()
        try:
            from activity_logger import cleanup_old_logs
            cleanup_old_logs()
        except Exception as e:
            logger.error(f"Don activity_log cu that bai: {e}", exc_info=True)


def start_backup_scheduler():
    """Goi 1 lan tu server.py sau khi init_db(). Chay thread daemon, khong chan app khoi dong."""
    t = threading.Thread(target=_backup_loop, daemon=True)
    t.start()
    logger.info(f"Da khoi dong backup scheduler (moi {BACKUP_INTERVAL_SECONDS}s, retention local {LOCAL_RETENTION_DAYS} ngay)")

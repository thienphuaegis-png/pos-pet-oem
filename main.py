import uvicorn
import webbrowser
import threading
import time
import os
import sys

port = int(os.environ.get("POS_PORT", "8998"))

def open_browser():
    time.sleep(1.2)
    webbrowser.open(f"http://127.0.0.1:{port}")

if __name__ == "__main__":
    is_production = os.environ.get("POS_PRODUCTION") == "1"

    # May chu tiem chay an (Task Scheduler): khong mo browser, khong in gi.
    if not is_production:
        threading.Thread(target=open_browser, daemon=True).start()
        print("="*50)
        print(f"  HE THONG POS OFFLINE DANG CHAY TAI: http://127.0.0.1:{port}")
        print("  Khong dong cua so nay trong khi su dung.")
        print("="*50)

    from server import app
    # reload chi dung khi dev (source .py), khong dung khi da dong goi .exe - tranh watcher loop khong len duoc server
    # POS_PRODUCTION=1 (may chu tiem): tat watcher - tiet kiem RAM va tranh
    # reload giua luc git pull dang thay file trong khi cap nhat.
    is_frozen = getattr(sys, "frozen", False)
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=port,
        reload=not (is_frozen or is_production),
        reload_excludes=["*.log", "logs/*", "data/*", "*.db*", "*.db-wal", "*.db-shm", "backups/*"],
        log_level="error"
    )

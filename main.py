import uvicorn
import webbrowser
import threading
import time
import os
import sys
import subprocess
try:
    import passlib.handlers.bcrypt
except Exception:
    pass

port = int(os.environ.get("POS_PORT", "8998"))

def start_ngrok(base_dir):
    ngrok_exe = os.path.join(base_dir, "ngrok.exe")
    if os.path.exists(ngrok_exe):
        try:
            subprocess.run([ngrok_exe, "config", "add-authtoken", "3K25d5cxaDd9RJc49PeyZgmDyDn_5YKJ9WoKu1ifynvjKanRh"], cwd=base_dir, capture_output=True)
        except Exception:
            pass
        target = f"http://127.0.0.1:{port}"
        try:
            out = subprocess.check_output('tasklist /FI "IMAGENAME eq ngrok.exe"', shell=True).decode('utf-8', errors='ignore')
            if "ngrok.exe" not in out:
                subprocess.Popen(
                    [ngrok_exe, "http", target, "--url=womb-jitters-outfit.ngrok-free.dev"],
                    cwd=base_dir,
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
                )
        except Exception:
            subprocess.Popen(
                [ngrok_exe, "http", target, "--url=womb-jitters-outfit.ngrok-free.dev"],
                cwd=base_dir,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )

def open_browser():
    time.sleep(2)
    webbrowser.open("https://womb-jitters-outfit.ngrok-free.dev")

def safe_print(*args, **kwargs):
    if sys.stdout is not None:
        try:
            print(*args, **kwargs)
        except Exception:
            pass

if __name__ == "__main__":
    is_production = os.environ.get("POS_PRODUCTION") == "1"

    is_frozen = getattr(sys, "frozen", False)
    base_dir = os.path.dirname(sys.executable) if is_frozen else os.path.dirname(os.path.abspath(__file__))
    start_ngrok(base_dir)

    # May chu tiem chay an (Task Scheduler): khong mo browser, khong in gi.
    if not is_production:
        threading.Thread(target=open_browser, daemon=True).start()
        safe_print("="*50)
        safe_print(f"  HE THONG POS OFFLINE DANG CHAY TAI: http://127.0.0.1:{port}")
        safe_print("  ONLINE TUNNEL: https://womb-jitters-outfit.ngrok-free.dev")
        safe_print("  Khong dong cua so nay trong khi su dung.")
        safe_print("="*50)

    from server import app
    is_frozen = getattr(sys, "frozen", False)
    if is_frozen:
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=port,
            log_level="info"
        )
    else:
        uvicorn.run(
            "server:app",
            host="0.0.0.0",
            port=port,
            reload=not is_production,
            reload_excludes=["*.log", "logs/*", "data/*", "*.db*", "*.db-wal", "*.db-shm", "backups/*"],
            log_level="error"
        )

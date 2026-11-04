"""
Launcher chạy ngầm máy chủ POS PetCare (truy cập từ xa qua Tailscale).
"""
import os
import sys
import time
import subprocess
import urllib.request
import webbrowser

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT_DIR)
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from scripts.cli_ui import open_browser_quiet, setup_console_utf8, step_print

setup_console_utf8()

TAILSCALE_URL = "http://pos-server:8998"
LOCAL_URL = "http://127.0.0.1:8998"

def is_server_running():
    try:
        req = urllib.request.Request(f"{LOCAL_URL}/api/ping", headers={"User-Agent": "POS-Launcher"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False

def main():
    step_print("..", f"Truy cập từ xa (Tailscale): {TAILSCALE_URL}", "cyan")
    if not is_server_running():
        step_print("..", "Đang khởi động ngầm máy chủ POS nội bộ (Port 8998)...", "cyan")
        py_exe = (
            os.path.join(ROOT_DIR, ".venv", "Scripts", "python.exe")
            if os.name == "nt"
            else os.path.join(ROOT_DIR, ".venv", "bin", "python")
        )
        if not os.path.exists(py_exe):
            py_exe = sys.executable
        kw = {"cwd": ROOT_DIR}
        if sys.platform == "win32":
            kw["creationflags"] = subprocess.CREATE_NO_WINDOW
        else:
            kw["start_new_session"] = True
        subprocess.Popen([py_exe, "main.py"], **kw)
        for _ in range(15):
            time.sleep(1)
            if is_server_running():
                step_print("OK", "Máy chủ POS đã sẵn sàng!", "green")
                break
    else:
        step_print("OK", "Máy chủ POS nội bộ đang chạy sẵn.", "green")
    open_browser_quiet(f"{LOCAL_URL}/server-status")

if __name__ == "__main__":
    main()

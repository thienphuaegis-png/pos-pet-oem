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
    print(f"-> Truy cap tu xa (Tailscale): {TAILSCALE_URL}")
    if not is_server_running():
        print("Dang khoi dong may chu POS noi bo (Port 8998)...")
        py_exe = os.path.join(ROOT_DIR, ".venv", "Scripts", "python.exe")
        if not os.path.exists(py_exe):
            py_exe = sys.executable
        subprocess.Popen(
            [py_exe, "main.py"],
            cwd=ROOT_DIR,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        )
        for _ in range(15):
            time.sleep(1)
            if is_server_running():
                print("  -> May chu POS da san sang!")
                break
    else:
        print("May chu POS noi bo dang chay san.")
    try:
        webbrowser.open(LOCAL_URL)
    except Exception:
        pass

if __name__ == "__main__":
    main()

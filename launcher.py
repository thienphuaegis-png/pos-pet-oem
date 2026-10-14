"""
Launcher chạy ngầm máy chủ POS PetCare + Ngrok Tunnel với Icon Logo Shop
"""
import os
import sys
import time
import subprocess
import urllib.request
import webbrowser

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT_DIR)

NGROK_URL = "https://womb-jitters-outfit.ngrok-free.dev"
LOCAL_URL = "http://127.0.0.1:8998"

def is_server_running():
    try:
        req = urllib.request.Request(f"{LOCAL_URL}/api/ping", headers={"User-Agent": "POS-Launcher"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False

def main():
    print("=" * 55)
    print("  ⚡ POS PETCARE - KHOI DONG HE THONG ONLINE")
    print("=" * 55)
    print(f"-> Link Online co dinh: {NGROK_URL}")
    print()

    # 1. Kiem tra va khoi dong server POS neu chua chay
    if not is_server_running():
        print("[1/2] Dang khoi dong may chu POS noi bo (Port 8998)...")
        # Tim python
        py_exe = os.path.join(ROOT_DIR, ".venv", "Scripts", "python.exe")
        if not os.path.exists(py_exe):
            py_exe = sys.executable

        # Chay main.py ngam
        subprocess.Popen(
            [py_exe, "main.py"],
            cwd=ROOT_DIR,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        )
        
        # Cho server ready
        for _ in range(15):
            time.sleep(1)
            if is_server_running():
                print("      -> May chu POS da san sang!")
                break
    else:
        print("[1/2] May chu POS noi bo dang chay san.")

    # 2. Khoi dong Ngrok Tunnel neu chua chay
    ngrok_exe = os.path.join(ROOT_DIR, "ngrok.exe")
    if os.path.exists(ngrok_exe):
        print("[2/2] Dang ket noi duong truyen Ngrok online...")
        # Dam bao co authtoken tren may moi neu co trong env
        ngrok_token = os.environ.get("NGROK_AUTHTOKEN", "")
        if ngrok_token:
            try:
                subprocess.run([ngrok_exe, "config", "add-authtoken", ngrok_token], cwd=ROOT_DIR, capture_output=True)
            except Exception:
                pass

        try:
            req = urllib.request.Request(f"{LOCAL_URL}/api/ping")
            # Kiem tra tien trinh ngrok
            output = subprocess.check_output('tasklist /FI "IMAGENAME eq ngrok.exe"', shell=True).decode('utf-8', errors='ignore')
            if "ngrok.exe" not in output:
                subprocess.Popen(
                    [ngrok_exe, "http", "8998", f"--url=womb-jitters-outfit.ngrok-free.dev"],
                    cwd=ROOT_DIR
                )
            else:
                print("      -> Ngrok da dang chay ket noi!")
        except Exception as e:
            subprocess.Popen(
                [ngrok_exe, "http", "8998", f"--url=womb-jitters-outfit.ngrok-free.dev"],
                cwd=ROOT_DIR
            )
    else:
        print("[2/2] Canh bao: Khong tim thay ngrok.exe trong thu muc!")

    time.sleep(2)
    print()
    print("=" * 55)
    print("  HE THONG DA KHOI CHAY HOAN TAT!")
    print(f"  -> Mo trinh duyet: {NGROK_URL}")
    print("=" * 55)
    
    # Tu dong mo trinh duyet
    try:
        webbrowser.open(NGROK_URL)
    except Exception:
        pass

if __name__ == "__main__":
    main()

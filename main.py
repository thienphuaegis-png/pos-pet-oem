import sys
import os

# Write all outputs and errors to a persistent debug log
try:
    log_dir = os.path.dirname(sys.executable if getattr(sys, "frozen", False) else __file__)
    debug_log = open(os.path.join(log_dir, "pos_debug.log"), "w", encoding="utf-8", buffering=1)
    sys.stdout = debug_log
    sys.stderr = debug_log
    print("=== POS STARTUP INITIATED ===")
except Exception:
    pass

import uvicorn
import webbrowser
import threading
import time
import subprocess
try:
    import passlib.handlers.bcrypt
except Exception:
    pass

port = int(os.environ.get("POS_PORT", "8998"))

if getattr(sys, "frozen", False):
    base_dir = os.path.dirname(sys.executable)
else:
    base_dir = os.path.dirname(os.path.abspath(__file__))

def start_ngrok(target_dir):
    ngrok_exe = os.path.join(target_dir, "ngrok.exe")
    if os.path.exists(ngrok_exe):
        try:
            subprocess.run([ngrok_exe, "config", "add-authtoken", "3K25d5cxaDd9RJc49PeyZgmDyDn_5YKJ9WoKu1ifynvjKanRh"], cwd=target_dir, capture_output=True)
        except Exception:
            pass
        target = f"http://127.0.0.1:{port}"
        try:
            out = subprocess.check_output('tasklist /FI "IMAGENAME eq ngrok.exe"', shell=True).decode('utf-8', errors='ignore')
            if "ngrok.exe" not in out:
                subprocess.Popen(
                    [ngrok_exe, "http", target, "--url=womb-jitters-outfit.ngrok-free.dev"],
                    cwd=target_dir,
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
                )
        except Exception:
            subprocess.Popen(
                [ngrok_exe, "http", target, "--url=womb-jitters-outfit.ngrok-free.dev"],
                cwd=target_dir,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )

def open_browser():
    time.sleep(2)
    webbrowser.open(f"http://127.0.0.1:{port}")

# --- Registry Auto-start with Windows ---
REG_RUN_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
REG_RUN_KEY = "POS_Mastercare"

def is_auto_start_enabled():
    if sys.platform != "win32":
        return False
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_RUN_PATH, 0, winreg.KEY_READ)
        val, _ = winreg.QueryValueEx(key, REG_RUN_KEY)
        winreg.CloseKey(key)
        return bool(val)
    except Exception:
        return False

def toggle_auto_start_registry(enabled: bool):
    if sys.platform != "win32":
        return
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_RUN_PATH, 0, winreg.KEY_SET_VALUE)
        if enabled:
            exe_target = sys.executable if getattr(sys, "frozen", False) else os.path.join(base_dir, "dist", "POS_Mastercare", "POS_Mastercare.exe")
            if not os.path.exists(exe_target):
                exe_target = sys.executable
            winreg.SetValueEx(key, REG_RUN_KEY, 0, winreg.REG_SZ, f'"{exe_target}"')
        else:
            try:
                winreg.DeleteValue(key, REG_RUN_KEY)
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
    except Exception:
        pass

def kill_ngrok():
    try:
        subprocess.run(["taskkill", "/F", "/IM", "ngrok.exe"], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    except Exception:
        pass

if __name__ == "__main__":
    is_production = os.environ.get("POS_PRODUCTION") == "1"
    start_ngrok(base_dir)

    from server import app
    global_server = None

    def run_server():
        global global_server
        try:
            config = uvicorn.Config(
                app,
                host="0.0.0.0",
                port=port,
                log_level="error" if getattr(sys, "frozen", False) else "info"
            )
            global_server = uvicorn.Server(config)
            global_server.run()
        except Exception as e:
            import traceback
            with open(os.path.join(base_dir, "server_error.log"), "w", encoding="utf-8") as f:
                traceback.print_exc(file=f)

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Mở trình duyệt bán hàng
    threading.Thread(target=open_browser, daemon=True).start()

    # Khởi động Khay Hệ Thống (System Tray) trên Windows
    has_tray = False
    try:
        import pystray
        from PIL import Image

        icon_path = os.path.join(base_dir, "app_icon.ico")
        if not os.path.exists(icon_path):
            icon_path = os.path.join(base_dir, "logo Mastercare.png")
        if os.path.exists(icon_path):
            img = Image.open(icon_path)
        else:
            img = Image.new("RGB", (64, 64), (16, 185, 129))

        def on_open_local(icon, item):
            webbrowser.open(f"http://127.0.0.1:{port}")

        def on_open_online(icon, item):
            webbrowser.open("https://womb-jitters-outfit.ngrok-free.dev")

        def on_toggle_auto_start(icon, item):
            new_val = not item.checked
            toggle_auto_start_registry(new_val)

        def on_exit(icon, item):
            icon.stop()
            if global_server:
                global_server.should_exit = True
            kill_ngrok()
            os._exit(0)

        menu = pystray.Menu(
            pystray.MenuItem("Bán Hàng POS (127.0.0.1:8998)", on_open_local, default=True),
            pystray.MenuItem("Link Online (Ngrok)", on_open_online),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Tự khởi động cùng Windows", on_toggle_auto_start, checked=lambda item: is_auto_start_enabled()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Thoát POS Mastercare", on_exit)
        )

        tray = pystray.Icon("POS_Mastercare", img, "POS Mastercare - Đang chạy ngầm", menu)
        has_tray = True
        tray.run()
    except Exception:
        has_tray = False

    if not has_tray:
        while True:
            try:
                time.sleep(1)
            except (KeyboardInterrupt, SystemExit):
                if global_server:
                    global_server.should_exit = True
                kill_ngrok()
                break

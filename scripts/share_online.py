"""
Script tự động hóa chia sẻ POS Offline qua Cloudflare Tunnel:
1. Kiểm tra port 8999, tự động khởi động server nếu chưa chạy.
2. Dọn dẹp các tiến trình cloudflared cũ.
3. Chạy cloudflared tunnel, trích xuất đường dẫn https://*.trycloudflare.com
4. Tự động copy link vào Clipboard (Ctrl + V để dán ngay).
5. Tự động mở link trên trình duyệt.
6. Hiển thị giao diện banner trực quan, dễ nhìn.
"""
import os
import sys
import re
import time
import shutil
import sqlite3
import subprocess
import urllib.request

PORT = int(os.environ.get("POS_PORT", "8998"))
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from scripts.cli_ui import (
    has_gui_display,
    open_browser_quiet,
    render_dual_status_box,
    safe_text,
    setup_console_utf8,
    step_print,
)

setup_console_utf8()

CLOUDFLARED_EXE = os.path.join(BASE_DIR, "cloudflared.exe" if os.name == "nt" else "cloudflared")


def _resolve_venv_python() -> str:
    candidates = (
        [os.path.join(BASE_DIR, ".venv", "Scripts", "python.exe")]
        if os.name == "nt"
        else [os.path.join(BASE_DIR, ".venv", "bin", "python"), os.path.join(BASE_DIR, ".venv", "bin", "python3")]
    )
    for c in candidates:
        if os.path.exists(c):
            return c
    return sys.executable


def is_valid_cloudflared(exe_path):
    """Kiểm tra binary cloudflared hợp lệ (tránh lỗi WinError 193 trên Windows do file hỏng/tải dở)."""
    if not exe_path or not os.path.exists(exe_path):
        return False
    try:
        if os.name == "nt":
            if os.path.getsize(exe_path) < 15_000_000:
                return False
            with open(exe_path, "rb") as f:
                if f.read(2) != b"MZ":
                    return False
        res = subprocess.run([exe_path, "--version"], capture_output=True, text=True, timeout=5)
        return res.returncode == 0 and "cloudflared" in (res.stdout or "").lower()
    except Exception:
        return False


def resolve_cloudflared(auto_download=True):
    """Tìm cloudflared hợp lệ tại thư mục gốc, PATH, hoặc tự tải lại nếu bị lỗi/chưa có."""
    if os.path.exists(CLOUDFLARED_EXE):
        if is_valid_cloudflared(CLOUDFLARED_EXE):
            return CLOUDFLARED_EXE
        step_print("!!", f"Phát hiện file {CLOUDFLARED_EXE} hỏng, đang tải lại bản chuẩn...", "yellow")
        try:
            os.remove(CLOUDFLARED_EXE)
        except Exception:
            pass

    in_path = shutil.which("cloudflared") or shutil.which("cloudflared.exe")
    if in_path and is_valid_cloudflared(in_path):
        return in_path

    if not auto_download:
        return None

    import platform
    machine = platform.machine().lower()
    if os.name == "nt":
        arch = "amd64" if ("64" in machine or "64" in platform.architecture()[0]) else "386"
        download_url = f"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-{arch}.exe"
    else:
        arch = "arm64" if ("aarch64" in machine or "arm64" in machine) else "amd64"
        download_url = f"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}"

    tmp_file = CLOUDFLARED_EXE + ".tmp"
    if os.path.exists(tmp_file):
        try:
            os.remove(tmp_file)
        except Exception:
            pass

    step_print("..", f"Đang tải cloudflared ({arch}) từ GitHub chính thức...", "cyan")
    downloaded = False
    try:
        cmd = f'curl -L -f -sS -o "{tmp_file}" "{download_url}"'
        res = subprocess.run(cmd, shell=True, timeout=300)
        if res.returncode == 0:
            if os.name != "nt":
                os.chmod(tmp_file, 0o755)
            if is_valid_cloudflared(tmp_file):
                downloaded = True
    except Exception:
        pass

    if not downloaded:
        try:
            req = urllib.request.Request(download_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=300) as resp, open(tmp_file, "wb") as out:
                shutil.copyfileobj(resp, out)
            if os.name != "nt":
                os.chmod(tmp_file, 0o755)
            if is_valid_cloudflared(tmp_file):
                downloaded = True
        except Exception:
            pass

    if downloaded and os.path.exists(tmp_file):
        if os.path.exists(CLOUDFLARED_EXE):
            try:
                os.remove(CLOUDFLARED_EXE)
            except Exception:
                pass
        os.replace(tmp_file, CLOUDFLARED_EXE)
        step_print("OK", f"Đã tải xong cloudflared: {CLOUDFLARED_EXE}", "green")
        return CLOUDFLARED_EXE

    if os.path.exists(tmp_file):
        try:
            os.remove(tmp_file)
        except Exception:
            pass
    step_print("ERR", "Không thể tải cloudflared hợp lệ. Kiểm tra kết nối mạng.", "red")
    return None

def is_server_running(port=None):
    target_port = port if port is not None else PORT
    try:
        req = urllib.request.urlopen(f"http://127.0.0.1:{target_port}/api/ping", timeout=2)
        return req.getcode() == 200
    except Exception:
        try:
            req = urllib.request.urlopen(f"http://127.0.0.1:{target_port}/api/settings", timeout=2)
            return req.getcode() in [200, 401, 403, 404]
        except Exception:
            return False

def ensure_server_running(port=None, db_path=None, sibling=False, headless=True):
    target_port = port if port is not None else PORT
    if is_server_running(target_port):
        step_print("OK", f"Máy chủ POS cổng {target_port} đang hoạt động.", "green")
        return True

    step_print("..", f"Khởi động ngầm máy chủ POS trên cổng {target_port}...", "cyan")

    env = os.environ.copy()
    env["POS_PORT"] = str(target_port)
    env["PYTHONUTF8"] = "1"
    if headless:
        env["POS_PRODUCTION"] = "1"
    if db_path:
        env["POS_DB_PATH"] = os.path.abspath(db_path)
    if sibling:
        env["POS_SIBLING_MODE"] = "1"

    python_exe = _resolve_venv_python()
    main_py = os.path.join(BASE_DIR, "main.py")
    log_dir = os.path.join(BASE_DIR, "logs")
    os.makedirs(log_dir, exist_ok=True)
    out_log = open(os.path.join(log_dir, f"server_{target_port}.log"), "a", encoding="utf-8", errors="replace")

    if os.name == "nt":
        if headless:
            creationflags = subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
            subprocess.Popen(
                [python_exe, main_py],
                env=env,
                cwd=BASE_DIR,
                stdout=out_log,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                creationflags=creationflags,
            )
        else:
            subprocess.Popen(
                f'start "POS SERVER (PORT {target_port})" "{python_exe}" "{main_py}"',
                shell=True,
                env=env,
                cwd=BASE_DIR,
            )
    else:
        subprocess.Popen(
            [python_exe, main_py],
            env=env,
            cwd=BASE_DIR,
            stdout=out_log,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )

    for i in range(15):
        time.sleep(1)
        if is_server_running(target_port):
            step_print("OK", f"Máy chủ POS cổng {target_port} sẵn sàng sau {i+1} giây.", "green")
            return True

    step_print("!!", f"Máy chủ cổng {target_port} khởi động hơi lâu, vẫn tiếp tục...", "yellow")
    return False

def copy_to_clipboard(text):
    if os.name != "nt":
        return False
    try:
        p = subprocess.Popen(["clip.exe"], stdin=subprocess.PIPE, shell=True)
        p.communicate(input=text.strip().encode("utf-8"))
        return True
    except Exception:
        return False

def kill_zombie_cloudflared():
    try:
        if os.name == "nt":
            subprocess.run("taskkill /F /IM cloudflared.exe >nul 2>&1", shell=True)
        else:
            subprocess.run(["pkill", "-f", "cloudflared"], capture_output=True)
    except Exception:
        pass

def find_sibling_port(start_port=8997, exclude_ports=(8998, 8999)):
    """Tìm cổng rảnh không trùng với bản POS chính đang chạy trên máy."""
    for p in range(start_port, start_port - 20, -1):
        if p in exclude_ports:
            continue
        if not is_server_running(p):
            return p
    return 8997

def clone_db_for_sibling(src_db, dst_db, force_refresh=False):
    """Sao chép an toàn toàn bộ dữ liệu cũ (WAL-safe) từ pos.db sang pos_instance2.db để test."""
    if not os.path.exists(src_db) or os.path.getsize(src_db) == 0:
        return False
    os.makedirs(os.path.dirname(os.path.abspath(dst_db)), exist_ok=True)
    # Nếu bản test chưa có hoặc nhỏ hơn 50% bản gốc (DB trắng mới tạo) hoặc yêu cầu làm mới
    need_copy = (
        force_refresh
        or not os.path.exists(dst_db)
        or os.path.getsize(dst_db) < os.path.getsize(src_db) * 0.5
    )
    if not need_copy:
        return True
    step_print("..", f"Đang sao chép dữ liệu từ {os.path.basename(src_db)} sang {os.path.basename(dst_db)}...", "cyan")
    for ext in ("", "-wal", "-shm"):
        p = dst_db + ext
        if os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass
    try:
        src_conn = sqlite3.connect(src_db, timeout=30.0)
        dst_conn = sqlite3.connect(dst_db, timeout=30.0)
        with dst_conn:
            src_conn.backup(dst_conn)
        dst_conn.close()
        src_conn.close()
        step_print("OK", "Đã sao chép xong cơ sở dữ liệu bản test.", "green")
        return True
    except Exception:
        shutil.copy2(src_db, dst_db)
        return True

def _start_cf_tunnel_for_port(cf_exe, port):
    """Khởi chạy 1 tiến trình cloudflared cho port chỉ định và trả về (proc, tunnel_url).
    Luôn có luồng nền rút cạn stderr suốt vòng đời tiến trình để chống treo cứng 64KB PIPE trên Windows."""
    import threading
    cmd = [cf_exe, "tunnel", "--protocol", "http2", "--url", f"http://127.0.0.1:{port}"]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        encoding="utf-8",
        errors="replace",
    )
    url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    found_holder = {"url": None}
    found_event = threading.Event()

    def _drain_stderr():
        try:
            for line in proc.stderr:
                if not found_event.is_set():
                    match = url_pattern.search(line)
                    if match:
                        found_holder["url"] = match.group(0)
                        found_event.set()
        except Exception:
            pass
        finally:
            found_event.set()

    threading.Thread(target=_drain_stderr, daemon=True).start()
    found_event.wait(timeout=30.0)
    return proc, found_holder["url"]


def _sync_tunnel_to_vercel_endpoint(vercel_host: str, tunnel_url: str):
    """Gửi link tunnel trực tiếp tới Vercel qua HTTP POST (không cần .cf_auth.json)."""
    try:
        import json
        import urllib.request
        data = json.dumps({"tunnel_url": tunnel_url or ""}).encode("utf-8")
        req = urllib.request.Request(
            f"https://{vercel_host}/api/tunnel/register",
            data=data,
            headers={"Content-Type": "application/json", "User-Agent": "POS-Launcher"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=6.0) as resp:
            return resp.status == 200
    except Exception:
        return False


def _sync_live_tunnel_urls_to_d1(url_mcare: str, url_petnt: str):
    """Tự động gắn link Cloudflare Tunnel của cổng 8998 vào mcarepet.vercel.app và cổng 8997 vào petnt.vercel.app."""
    # 1. Đồng bộ qua Vercel API endpoint (hoạt động trên MỌI máy tính, không cần file .cf_auth.json)
    ok_v1 = _sync_tunnel_to_vercel_endpoint("mcarepet.vercel.app", url_mcare)
    ok_v2 = _sync_tunnel_to_vercel_endpoint("petnt.vercel.app", url_petnt)
    if ok_v1 or ok_v2:
        return True

    # 2. Dự phòng: ghi trực tiếp Cloudflare D1 nếu có file .cf_auth.json
    auth_file = os.path.join(BASE_DIR, ".cf_auth.json")
    if not os.path.exists(auth_file):
        return False
    try:
        import json
        from scripts.migrate_to_cloudflare_d1 import ensure_d1_database
        from database import D1ConnectionWrapper
        with open(auth_file, "r", encoding="utf-8") as f:
            auth = json.load(f)
        acc_id = auth.get("account_id")
        token = auth.get("api_token")
        if not acc_id or not token:
            return False

        pairs = [
            ("pos-oem-db", url_mcare or ""),
            ("pos-spa-db", url_petnt or ""),
        ]
        for db_name, t_url in pairs:
            db_id = ensure_d1_database(acc_id, token, db_name)
            d1_conn = D1ConnectionWrapper(account_id=acc_id, database_id=db_id, api_token=token)
            cur = d1_conn.cursor()
            cur.execute(
                "INSERT INTO settings (key, value) VALUES ('live_tunnel_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (t_url,),
            )
            d1_conn.close()
        return True
    except Exception as e:
        step_print("!!", f"Không thể đồng bộ link sang Vercel/D1: {e}", "yellow")
        return False


def run_dual_servers(with_cloudflare=True):
    """Khởi chạy ngầm 2 máy chủ độc lập (Port 8998 -> pos.db & Port 8997 -> pos_instance2.db)."""
    os.chdir(BASE_DIR)
    db1 = os.path.join(BASE_DIR, "data", "pos.db")
    db2 = os.path.join(BASE_DIR, "data", "pos_instance2.db")

    step_print("..", "Khởi động ngầm 2 máy chủ POS độc lập (tách biệt 2 file DB)...", "cyan")
    ok1 = ensure_server_running(port=8998, db_path=db1, sibling=False, headless=True)
    ok2 = ensure_server_running(port=8997, db_path=db2, sibling=True, headless=True)

    if not with_cloudflare:
        rows = [
            {"name": "MCare SG", "port": 8998, "ok": ok1, "public_url": "http://127.0.0.1:8998"},
            {"name": "PetNT NT", "port": 8997, "ok": ok2, "public_url": "http://127.0.0.1:8997"},
        ]
        print(
            "\n"
            + render_dual_status_box(
                rows,
                footer_lines=["[OK] 2 máy chủ đã chạy ngầm (data/pos.db & data/pos_instance2.db)."],
            )
            + "\n",
            flush=True,
        )
        return ok1 and ok2

    ts_marker = os.path.join(BASE_DIR, "data", "tailscale_funnel.json")
    try:
        from scripts.setup_tailscale_dual import find_tailscale_exe, setup_tailscale_dual
        if os.path.exists(ts_marker) and find_tailscale_exe():
            step_print("OK", "Phát hiện cấu hình Tailscale Funnel cố định — kích hoạt ngay!", "green")
            return setup_tailscale_dual(verify_only=True, open_panel=True)
    except Exception:
        pass

    cf_exe = resolve_cloudflared(auto_download=True)
    if not cf_exe:
        return False

    kill_zombie_cloudflared()
    step_print("..", "Đang mở 2 đường truyền Cloudflare Tunnel cho cổng 8998 và 8997...", "cyan")
    proc1, url1 = _start_cf_tunnel_for_port(cf_exe, 8998)
    proc2, url2 = _start_cf_tunnel_for_port(cf_exe, 8997)

    synced = _sync_live_tunnel_urls_to_d1(url1, url2)
    rows = [
        {"name": "MCare SG", "port": 8998, "ok": ok1, "public_url": "https://mcarepet.vercel.app"},
        {"name": "PetNT NT", "port": 8997, "ok": ok2, "public_url": "https://petnt.vercel.app"},
    ]
    footers = [
        f"[OK] Tunnel 8998 : {url1 or 'Đang kết nối...'}",
        f"[OK] Tunnel 8997 : {url2 or 'Đang kết nối...'}",
        f"[OK] Đồng bộ Vercel : {'Đã gắn thành công' if synced else 'Đang thử lại'}",
        "[!!] Chế độ Cloudflare tạm: Giữ cửa sổ này (hoặc dùng CAI_TAILSCALE_2_MAY_CHU.bat để tắt hẳn CMD).",
    ]
    print("\n" + render_dual_status_box(rows, footer_lines=footers) + "\n", flush=True)
    if ok1 and has_gui_display():
        open_browser_quiet("http://127.0.0.1:8998/server-status")

    try:
        last_check = time.time()
        while True:
            time.sleep(2)
            if time.time() - last_check >= 45:
                last_check = time.time()
                ensure_server_running(port=8998, db_path=db1, sibling=False, headless=True)
                ensure_server_running(port=8997, db_path=db2, sibling=True, headless=True)
                changed = False
                if not proc1 or proc1.poll() is not None:
                    proc1, new_u1 = _start_cf_tunnel_for_port(cf_exe, 8998)
                    if new_u1:
                        url1 = new_u1
                        changed = True
                if not proc2 or proc2.poll() is not None:
                    proc2, new_u2 = _start_cf_tunnel_for_port(cf_exe, 8997)
                    if new_u2:
                        url2 = new_u2
                        changed = True
                if changed:
                    _sync_live_tunnel_urls_to_d1(url1, url2)
    except KeyboardInterrupt:
        step_print("..", "Đang đóng kết nối Cloudflare Tunnel...", "yellow")
    finally:
        if not os.path.exists(os.path.join(BASE_DIR, "data", "tailscale_funnel.json")):
            _sync_live_tunnel_urls_to_d1("", "")
        kill_zombie_cloudflared()
    return True


def main():
    os.chdir(BASE_DIR)
    if "--set-url" in sys.argv:
        idx = sys.argv.index("--set-url")
        if idx + 1 < len(sys.argv):
            raw_url = sys.argv[idx + 1].strip()
            target_proj = "petnt.vercel.app" if "--petnt" in sys.argv else "mcarepet.vercel.app"
            ok = _sync_tunnel_to_vercel_endpoint(target_proj, raw_url)
            step_print("OK" if ok else "ERR", f"Gán link {raw_url} lên {target_proj}: {'Thành công' if ok else 'Thất bại'}")
            return
    if "--dual-local" in sys.argv:
        run_dual_servers(with_cloudflare=False)
        return
    if "--dual" in sys.argv:
        run_dual_servers(with_cloudflare=True)
        return

    sibling_mode = "--sibling" in sys.argv or os.environ.get("POS_SIBLING_MODE") == "1"
    refresh_db = "--refresh-db" in sys.argv or os.environ.get("POS_REFRESH_TEST_DB") == "1"
    target_port = PORT
    target_db = os.environ.get("POS_DB_PATH")

    if sibling_mode:
        target_port = int(os.environ.get("POS_PORT", str(find_sibling_port())))
        if not target_db:
            target_db = os.path.join(BASE_DIR, "data", "pos_instance2.db")
        main_db = os.path.join(BASE_DIR, "data", "pos.db")
        if os.path.abspath(target_db) != os.path.abspath(main_db) and refresh_db:
            clone_db_for_sibling(main_db, target_db, force_refresh=True)
        step_print("..", f"Chế độ chạy song song (Instance 2): Port {target_port} | DB: {target_db}", "cyan")

    cf_exe = resolve_cloudflared(auto_download=True)
    if not cf_exe:
        return

    if not sibling_mode:
        kill_zombie_cloudflared()

    ok_srv = ensure_server_running(port=target_port, db_path=target_db)
    step_print("..", f"Đang mở tên miền HTTPS tạm Cloudflare cho cổng {target_port}...", "cyan")
    proc, tunnel_url = _start_cf_tunnel_for_port(cf_exe, target_port)

    if not tunnel_url:
        step_print("ERR", "Không nhận được link từ Cloudflare sau 30 giây. Kiểm tra kết nối mạng.", "red")
        kill_zombie_cloudflared()
        return

    target_vercel = "petnt.vercel.app" if sibling_mode else "mcarepet.vercel.app"
    copied = copy_to_clipboard(tunnel_url)
    synced = _sync_tunnel_to_vercel_endpoint(target_vercel, tunnel_url)
    open_browser_quiet(tunnel_url)

    rows = [
        {
            "name": "PetNT NT" if sibling_mode else "MCare SG",
            "port": target_port,
            "ok": ok_srv,
            "public_url": f"https://{target_vercel}",
        }
    ]
    footers = [
        f"[OK] Link trực tiếp : {tunnel_url}",
        f"[OK] Đồng bộ Vercel : {'Đã gắn vào ' + target_vercel if synced else 'Chưa gắn'}",
        f"[OK] Bộ nhớ tạm     : {'Đã copy link (nhấn Ctrl+V để dán)' if copied else tunnel_url}",
        "[!!] Giữ cửa sổ này khi đang dùng Cloudflare tạm (nhấn Ctrl+C để dừng).",
    ]
    print("\n" + render_dual_status_box(rows, footer_lines=footers) + "\n", flush=True)

    try:
        while proc.poll() is None:
            time.sleep(1)
    except KeyboardInterrupt:
        step_print("..", "Đang ngắt kết nối chia sẻ...", "yellow")
    finally:
        if not os.path.exists(os.path.join(BASE_DIR, "data", "tailscale_funnel.json")):
            _sync_tunnel_to_vercel_endpoint(target_vercel, "")
        kill_zombie_cloudflared()
        print(safe_text("  [OK]   Đã đóng kết nối online an toàn."))

if __name__ == "__main__":
    main()

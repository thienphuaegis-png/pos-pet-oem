"""
Thiết lập trọn gói 2 đường truyền HTTPS cố định vĩnh viễn qua Tailscale Funnel
cho 2 máy chủ chạy chung 1 máy tính (tách biệt 100% database):
  - Chi nhánh 1 (MCare - Cổng 8998 - data/pos.db)
      -> https://<node>.<tailnet>.ts.net       (gắn cố định vào https://mcarepet.vercel.app)
  - Chi nhánh 2 (PetNT - Cổng 8997 - data/pos_instance2.db)
      -> https://<node>.<tailnet>.ts.net:8443  (gắn cố định vào https://petnt.vercel.app)

Đặc điểm:
  - Chạy ngầm hoàn toàn bằng Windows Service của Tailscale (`--unattended` + `funnel --bg`).
  - Không cần giữ cửa sổ CMD đen, không bao giờ nghẽn ống PIPE hay đổi link.
  - Tự tạo lối tắt khởi động ngầm 2 máy chủ POS (8998 & 8997) cùng Windows.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from scripts.cli_ui import (
    has_gui_display,
    open_browser_quiet,
    render_dual_status_box,
    setup_console_utf8,
    step_print,
)

setup_console_utf8()

MARKER_FILE = os.path.join(BASE_DIR, "data", "tailscale_funnel.json")


def find_tailscale_exe() -> str | None:
    candidates = [
        r"C:\Program Files\Tailscale\tailscale.exe",
        r"C:\Program Files (x86)\Tailscale\tailscale.exe",
        shutil.which("tailscale"),
        shutil.which("tailscale.exe"),
    ]
    for p in candidates:
        if p and os.path.exists(p):
            return p
    return None


def _ts_cmd_prefix(ts_exe: str) -> list[str]:
    if os.name != "nt" and hasattr(os, "geteuid") and os.geteuid() != 0 and shutil.which("sudo"):
        return ["sudo", ts_exe]
    return [ts_exe]


def kill_legacy_cloudflare_runners() -> None:
    """Dừng cloudflared và share_online.py cũ trước khi gắn link Tailscale cố định lên Vercel."""
    my_pid = os.getpid()
    if os.name == "nt":
        ps_cmd = (
            f"Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | "
            f"Where-Object {{ $_.ProcessId -ne {my_pid} -and ("
            f"$_.Name -like 'cloudflared*' -or $_.CommandLine -like '*share_online.py*') }} | "
            f"ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}"
        )
        try:
            subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
                           capture_output=True, timeout=10)
        except Exception:
            pass
    else:
        for pat in ("cloudflared", "share_online.py"):
            try:
                subprocess.run(["pkill", "-f", pat], capture_output=True, timeout=5)
            except Exception:
                pass


def get_tailscale_status(ts_exe: str) -> dict:
    try:
        res = subprocess.run([ts_exe, "status", "--json"], capture_output=True, text=True,
                             encoding="utf-8", errors="replace", timeout=15)
        if res.returncode == 0 and res.stdout.strip():
            return json.loads(res.stdout)
    except Exception:
        pass
    return {}


def ensure_tailscale_logged_in(ts_exe: str) -> str | None:
    st = get_tailscale_status(ts_exe)
    backend_state = st.get("BackendState") or ""
    prefix = _ts_cmd_prefix(ts_exe)

    if backend_state != "Running":
        step_print("..", "Bước 1: Đăng nhập Tailscale (trình duyệt sẽ mở nếu chưa đăng nhập)...", "cyan")
        up_cmd = prefix + ["up", "--hostname=pos-server"]
        if os.name == "nt":
            up_cmd.append("--unattended")
        proc = subprocess.Popen(
            up_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        opened_auth = False
        url_re = re.compile(r"https://login\.tailscale\.com/\S+")
        if proc.stdout:
            for line in proc.stdout:
                m = url_re.search(line)
                if m and not opened_auth:
                    opened_auth = True
                    auth_url = m.group(0)
                    step_print("!!", f"Mở link đăng nhập Tailscale: {auth_url}", "yellow")
                    open_browser_quiet(auth_url)
        proc.wait()
    elif os.name == "nt":
        subprocess.run([ts_exe, "set", "--unattended"], capture_output=True, timeout=10)

    warned_dns = False
    for _ in range(30):
        st = get_tailscale_status(ts_exe)
        dns_name = ((st.get("Self") or {}).get("DNSName") or "").strip().rstrip(".")
        if dns_name and ".ts.net" in dns_name:
            return dns_name
        if st.get("BackendState") == "Running" and not dns_name and not warned_dns:
            warned_dns = True
            step_print("!!", "Tài khoản Tailscale chưa bật MagicDNS & HTTPS Certificates.", "yellow")
            step_print("..", "Bật Enable MagicDNS & Enable HTTPS tại https://login.tailscale.com/admin/dns", "yellow")
            open_browser_quiet("https://login.tailscale.com/admin/dns")
        time.sleep(2)
    return None


def configure_funnel_port(ts_exe: str, https_port: int, local_port: int) -> bool:
    target = f"http://127.0.0.1:{local_port}"
    prefix = _ts_cmd_prefix(ts_exe)
    cmds_to_try = [
        prefix + ["funnel", "--bg", "--yes", f"--https={https_port}", target],
        prefix + ["funnel", "--bg", f"--https={https_port}", target],
    ]
    url_re = re.compile(r"https://login\.tailscale\.com/\S+")

    for idx, cmd in enumerate(cmds_to_try):
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        opened_enable = False
        output_lines = []
        if proc.stdout:
            for line in proc.stdout:
                output_lines.append(line)
                m = url_re.search(line)
                if m and not opened_enable:
                    opened_enable = True
                    enable_url = m.group(0)
                    step_print("!!", f"Lần đầu bật Funnel — bấm [Enable] tại: {enable_url}", "yellow")
                    open_browser_quiet(enable_url)
        rc = proc.wait()
        joined = "".join(output_lines).lower()
        if rc == 0:
            return True
        if idx == 0 and ("flag provided but not defined" in joined or "unknown flag" in joined):
            continue
        break
    return False


def sync_vercel_url(vercel_host: str, tunnel_url: str, retries: int = 3) -> bool:
    payload = json.dumps({"tunnel_url": tunnel_url}).encode("utf-8")
    secret = (
        os.environ.get("BRIDGE_SECRET")
        or os.environ.get("TUNNEL_REGISTER_SECRET")
        or os.environ.get("CF_D1_WORKER_SECRET")
        or ""
    )
    headers = {"Content-Type": "application/json", "User-Agent": "POS-Tailscale-Setup"}
    if secret:
        headers["X-Bridge-Secret"] = secret
        headers["Authorization"] = f"Bearer {secret}"

    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                f"https://{vercel_host}/api/tunnel/register",
                data=payload,
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=8.0) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return False


def verify_vercel_status(vercel_host: str) -> str:
    try:
        req = urllib.request.Request(
            f"https://{vercel_host}/api/tunnel/status",
            headers={"User-Agent": "POS-Tailscale-Setup"},
        )
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("live_tunnel_url") or ""
    except Exception:
        return ""


def register_windows_autostart() -> bool:
    """Tạo lối tắt khởi động ngầm 2 máy chủ POS (start_server.vbs) trong Startup Windows."""
    if os.name != "nt":
        return os.path.exists("/etc/systemd/system/pos-petcare-8998.service")
    vbs_path = os.path.join(BASE_DIR, "deploy", "start_server.vbs")
    startup_dir = os.path.join(os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs\Startup")
    if not os.path.exists(vbs_path) or not os.path.isdir(startup_dir):
        return False
    lnk_path = os.path.join(startup_dir, "POS_Mastercare_AutoStart.lnk")
    ps_script = (
        f"$s = (New-Object -ComObject WScript.Shell).CreateShortcut('{lnk_path}'); "
        f"$s.TargetPath = 'wscript.exe'; "
        f"$s.Arguments = '\"{vbs_path}\"'; "
        f"$s.WorkingDirectory = '{BASE_DIR}'; "
        f"$s.Save()"
    )
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
                           capture_output=True, timeout=10)
        return r.returncode == 0
    except Exception:
        return False


def print_status_summary(open_panel: bool = False) -> bool:
    from services.server_status_service import collect_server_overview

    ov = collect_server_overview()
    insts = ov["instances"]
    ts = ov["tailscale"]
    auto = ov["autostart"]

    rows = [
        {
            "name": "MCare SG",
            "port": 8998,
            "ok": insts[0]["local_ok"],
            "public_url": insts[0]["public_domain"] if ts["funnel_configured"] else insts[0]["lan_url"],
        },
        {
            "name": "PetNT NT",
            "port": 8997,
            "ok": insts[1]["local_ok"],
            "public_url": insts[1]["public_domain"] if ts["funnel_configured"] else insts[1]["lan_url"],
        },
    ]
    footers = [
        f"[OK] Tailscale Funnel : {ts['dns_name'] + ' (443, 8443)' if ts['dns_name'] else 'Chưa bật Funnel'}",
        f"[OK] Tự chạy ngầm     : {auto['label']}",
        "[OK] Bảng điều khiển  : http://127.0.0.1:8998/server-status (Có thể đóng cửa sổ này)",
    ]
    print("\n" + render_dual_status_box(rows, footer_lines=footers) + "\n", flush=True)

    if open_panel and insts[0]["local_ok"] and has_gui_display():
        open_browser_quiet("http://127.0.0.1:8998/server-status")
    return bool(insts[0]["local_ok"] and insts[1]["local_ok"])


def setup_tailscale_dual(verify_only: bool = False, open_panel: bool = False) -> bool:
    from scripts.share_online import ensure_server_running

    ts_exe = find_tailscale_exe()
    if not ts_exe:
        if not verify_only:
            step_print("ERR", "Chưa tìm thấy Tailscale trên máy chủ.", "red")
            if os.name == "nt":
                step_print("..", "Hãy chạy file CAI_TAILSCALE_2_MAY_CHU.bat để tự động cài đặt.")
            else:
                step_print("..", "Hãy chạy: ./pos_server.sh funnel")
        return False

    if not verify_only:
        kill_legacy_cloudflare_runners()

    db1 = os.path.join(BASE_DIR, "data", "pos.db")
    db2 = os.path.join(BASE_DIR, "data", "pos_instance2.db")
    step_print("..", "Kiểm tra & khởi chạy ngầm 2 máy chủ POS nội bộ (8998 & 8997)...", "cyan")
    ok_srv1 = ensure_server_running(port=8998, db_path=db1, sibling=False, headless=True)
    ok_srv2 = ensure_server_running(port=8997, db_path=db2, sibling=True, headless=True)

    dns_name = ensure_tailscale_logged_in(ts_exe)
    if not dns_name:
        step_print("ERR", "Không lấy được tên miền *.ts.net từ Tailscale.", "red")
        return False

    url_mcare = f"https://{dns_name}"
    url_petnt = f"https://{dns_name}:8443"

    step_print("..", f"Cấu hình 2 cổng Tailscale Funnel cố định trên {dns_name}...", "cyan")
    ok_f1 = configure_funnel_port(ts_exe, 443, 8998)
    ok_f2 = configure_funnel_port(ts_exe, 8443, 8997)
    if not (ok_f1 and ok_f2):
        step_print("ERR", "Bật Tailscale Funnel chưa hoàn tất. Hãy Enable Funnel rồi chạy lại.", "red")
        return False

    os.makedirs(os.path.dirname(MARKER_FILE), exist_ok=True)
    with open(MARKER_FILE, "w", encoding="utf-8") as f:
        json.dump(
            {
                "mode": "tailscale_funnel",
                "dns_name": dns_name,
                "url_mcare": url_mcare,
                "url_petnt": url_petnt,
                "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            },
            f,
            indent=2,
        )

    step_print("..", "Gắn cố định 2 link Tailscale vào mcarepet.vercel.app & petnt.vercel.app...", "cyan")
    sync1 = sync_vercel_url("mcarepet.vercel.app", url_mcare)
    sync2 = sync_vercel_url("petnt.vercel.app", url_petnt)
    live1 = verify_vercel_status("mcarepet.vercel.app")
    live2 = verify_vercel_status("petnt.vercel.app")
    autostart_ok = register_windows_autostart()

    rows = [
        {"name": "MCare SG", "port": 8998, "ok": ok_srv1, "public_url": "https://mcarepet.vercel.app"},
        {"name": "PetNT NT", "port": 8997, "ok": ok_srv2, "public_url": "https://petnt.vercel.app"},
    ]
    v_state = "Đã đồng bộ Vercel" if (live1 == url_mcare or sync1) and (live2 == url_petnt or sync2) else "Chờ mạng đồng bộ"
    footers = [
        f"[OK] Tailscale Funnel : {dns_name} (443 -> 8998, 8443 -> 8997)",
        f"[OK] Domain cố định   : {v_state}",
        f"[OK] Tự chạy cùng HĐH : {'Đã bật ngầm' if autostart_ok else 'Thủ công'}",
        "[OK] Bảng điều khiển  : http://127.0.0.1:8998/server-status (Đóng cửa sổ này được ngay)",
    ]
    print("\n" + render_dual_status_box(rows, footer_lines=footers) + "\n", flush=True)

    if open_panel and ok_srv1 and has_gui_display():
        open_browser_quiet("http://127.0.0.1:8998/server-status")
    return True


if __name__ == "__main__":
    if "--status-only" in sys.argv:
        print_status_summary(open_panel=("--no-browser" not in sys.argv))
        sys.exit(0)
    ok = setup_tailscale_dual(
        verify_only="--verify-only" in sys.argv,
        open_panel="--open-panel" in sys.argv,
    )
    sys.exit(0 if ok else 1)

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
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

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


def kill_legacy_cloudflare_runners() -> None:
    """Dừng cloudflared.exe và share_online.py cũ trước khi gắn link Tailscale cố định lên Vercel."""
    if os.name != "nt":
        return
    my_pid = os.getpid()
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

    if backend_state != "Running":
        print("\n🔑 Bước 1: Đăng nhập Tailscale (trình duyệt sẽ tự mở nếu chưa đăng nhập)...")
        proc = subprocess.Popen(
            [ts_exe, "up", "--hostname=pos-server", "--unattended"],
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
                sys.stdout.write("   " + line)
                m = url_re.search(line)
                if m and not opened_auth:
                    opened_auth = True
                    try:
                        webbrowser.open(m.group(0))
                    except Exception:
                        pass
        proc.wait()
    else:
        # Đã đăng nhập sẵn -> chỉ bật cờ unattended để không rớt mạng khi khóa màn hình Windows
        subprocess.run([ts_exe, "set", "--unattended"], capture_output=True, timeout=10)

    # Chờ lấy DNSName chuẩn (*.ts.net)
    for _ in range(30):
        st = get_tailscale_status(ts_exe)
        dns_name = ((st.get("Self") or {}).get("DNSName") or "").strip().rstrip(".")
        if dns_name and ".ts.net" in dns_name:
            return dns_name
        if st.get("BackendState") == "Running" and not dns_name:
            print("⚠️ Tài khoản Tailscale chưa bật MagicDNS & HTTPS Certificates.")
            print("   Đang mở trang cấu hình DNS Tailscale — anh bấm 'Enable MagicDNS' & 'Enable HTTPS' nhé...")
            try:
                webbrowser.open("https://login.tailscale.com/admin/dns")
            except Exception:
                pass
        time.sleep(2)
    return None


def configure_funnel_port(ts_exe: str, https_port: int, local_port: int) -> bool:
    target = f"http://127.0.0.1:{local_port}"
    cmds_to_try = [
        [ts_exe, "funnel", "--bg", "--yes", f"--https={https_port}", target],
        [ts_exe, "funnel", "--bg", f"--https={https_port}", target],
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
                sys.stdout.write("   " + line)
                m = url_re.search(line)
                if m and not opened_enable:
                    opened_enable = True
                    print("\n👉 Lần đầu bật Funnel: Trình duyệt vừa mở trang Tailscale, anh bấm nút [Enable] nhé!")
                    try:
                        webbrowser.open(m.group(0))
                    except Exception:
                        pass
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
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                f"https://{vercel_host}/api/tunnel/register",
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "POS-Tailscale-Setup"},
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
        return False
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


def setup_tailscale_dual(verify_only: bool = False) -> bool:
    from scripts.share_online import ensure_server_running

    ts_exe = find_tailscale_exe()
    if not ts_exe:
        if not verify_only:
            print("❌ Chưa tìm thấy Tailscale tại C:\\Program Files\\Tailscale\\tailscale.exe.")
            print("   Hãy chạy file CAI_TAILSCALE_2_MAY_CHU.bat để tự động cài đặt!")
        return False

    if not verify_only:
        kill_legacy_cloudflare_runners()

    # 1. Đảm bảo 2 máy chủ POS chạy ngầm (8998: MCare | 8997: PetNT)
    db1 = os.path.join(BASE_DIR, "data", "pos.db")
    db2 = os.path.join(BASE_DIR, "data", "pos_instance2.db")
    print("\n🚀 Đang kiểm tra & khởi chạy ngầm 2 máy chủ POS nội bộ...")
    ok_srv1 = ensure_server_running(port=8998, db_path=db1, sibling=False, headless=True)
    ok_srv2 = ensure_server_running(port=8997, db_path=db2, sibling=True, headless=True)

    # 2. Lấy tên miền cố định *.ts.net của máy
    dns_name = ensure_tailscale_logged_in(ts_exe)
    if not dns_name:
        print("❌ Không lấy được tên miền *.ts.net từ Tailscale. Vui lòng kiểm tra kết nối Tailscale.")
        return False

    url_mcare = f"https://{dns_name}"
    url_petnt = f"https://{dns_name}:8443"

    # 3. Bật 2 cổng Funnel chạy ngầm vĩnh viễn (--bg)
    print(f"\n🌐 Đang cấu hình 2 cổng Tailscale Funnel cố định trên {dns_name}...")
    ok_f1 = configure_funnel_port(ts_exe, 443, 8998)
    ok_f2 = configure_funnel_port(ts_exe, 8443, 8997)
    if not (ok_f1 and ok_f2):
        print("❌ Bật Tailscale Funnel chưa hoàn tất. Hãy chắc chắn đã bấm Enable Funnel trên trang quản trị Tailscale rồi chạy lại.")
        return False

    # 4. Lưu cấu hình đánh dấu & gắn cố định vào 2 domain Vercel
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

    print("\n🔗 Đang gắn cố định 2 link Tailscale vào mcarepet.vercel.app & petnt.vercel.app...")
    sync1 = sync_vercel_url("mcarepet.vercel.app", url_mcare)
    sync2 = sync_vercel_url("petnt.vercel.app", url_petnt)
    live1 = verify_vercel_status("mcarepet.vercel.app")
    live2 = verify_vercel_status("petnt.vercel.app")
    autostart_ok = register_windows_autostart()

    print("\n" + "=" * 78)
    print("   🎉 HOÀN TẤT 2 ĐƯỜNG TRUYỀN CỐ ĐỊNH VĨNH VIỄN (TAILSCALE FUNNEL) 🎉")
    print("=" * 78)
    print("   1. CHI NHÁNH SÀI GÒN (MCare POS - Cổng 8998 - DB: data/pos.db)")
    print(f"      • Link thẳng (Nhanh nhất) : {url_mcare}")
    print(f"      • Qua tên miền Vercel     : https://mcarepet.vercel.app  ({'✅ Đã gắn' if live1 == url_mcare or sync1 else '⚠️ Chờ mạng'})")
    print()
    print("   2. CHI NHÁNH NHA TRANG (PetNT POS - Cổng 8997 - DB: data/pos_instance2.db)")
    print(f"      • Link thẳng (Nhanh nhất) : {url_petnt}")
    print(f"      • Qua tên miền Vercel     : https://petnt.vercel.app     ({'✅ Đã gắn' if live2 == url_petnt or sync2 else '⚠️ Chờ mạng'})")
    print("   --------------------------------------------------------------------------")
    print(f"   ✅ Máy chủ 8998 & 8997 chạy ngầm : {'Sẵn sàng' if (ok_srv1 and ok_srv2) else 'Đang lên'}")
    print(f"   ✅ Tự bật lại khi mở máy Windows : {'Đã kích hoạt' if autostart_ok else 'Thủ công'}")
    print("   💡 TỪ NAY ANH CÓ THỂ ĐÓNG CỬA SỔ NÀY — KHÔNG CẦN GIỮ CỬA SỔ ĐEN NỮA!")
    print("=" * 78)
    return True


if __name__ == "__main__":
    ok = setup_tailscale_dual(verify_only="--verify-only" in sys.argv)
    sys.exit(0 if ok else 1)

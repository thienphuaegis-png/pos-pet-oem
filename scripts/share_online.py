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
import webbrowser

PORT = int(os.environ.get("POS_PORT", "8998"))
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLOUDFLARED_EXE = os.path.join(BASE_DIR, "cloudflared.exe")
CLOUDFLARED_DL_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

def resolve_cloudflared(auto_download=True):
    """Tìm cloudflared.exe tại thư mục gốc, PATH, hoặc tự tải về nếu chưa có."""
    if os.path.exists(CLOUDFLARED_EXE) and os.path.getsize(CLOUDFLARED_EXE) > 1_000_000:
        return CLOUDFLARED_EXE
    in_path = shutil.which("cloudflared") or shutil.which("cloudflared.exe")
    if in_path:
        return in_path
    if not auto_download:
        return None
    print("⬇️ Chưa có cloudflared.exe — đang tự động tải từ GitHub chính thức (~35MB)...")
    try:
        req = urllib.request.Request(CLOUDFLARED_DL_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as resp, open(CLOUDFLARED_EXE, "wb") as out:
            shutil.copyfileobj(resp, out)
        if os.path.exists(CLOUDFLARED_EXE) and os.path.getsize(CLOUDFLARED_EXE) > 1_000_000:
            print(f"✅ Đã tải xong: {CLOUDFLARED_EXE}")
            return CLOUDFLARED_EXE
    except Exception as e:
        print(f"⚠️ Lỗi tải bằng urllib ({e}), thử dùng curl Windows...")
        try:
            subprocess.run(f'curl -L -o "{CLOUDFLARED_EXE}" "{CLOUDFLARED_DL_URL}"', shell=True, timeout=120)
            if os.path.exists(CLOUDFLARED_EXE) and os.path.getsize(CLOUDFLARED_EXE) > 1_000_000:
                print(f"✅ Đã tải xong qua curl: {CLOUDFLARED_EXE}")
                return CLOUDFLARED_EXE
        except Exception:
            pass
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
        print(f"✅ Máy chủ POS đang hoạt động tại http://127.0.0.1:{target_port}")
        return True

    print(f"⚠️ Phát hiện máy chủ POS (cổng {target_port}) chưa được bật.")
    print(f"🚀 Đang tự động khởi động máy chủ POS ngầm trên cổng {target_port}...")

    env = os.environ.copy()
    env["POS_PORT"] = str(target_port)
    if db_path:
        env["POS_DB_PATH"] = os.path.abspath(db_path)
    if sibling:
        env["POS_SIBLING_MODE"] = "1"

    python_exe = os.path.join(BASE_DIR, ".venv", "Scripts", "python.exe")
    if not os.path.exists(python_exe):
        python_exe = sys.executable
    main_py = os.path.join(BASE_DIR, "main.py")

    if headless and os.name == "nt":
        log_dir = os.path.join(BASE_DIR, "logs")
        os.makedirs(log_dir, exist_ok=True)
        out_log = open(os.path.join(log_dir, f"server_{target_port}.log"), "a", encoding="utf-8", errors="replace")
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

    # Đợi server lên trong tối đa 15 giây
    for i in range(15):
        time.sleep(1)
        if is_server_running(target_port):
            print(f"✅ Máy chủ POS (cổng {target_port}) đã khởi động thành công sau {i+1} giây!")
            return True
        print(f"   Đang chờ máy chủ cổng {target_port} sẵn sàng... ({i+1}s)")

    print("⚠️ Máy chủ khởi động hơi lâu, vẫn tiếp tục...")
    return False

def copy_to_clipboard(text):
    try:
        p = subprocess.Popen(["clip.exe"], stdin=subprocess.PIPE, shell=True)
        p.communicate(input=text.strip().encode("utf-8"))
        return True
    except Exception:
        return False

def kill_zombie_cloudflared():
    try:
        subprocess.run("taskkill /F /IM cloudflared.exe >nul 2>&1", shell=True)
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
    print(f"📦 Đang sao chép dữ liệu cũ từ {os.path.basename(src_db)} sang {os.path.basename(dst_db)} (an toàn WAL)...")
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
        print(f"✅ Đã nạp xong toàn bộ data cũ ({os.path.getsize(dst_db) // (1024*1024)} MB) vào bản test!")
        return True
    except Exception as e:
        print(f"⚠️ Backup API bận ({e}), chuyển sang copy trực tiếp...")
        shutil.copy2(src_db, dst_db)
        return True

def _start_cf_tunnel_for_port(cf_exe, port):
    """Khởi chạy 1 tiến trình cloudflared cho port chỉ định và trả về (proc, tunnel_url)."""
    cmd = [cf_exe, "tunnel", "--protocol", "http2", "--url", f"http://127.0.0.1:{port}"]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        encoding="utf-8",
        errors="replace",
    )
    url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    start_time = time.time()
    tunnel_url = None
    try:
        for line in proc.stderr:
            match = url_pattern.search(line)
            if match:
                tunnel_url = match.group(0)
                break
            if time.time() - start_time > 30:
                break
    except Exception:
        pass
    return proc, tunnel_url


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
        print(f"⚠️ Không thể đồng bộ link sang Vercel/D1: {e}")
        return False


def run_dual_servers(with_cloudflare=True):
    """Khởi chạy ngầm 2 máy chủ độc lập (Port 8998 -> pos.db & Port 8997 -> pos_instance2.db)."""
    os.chdir(BASE_DIR)
    db1 = os.path.join(BASE_DIR, "data", "pos.db")
    db2 = os.path.join(BASE_DIR, "data", "pos_instance2.db")
    clone_db_for_sibling(db1, db2, force_refresh=False)

    print("=" * 74)
    print("   KHỞI ĐỘNG NGẦM 2 MÁY CHỦ POS ĐỘC LẬP (CÙNG 1 THƯ MỤC CODE)")
    print("=" * 74)
    ok1 = ensure_server_running(port=8998, db_path=db1, sibling=False, headless=True)
    ok2 = ensure_server_running(port=8997, db_path=db2, sibling=True, headless=True)

    if not with_cloudflare:
        print()
        print("=" * 74)
        print("   🎉 2 MÁY CHỦ ĐÃ CHẠY NGẦM THÀNH CÔNG (TÁCH BIỆT DỮ LIỆU 100%)")
        print("=" * 74)
        print(f"   🏪 Máy chủ 1 (MCare - Sài Gòn)   : http://localhost:8998  (DB: data/pos.db)")
        print(f"   🏖️ Máy chủ 2 (PetNT - Nha Trang) : http://localhost:8997  (DB: data/pos_instance2.db)")
        print("=" * 74)
        return ok1 and ok2

    cf_exe = resolve_cloudflared(auto_download=True)
    if not cf_exe:
        print("❌ Không tìm thấy cloudflared.exe để mở link online.")
        return False

    kill_zombie_cloudflared()
    print("\n🌐 Đang mở 2 đường truyền Cloudflare Tunnel cho cổng 8998 và 8997...")
    proc1, url1 = _start_cf_tunnel_for_port(cf_exe, 8998)
    proc2, url2 = _start_cf_tunnel_for_port(cf_exe, 8997)

    synced = _sync_live_tunnel_urls_to_d1(url1, url2)

    os.system("cls" if os.name == "nt" else "clear")
    print("=" * 78)
    print("        🎉 2 MÁY CHỦ POS SONG SONG ĐÃ SẴN SÀNG HOẠT ĐỘNG! 🎉")
    print("=" * 78)
    print()
    print("   🏪 MÁY CHỦ 1 (CHI NHÁNH SÀI GÒN - MCare POS | DB: data/pos.db):")
    print(f"      • Trên máy này  : http://localhost:8998")
    print(f"      • Domain cố định: \033[1;33mhttps://mcarepet.vercel.app\033[0m")
    print(f"      • Link Tunnel   : \033[1;32m{url1 or 'Đang kết nối...'}\033[0m")
    print()
    print("   🏖️ MÁY CHỦ 2 (CHI NHÁNH NHA TRANG - PetNT POS | DB: data/pos_instance2.db):")
    print(f"      • Trên máy này  : http://localhost:8997")
    print(f"      • Domain cố định: \033[1;33mhttps://petnt.vercel.app\033[0m")
    print(f"      • Link Tunnel   : \033[1;36m{url2 or 'Đang kết nối...'}\033[0m")
    print()
    if synced:
        print("   ✅ ĐÃ TỰ ĐỘNG GẮN 2 LINK TUNNEL VÀO 2 DOMAIN VERCEL (mcarepet & petnt)!")
    print("   -------------------------------------------------------------------------")
    print("   💡 Cả 2 máy chủ chạy ngầm độc lập, chung 1 bộ code nhưng 2 file DB riêng.")
    print("   ⚠️ Giữ cửa sổ này nếu cần dùng kết nối Online về máy tính này.")
    print("=" * 78)

    try:
        while (proc1 and proc1.poll() is None) or (proc2 and proc2.poll() is None):
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Đang đóng kết nối Cloudflare Tunnel...")
    finally:
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
            print(f"Gán link {raw_url} lên {target_proj}: {'Thành công' if ok else 'Thất bại'}")
            return
    if "--dual-local" in sys.argv:
        run_dual_servers(with_cloudflare=False)
        return
    if "--dual" in sys.argv:
        run_dual_servers(with_cloudflare=True)
        return

    print("=" * 70)
    print("    POS - TỰ ĐỘNG KHỞI TẠO ĐƯỜNG DẪN CHIA SẺ ONLINE (CLOUDFLARE)")
    print("=" * 70)

    sibling_mode = "--sibling" in sys.argv or os.environ.get("POS_SIBLING_MODE") == "1"
    refresh_db = "--refresh-db" in sys.argv or os.environ.get("POS_REFRESH_TEST_DB") == "1"
    target_port = PORT
    target_db = os.environ.get("POS_DB_PATH")

    if sibling_mode:
        target_port = int(os.environ.get("POS_PORT", str(find_sibling_port())))
        if not target_db:
            target_db = os.path.join(BASE_DIR, "data", "pos_instance2.db")
        main_db = os.path.join(BASE_DIR, "data", "pos.db")
        if os.path.abspath(target_db) != os.path.abspath(main_db):
            clone_db_for_sibling(main_db, target_db, force_refresh=refresh_db)
        print(f"🔀 Chế độ chạy song song (Instance 2): Port {target_port} | DB: {target_db}")

    cf_exe = resolve_cloudflared(auto_download=True)
    if not cf_exe:
        print(f"❌ Không tìm thấy và không tải được cloudflared.exe!")
        input("\nBấm Enter để thoát...")
        return

    # 1. Dọn dẹp tiến trình cloudflared cũ (nếu không ở chế độ song song)
    if not sibling_mode:
        kill_zombie_cloudflared()

    # 2. Đảm bảo server đang chạy
    ensure_server_running(port=target_port, db_path=target_db)

    print(f"\n🌐 Đang kết nối Cloudflare tạo tên miền tạm (HTTPS) cho cổng {target_port}...")
    cmd = [cf_exe, "tunnel", "--protocol", "http2", "--url", f"http://127.0.0.1:{target_port}"]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace"
        )
    except Exception as e:
        print(f"❌ Lỗi khởi chạy cloudflared: {e}")
        input("\nBấm Enter để thoát...")
        return

    tunnel_url = None
    url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")

    # Đọc stderr để bắt link trycloudflare
    start_time = time.time()
    try:
        for line in proc.stderr:
            # Tìm match
            match = url_pattern.search(line)
            if match:
                tunnel_url = match.group(0)
                break
            if time.time() - start_time > 30:
                break
    except Exception as e:
        print(f"Lỗi đọc kết nối: {e}")

    if not tunnel_url:
        print("❌ Không nhận được đường link từ Cloudflare sau 30 giây.")
        print("Kiểm tra lại kết nối Internet của máy.")
        kill_zombie_cloudflared()
        input("\nBấm Enter để thoát...")
        return

    # Tự động copy vào clipboard
    copied = copy_to_clipboard(tunnel_url)
    synced = _sync_tunnel_to_vercel_endpoint("mcarepet.vercel.app", tunnel_url)

    # Tự động mở trình duyệt
    try:
        webbrowser.open(tunnel_url)
    except Exception:
        pass

    # Xóa màn hình và in banner đẹp
    os.system("cls" if os.name == "nt" else "clear")
    print("=" * 76)
    print("             🎉 ĐƯỜNG LINK ONLINE ĐÃ SẴN SÀNG HOẠT ĐỘNG! 🎉")
    print("=" * 76)
    print()
    print(f"   👉 LINK TRUY CẬP TRỰC TIẾP :  \033[1;32m{tunnel_url}\033[0m")
    print(f"   🌐 DOMAIN CỐ ĐỊNH (VERCEL) :  \033[1;33mhttps://mcarepet.vercel.app\033[0m")
    print()
    if synced:
        print("   ✅ ĐÃ TỰ ĐỘNG GẮN LINK VÀO DOMAIN https://mcarepet.vercel.app!")
    if copied:
        print("   ✅ ĐÃ TỰ ĐỘNG COPY VÀO BỘ NHỚ TẠM (CLIPBOARD)!")
        print("      Chỉ cần nhấn Ctrl + V trong Zalo / Facebook / Tin nhắn để gửi link.")
    print("   ✅ ĐÃ TỰ ĐỘNG MỞ TRÌNH DUYỆT ĐỂ BẠN KIỂM TRA.")
    print()
    print("   ---------------------------------------------------------------------")
    print("   ⚠️  QUAN TRỌNG:")
    print("   1. KHÔNG TẮT cửa sổ này nếu bạn muốn tiếp tục truy cập test.")
    print("   2. Để dừng chia sẻ: Chỉ cần bấm Ctrl + C hoặc ĐÓNG cửa sổ này.")
    print("=" * 76)
    print()
    print("Đang duy trì kết nối bảo mật (Cloudflare Tunnel)...")

    try:
        # Giữ tiến trình chạy cho đến khi người dùng tắt hoặc nhấn Ctrl+C
        while proc.poll() is None:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Đang ngắt kết nối chia sẻ...")
    finally:
        _sync_tunnel_to_vercel_endpoint("mcarepet.vercel.app", "")
        kill_zombie_cloudflared()
        print("Đã đóng kết nối online an toàn.")

if __name__ == "__main__":
    main()

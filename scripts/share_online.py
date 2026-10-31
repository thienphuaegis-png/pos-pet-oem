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
        urllib.request.urlretrieve(CLOUDFLARED_DL_URL, CLOUDFLARED_EXE)
        if os.path.exists(CLOUDFLARED_EXE) and os.path.getsize(CLOUDFLARED_EXE) > 1_000_000:
            print(f"✅ Đã tải xong: {CLOUDFLARED_EXE}")
            return CLOUDFLARED_EXE
    except Exception as e:
        print(f"❌ Lỗi tải cloudflared.exe: {e}")
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

def ensure_server_running(port=None, db_path=None):
    target_port = port if port is not None else PORT
    if is_server_running(target_port):
        print(f"✅ Máy chủ POS đang hoạt động tại http://127.0.0.1:{target_port}")
        return True

    print(f"⚠️ Phát hiện máy chủ POS (cổng {target_port}) chưa được bật.")
    print(f"🚀 Đang tự động khởi động máy chủ POS trên cổng {target_port}...")

    env = os.environ.copy()
    env["POS_PORT"] = str(target_port)
    if db_path:
        env["POS_DB_PATH"] = os.path.abspath(db_path)

    python_exe = os.path.join(BASE_DIR, ".venv", "Scripts", "python.exe")
    if not os.path.exists(python_exe):
        python_exe = sys.executable
    main_py = os.path.join(BASE_DIR, "main.py")
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
            print(f"✅ Máy chủ POS đã khởi động thành công sau {i+1} giây!")
            return True
        print(f"   Đang chờ máy chủ sẵn sàng... ({i+1}s)")

    print("⚠️ Máy chủ khởi động hơi lâu, vẫn tiếp tục kết nối Cloudflare...")
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

def main():
    os.chdir(BASE_DIR)
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
    print(f"   👉 LINK TRUY CẬP:  \033[1;32m{tunnel_url}\033[0m")
    print()
    if copied:
        print("   ✅ ĐÃ TỰ ĐỘNG COPY VÀO BỘ NHỚ TẠM (CLIPBOARD)!")
        print("      Chỉ cần nhấn Ctrl + V trong Zalo / Facebook / Tin nhắn để gửi link.")
    print("   ✅ ĐÃ TỰ ĐỘNG MỞ TRÌNH DUYỆT ĐỂ BẠN KIỂM TRA.")
    print()
    print("   ---------------------------------------------------------------------")
    print("   ⚠️  QUAN TRỌNG:")
    print("   1. KHÔNG TẮT cửa sổ này nếu bạn muốn người khác tiếp tục truy cập test.")
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
        kill_zombie_cloudflared()
        print("Đã đóng kết nối online an toàn.")

if __name__ == "__main__":
    main()

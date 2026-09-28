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
import subprocess
import urllib.request
import webbrowser

PORT = 8999
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLOUDFLARED_EXE = os.path.join(BASE_DIR, "cloudflared.exe")

def is_server_running():
    try:
        req = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/settings", timeout=2)
        return req.getcode() in [200, 401, 403, 404]
    except Exception:
        return False

def ensure_server_running():
    if is_server_running():
        print(f"✅ Máy chủ POS Offline đang hoạt động tại http://127.0.0.1:{PORT}")
        return True

    print(f"⚠️ Phát hiện máy chủ POS (cổng {PORT}) chưa được bật.")
    print("🚀 Đang tự động khởi động máy chủ POS...")

    chay_bat = os.path.join(BASE_DIR, "chay_ngay.bat")
    if os.path.exists(chay_bat):
        subprocess.Popen(f'start "POS OFFLINE SERVER (PORT 8999)" cmd /c "{chay_bat}"', shell=True)
    else:
        # Chạy trực tiếp qua python
        python_exe = os.path.join(BASE_DIR, ".venv", "Scripts", "python.exe")
        if not os.path.exists(python_exe):
            python_exe = sys.executable
        main_py = os.path.join(BASE_DIR, "main.py")
        subprocess.Popen(f'start "POS OFFLINE SERVER (PORT 8999)" "{python_exe}" "{main_py}"', shell=True)

    # Đợi server lên trong tối đa 15 giây
    for i in range(15):
        time.sleep(1)
        if is_server_running():
            print(f"✅ Máy chủ POS Offline đã khởi động thành công sau {i+1} giây!")
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

def main():
    os.chdir(BASE_DIR)
    print("=" * 70)
    print("    POS OFFLINE - TỰ ĐỘNG KHỞI TẠO ĐƯỜNG DẪN CHIA SẺ ONLINE")
    print("=" * 70)

    if not os.path.exists(CLOUDFLARED_EXE):
        print(f"❌ Không tìm thấy file {CLOUDFLARED_EXE}!")
        print("Vui lòng tải cloudflared.exe đặt vào thư mục gốc của phần mềm.")
        input("\nBấm Enter để thoát...")
        return

    # 1. Dọn dẹp tiến trình cũ
    kill_zombie_cloudflared()

    # 2. Đảm bảo server 8999 đang chạy
    ensure_server_running()

    print("\n🌐 Đang kết nối mạng lưới Cloudflare để tạo đường dẫn bảo mật (HTTPS)...")
    cmd = [CLOUDFLARED_EXE, "tunnel", "--protocol", "http2", "--url", f"http://127.0.0.1:{PORT}"]

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

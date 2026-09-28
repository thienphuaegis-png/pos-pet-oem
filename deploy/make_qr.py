"""Sinh QR code cho điện thoại nhân viên quét vào POS.

Chạy trên MÁY CHỦ tiệm sau khi cài. In QR ra dán ở quầy.
Lý do cần QR: Android Chrome không resolve `.local`, nên điện thoại buộc
dùng IP — bắt nhân viên nhớ 192.168.x.x:8999 là không thực tế.
"""
import socket
import os

PORT = 8999


def detect_lan_ip() -> str:
    """Lấy IP LAN thật của máy này.

    Dùng UDP connect tới 8.8.8.8 — KHÔNG gửi packet nào (UDP không handshake),
    chỉ để OS chọn interface mặc định rồi đọc địa chỉ nguồn. Cách
    socket.gethostbyname(socket.gethostname()) hay trả 127.0.0.1 trên Windows
    nên không dùng được.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    finally:
        s.close()


def make_qr(url: str, out_path: str) -> str:
    import qrcode
    img = qrcode.make(url)
    parent = os.path.dirname(os.path.abspath(out_path))
    os.makedirs(parent, exist_ok=True)
    img.save(out_path)
    return out_path


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    ip = detect_lan_ip()
    url = f"http://{ip}:{PORT}"
    out = os.path.join(here, "QR_POS.png")
    make_qr(url, out)
    # Ghi IP ra file để .bat đọc lại bằng `set /p`, tránh parse stdout
    with open(os.path.join(here, "server_ip.txt"), "w") as f:
        f.write(ip)
    print(f"DIA CHI POS: {url}")
    print(f"QR da luu:   {out}")

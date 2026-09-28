"""Test sinh QR code truy cập POS cho điện thoại nhân viên.

Vì sao cần QR: Android Chrome không resolve tên miền `.local`, nên điện thoại
buộc phải dùng IP. Bắt nhân viên nhớ 192.168.x.x:8999 là không thực tế.
"""
import sys, os, ipaddress, tempfile
sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "deploy"))
from make_qr import detect_lan_ip, make_qr


def test_detect_lan_ip_is_valid_private():
    ip = detect_lan_ip()
    addr = ipaddress.ip_address(ip)
    assert addr.is_private, f"IP phải thuộc mạng nội bộ, nhận {ip}"
    assert not addr.is_loopback, "Không được trả 127.0.0.1 — máy con không vào được"


def test_make_qr_creates_valid_png():
    out = os.path.join(tempfile.gettempdir(), "test_qr_pos.png")
    if os.path.exists(out):
        os.remove(out)
    result = make_qr("http://192.168.1.50:8999", out)
    assert os.path.exists(result), "Không sinh được file QR"
    assert os.path.getsize(result) > 200, "File QR rỗng hoặc lỗi"
    with open(result, "rb") as f:
        assert f.read(8) == b"\x89PNG\r\n\x1a\n", "Không phải PNG hợp lệ"
    os.remove(result)


def test_qr_readable_size():
    """QR phải đủ lớn để điện thoại quét được — không chỉ 'có file PNG'."""
    out = os.path.join(tempfile.gettempdir(), "test_qr_size.png")
    make_qr("http://192.168.2.8:8999", out)
    from PIL import Image
    with Image.open(out) as img:
        w, h = img.size
    assert w > 100 and h > 100, f"Ảnh QR quá nhỏ để quét: {w}x{h}"
    os.remove(out)


if __name__ == "__main__":
    test_detect_lan_ip_is_valid_private(); print("✓ detect IP nội bộ OK")
    test_make_qr_creates_valid_png();      print("✓ sinh QR PNG hợp lệ")
    test_qr_readable_size();               print("✓ kích thước QR quét được")
    print("\nALL PASS ✅")

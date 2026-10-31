import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def test_main_py_has_no_ngrok():
    path = os.path.join(ROOT, "main.py")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "ngrok" not in content.lower(), f"main.py still contains ngrok reference!"
    assert "pos-server:8998" in content, "main.py should reference Tailscale URL"

def test_launcher_py_has_no_ngrok():
    path = os.path.join(ROOT, "launcher.py")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "ngrok" not in content.lower(), f"launcher.py still contains ngrok reference!"
    assert "pos-server:8998" in content, "launcher.py should reference Tailscale URL"

def test_build_exe_has_no_ngrok_copy():
    path = os.path.join(ROOT, "deploy", "build_exe.bat")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "ngrok" not in content.lower(), "build_exe.bat should not copy ngrok.exe!"

def test_cloudflare_preserved_for_testing():
    """Đảm bảo file Cloudflare vẫn được giữ lại để anh test (kể cả bản chạy song song)."""
    cf_bat = os.path.join(ROOT, "CHAY_ONLINE_CLOUDFLARE.bat")
    sibling_bat = os.path.join(ROOT, "CHAY_BAN_SONG_SONG_CLOUDFLARE.bat")
    assert os.path.exists(cf_bat), "CHAY_ONLINE_CLOUDFLARE.bat must be preserved for user testing!"
    assert os.path.exists(sibling_bat), "CHAY_BAN_SONG_SONG_CLOUDFLARE.bat must exist for sibling instance!"
    from scripts import share_online
    assert hasattr(share_online, "resolve_cloudflared")
    assert hasattr(share_online, "find_sibling_port")
    assert share_online.find_sibling_port(8997, (8998, 8999)) not in (8998, 8999)

def test_legacy_ngrok_script_removed():
    legacy_ngrok = os.path.join(ROOT, "deploy", "legacy_scripts", "CHAY_ONLINE_CO_DINH.bat")
    assert not os.path.exists(legacy_ngrok), "CHAY_ONLINE_CO_DINH.bat should have been deleted!"

import os
import subprocess
from pathlib import Path
from fastapi.testclient import TestClient

import database
from routers.auth import _make_token
from scripts.cli_ui import (
    _EMOJI_RE,
    has_gui_display,
    render_dual_status_box,
    safe_text,
    to_ascii_vi,
)
from server import app

ROOT = Path(__file__).resolve().parents[1]


def test_cli_ui_zero_question_marks_in_utf8_and_legacy_cp1252():
    raw_msg = "🚀 Đang kiểm tra & khởi chạy ngầm 2 máy chủ POS nội bộ (cổng 8998 & 8997)..."
    utf8_out = safe_text(raw_msg, force_ascii=False)
    ascii_out = safe_text(raw_msg, force_ascii=True)

    assert "🚀" not in utf8_out
    assert "?" not in utf8_out
    assert "Đang kiểm tra & khởi chạy ngầm" in utf8_out

    # Trên máy Windows cũ cp1252 / cp437 hoặc Linux TTY cổ: encode cp1252/ascii tuyệt đối không sinh '?'
    assert "?" not in ascii_out
    assert ascii_out.encode("cp1252", errors="strict").decode("cp1252") == ascii_out
    assert ascii_out.encode("ascii", errors="strict").decode("ascii") == ascii_out
    assert "Dang kiem tra & khoi chay ngam 2 may chu POS noi bo" in ascii_out


def test_dual_status_box_borders_perfectly_aligned_both_modes():
    rows = [
        {"name": "MCare SG", "port": 8998, "ok": True, "public_url": "https://mcarepet.vercel.app"},
        {"name": "PetNT NT", "port": 8997, "ok": True, "public_url": "https://petnt.vercel.app"},
    ]
    for ascii_mode in (False, True):
        box = render_dual_status_box(
            rows,
            footer_lines=["[OK] Tailscale Funnel : pos-server.tail2d304b.ts.net (443, 8443)"],
            force_ascii=ascii_mode,
        )
        table_lines = [ln for ln in box.splitlines() if ln.startswith(("+", "|"))]
        widths = {len(ln) for ln in table_lines}
        assert len(widths) == 1, f"Khung bảng lệch cột (mode={ascii_mode}):\n{box}"
        assert "?" not in box


def test_root_bats_and_python_launchers_have_no_mojibake_or_emojis():
    root_bats = [
        "CAI_TAILSCALE_2_MAY_CHU.bat",
        "CHAY_2_MAY_CHU.bat",
        "CHAY_POS.bat",
        "CHAY_ONLINE_CLOUDFLARE.bat",
        "CHAY_BAN_SONG_SONG_CLOUDFLARE.bat",
        "CAP_NHAT.bat",
        "TAT_POS.bat",
        "CHAY_TEST_LOCAL.bat",
    ]
    for name in root_bats:
        src = (ROOT / name).read_text(encoding="utf-8")
        for idx, line in enumerate(src.splitlines(), 1):
            s = line.strip()
            if s.lower().startswith("echo"):
                bad = [c for c in s if ord(c) > 127]
                assert not bad, f"{name}:{idx} có ký tự có dấu/emoji trong echo: {bad}"
            if not s.startswith(("REM", "::")):
                assert "timeout /t" not in s.lower(), f"{name}:{idx} còn dùng timeout /t: {s}"

    for py_rel in ("scripts/setup_tailscale_dual.py", "scripts/share_online.py", "launcher.py"):
        py_src = (ROOT / py_rel).read_text(encoding="utf-8")
        assert not _EMOJI_RE.search(py_src), f"{py_rel} vẫn còn ký tự Emoji gây vỡ font trên console cũ!"


def test_linux_pos_server_sh_lf_and_bash_syntax():
    sh_path = ROOT / "pos_server.sh"
    assert sh_path.exists()
    raw = sh_path.read_bytes()
    assert b"\r\n" not in raw, "pos_server.sh phải dùng LF thuần (không được có CRLF trên Linux)"
    candidates = [
        Path(r"C:\Program Files\Git\bin\bash.exe"),
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Git" / "bin" / "bash.exe",
    ]
    hermes_tools = Path(os.environ.get("LOCALAPPDATA", "")) / "hermes" / "tools"
    if hermes_tools.exists():
        candidates.extend(hermes_tools.glob("git-*/usr/bin/bash.exe"))
    if os.name != "nt":
        candidates.append(Path("/bin/bash"))
    bash_exe = next((str(p) for p in candidates if p.exists()), None)
    if bash_exe:
        res = subprocess.run([bash_exe, "-n", sh_path.as_posix()], capture_output=True, text=True)
        assert res.returncode == 0, f"Lỗi cú pháp bash trong pos_server.sh: {res.stderr}"


def test_headless_cli_flag_disables_browser():
    assert has_gui_display(["prog", "--no-browser"]) is False
    assert to_ascii_vi("Đường truyền cố định — Đã bật") == "Duong truyen co dinh - Da bat"


def test_server_status_page_and_admin_overview_api():
    database.init_db()
    conn = database.get_db()
    adm = conn.execute(
        "SELECT id, COALESCE(token_version, 0) tv FROM staff WHERE role IN ('owner', 'admin') ORDER BY id LIMIT 1"
    ).fetchone()
    conn.close()
    headers = {"Authorization": f"Bearer {_make_token(adm['id'], adm['tv'], hours=2, typ='access')}"}

    client = TestClient(app)
    # Local status page works directly on loopback
    r_html = client.get("/server-status")
    assert r_html.status_code == 200
    assert "Trung Tâm Điều Khiển Máy Chủ" in r_html.text
    assert "mcarepet.vercel.app" in r_html.text
    assert "petnt.vercel.app" in r_html.text
    assert "data:image/png;base64," in r_html.text

    # Admin API requires auth and returns structured overview
    assert client.get("/api/system/server-overview").status_code == 401
    r_api = client.get("/api/system/server-overview", headers=headers)
    assert r_api.status_code == 200
    body = r_api.json()
    assert len(body["instances"]) == 2
    assert body["instances"][0]["port"] == 8998
    assert body["instances"][1]["port"] == 8997

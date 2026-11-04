import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_cai_tailscale_2_may_chu_bat_hygiene():
    bat_path = ROOT / "CAI_TAILSCALE_2_MAY_CHU.bat"
    assert bat_path.exists()
    src = bat_path.read_text(encoding="utf-8")

    assert "net session" in src and "-Verb RunAs" in src
    assert "tailscale-setup-latest-amd64.msi" in src
    assert "100.64.0.0/10" in src
    assert "localport=8998" in src and "localport=8997" in src

    for i, line in enumerate(src.splitlines(), 1):
        s = line.strip()
        if s.lower().startswith("echo"):
            non_ascii = [c for c in s if ord(c) > 127]
            assert not non_ascii, f"Line {i} has non-ASCII echo: {s}"
        if not s.startswith(("REM", "::", "echo")):
            assert not (re.search(r"\btimeout(\.exe)?\b", s, re.I) and "/t" in s), f"Line {i} uses timeout /t"
            assert not re.search(r'(?<!["\\])\bwinget\b(?!\.exe")', s) or "%WINGET%" in s or "WINGET=" in s


def test_setup_tailscale_dual_orchestration(monkeypatch, tmp_path):
    from scripts import setup_tailscale_dual as std
    from scripts import share_online

    marker = tmp_path / "tailscale_funnel.json"
    monkeypatch.setattr(std, "MARKER_FILE", str(marker))
    monkeypatch.setattr(std, "find_tailscale_exe", lambda: r"C:\Program Files\Tailscale\tailscale.exe")
    monkeypatch.setattr(std, "kill_legacy_cloudflare_runners", lambda: None)
    monkeypatch.setattr(std, "register_windows_autostart", lambda: True)

    started_ports = []
    monkeypatch.setattr(
        share_online,
        "ensure_server_running",
        lambda port=None, db_path=None, sibling=False, headless=True: started_ports.append((port, sibling, headless)) or True,
    )

    monkeypatch.setattr(
        std,
        "get_tailscale_status",
        lambda ts_exe: {"BackendState": "Running", "Self": {"DNSName": "pos-server.tail9999.ts.net."}},
    )
    monkeypatch.setattr(subprocess, "run", lambda *a, **kw: subprocess.CompletedProcess(a[0], 0, "", ""))

    funnel_calls = []
    monkeypatch.setattr(
        std,
        "configure_funnel_port",
        lambda ts_exe, https_port, local_port: funnel_calls.append((https_port, local_port)) or True,
    )

    synced_vercel = {}
    monkeypatch.setattr(
        std,
        "sync_vercel_url",
        lambda host, url, retries=3: synced_vercel.__setitem__(host, url) or True,
    )
    monkeypatch.setattr(std, "verify_vercel_status", lambda host: synced_vercel.get(host, ""))

    ok = std.setup_tailscale_dual(verify_only=False)
    assert ok is True
    assert started_ports == [(8998, False, True), (8997, True, True)]
    assert funnel_calls == [(443, 8998), (8443, 8997)]
    assert synced_vercel == {
        "mcarepet.vercel.app": "https://pos-server.tail9999.ts.net",
        "petnt.vercel.app": "https://pos-server.tail9999.ts.net:8443",
    }
    saved = json.loads(marker.read_text(encoding="utf-8"))
    assert saved["url_mcare"] == "https://pos-server.tail9999.ts.net"
    assert saved["url_petnt"] == "https://pos-server.tail9999.ts.net:8443"


def test_cloudflare_stderr_drain_prevents_64kb_pipe_deadlock(monkeypatch):
    """Kiểm chứng lỗi gốc: tiến trình con ghi >256KB vào stderr sau khi in link tunnel
    KHÔNG bị treo nghẽn bộ đệm PIPE 64KB trên Windows."""
    from scripts import share_online

    # Giả lập cloudflared.exe bằng python -c in link trycloudflare rồi xả 300KB log vào stderr
    fake_script = (
        "import sys; "
        "sys.stderr.write('INF |  https://anti-deadlock-probe.trycloudflare.com  |\\n'); "
        "sys.stderr.flush(); "
        "[sys.stderr.write('X' * 1024 + '\\n') for _ in range(300)]; "
        "sys.stderr.flush()"
    )
    orig_popen = subprocess.Popen

    def fake_popen(cmd, **kwargs):
        return orig_popen([sys.executable, "-c", fake_script], **kwargs)

    monkeypatch.setattr(share_online.subprocess, "Popen", fake_popen)
    proc, url = share_online._start_cf_tunnel_for_port("dummy_cf.exe", 8998)
    assert url == "https://anti-deadlock-probe.trycloudflare.com"
    # Nếu stderr không được drain liên tục, proc.wait(timeout=5) sẽ TimeoutExpired trên Windows!
    rc = proc.wait(timeout=5.0)
    assert rc == 0

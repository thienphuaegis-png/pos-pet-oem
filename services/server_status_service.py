"""
Dịch vụ kiểm tra sức khỏe 2 máy chủ POS (8998 MCare & 8997 PetNT),
trạng thái Tailscale Funnel, đồng bộ domain Vercel và render trang Web `/server-status`
sắc nét cho mọi trình duyệt (kể cả Windows 7/10 cũ và Linux Desktop).
"""
from __future__ import annotations

import base64
import html
import io
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
MARKER_FILE = BASE_DIR / "data" / "tailscale_funnel.json"

_QR_CACHE: dict[str, str] = {}


def make_qr_data_uri(url: str) -> str:
    """Sinh ảnh QR PNG dạng data URI (cache trong RAM <1ms)."""
    if not url:
        return ""
    if url in _QR_CACHE:
        return _QR_CACHE[url]
    try:
        import qrcode

        qr = qrcode.QRCode(version=1, box_size=4, border=2)
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#0f172a", back_color="#ffffff")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
        _QR_CACHE[url] = uri
        return uri
    except Exception:
        return ""


def _detect_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.3)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def _probe_local_port(port: int, current_port: int | None = None) -> dict:
    if current_port and int(port) == int(current_port):
        return {"ok": True, "version": None}
    try:
        s = socket.create_connection(("127.0.0.1", port), timeout=0.25)
        s.close()
    except OSError:
        return {"ok": False, "version": None}
    try:
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/ping",
            headers={"User-Agent": "POS-Server-Panel"},
        )
        with urllib.request.urlopen(req, timeout=0.8) as resp:
            if resp.status == 200:
                body = json.loads(resp.read().decode("utf-8", errors="replace"))
                return {"ok": True, "version": body.get("version")}
    except Exception:
        pass
    return {"ok": False, "version": None}


def _probe_vercel_bridge(host: str) -> str:
    try:
        req = urllib.request.Request(
            f"https://{host}/api/tunnel/status",
            headers={"User-Agent": "POS-Server-Panel"},
        )
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
            return (data.get("live_tunnel_url") or "").strip()
    except Exception:
        return ""


def _detect_tailscale_info() -> dict:
    candidates = [
        r"C:\Program Files\Tailscale\tailscale.exe",
        r"C:\Program Files (x86)\Tailscale\tailscale.exe",
        shutil.which("tailscale"),
        shutil.which("tailscale.exe"),
    ]
    ts_exe = next((p for p in candidates if p and os.path.exists(p)), None)

    marker = {}
    if MARKER_FILE.exists():
        try:
            marker = json.loads(MARKER_FILE.read_text(encoding="utf-8", errors="replace"))
        except Exception:
            marker = {}

    dns_name = (marker.get("dns_name") or "").strip()
    backend_state = "Configured" if dns_name else "Unknown"

    if ts_exe and not dns_name:
        try:
            res = subprocess.run(
                [ts_exe, "status", "--json"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=2.0,
            )
            if res.returncode == 0 and res.stdout.strip():
                st = json.loads(res.stdout)
                backend_state = st.get("BackendState") or backend_state
                dns_name = ((st.get("Self") or {}).get("DNSName") or "").strip().rstrip(".")
        except Exception:
            pass

    return {
        "installed": bool(ts_exe),
        "exe_path": ts_exe or "",
        "backend_state": backend_state,
        "dns_name": dns_name,
        "funnel_configured": MARKER_FILE.exists() and bool(marker.get("url_mcare")),
        "url_mcare": marker.get("url_mcare") or (f"https://{dns_name}" if dns_name else ""),
        "url_petnt": marker.get("url_petnt") or (f"https://{dns_name}:8443" if dns_name else ""),
        "updated_at": marker.get("updated_at") or "",
    }


def _detect_autostart_status() -> dict:
    if os.name == "nt":
        startup_lnk = (
            Path(os.environ.get("APPDATA", ""))
            / "Microsoft"
            / "Windows"
            / "Start Menu"
            / "Programs"
            / "Startup"
            / "POS_Mastercare_AutoStart.lnk"
        )
        enabled = startup_lnk.exists()
        return {
            "enabled": enabled,
            "platform": "windows",
            "label": "Windows Startup (start_server.vbs)" if enabled else "Chưa đăng ký tự chạy cùng Windows",
        }
    sys_unit = Path("/etc/systemd/system/pos-petcare-8998.service")
    usr_unit = Path.home() / ".config" / "systemd" / "user" / "pos-petcare-8998.service"
    enabled = sys_unit.exists() or usr_unit.exists()
    return {
        "enabled": enabled,
        "platform": "linux",
        "label": "Linux systemd (pos-petcare-8998 & 8997)" if enabled else "Chưa đăng ký systemd (chạy ./pos_server.sh install)",
    }


def collect_server_overview(current_port: int | None = None, check_vercel: bool = False) -> dict:
    from version_helper import get_app_version_info, get_git_metadata

    ver = get_app_version_info()
    commit_hash = (ver.get("commit_hash") or ver.get("commit") or get_git_metadata()[0] or "").strip()
    clean_ver = str(ver.get("version") or "").lstrip("v")
    lan_ip = _detect_lan_ip()
    ts = _detect_tailscale_info()
    autostart = _detect_autostart_status()

    with ThreadPoolExecutor(max_workers=4) as pool:
        f_8998 = pool.submit(_probe_local_port, 8998, current_port)
        f_8997 = pool.submit(_probe_local_port, 8997, current_port)
        f_vm = pool.submit(_probe_vercel_bridge, "mcarepet.vercel.app") if check_vercel else None
        f_vp = pool.submit(_probe_vercel_bridge, "petnt.vercel.app") if check_vercel else None

        p8998 = f_8998.result()
        p8997 = f_8997.result()
        vercel_mcare_target = f_vm.result() if f_vm else ts["url_mcare"]
        vercel_petnt_target = f_vp.result() if f_vp else ts["url_petnt"]

    mcare_public = "https://mcarepet.vercel.app"
    petnt_public = "https://petnt.vercel.app"

    instances = [
        {
            "key": "mcare",
            "name": "Chi nhánh 1: MCare Sài Gòn",
            "port": 8998,
            "db": "data/pos.db",
            "local_ok": p8998["ok"],
            "local_url": "http://127.0.0.1:8998",
            "lan_url": f"http://{lan_ip}:8998",
            "public_domain": mcare_public,
            "tunnel_url": ts["url_mcare"],
            "vercel_target": vercel_mcare_target,
            "qr_data_uri": make_qr_data_uri(mcare_public if ts["funnel_configured"] else f"http://{lan_ip}:8998"),
        },
        {
            "key": "petnt",
            "name": "Chi nhánh 2: PetNT Nha Trang",
            "port": 8997,
            "db": "data/pos_instance2.db",
            "local_ok": p8997["ok"],
            "local_url": "http://127.0.0.1:8997",
            "lan_url": f"http://{lan_ip}:8997",
            "public_domain": petnt_public,
            "tunnel_url": ts["url_petnt"],
            "vercel_target": vercel_petnt_target,
            "qr_data_uri": make_qr_data_uri(petnt_public if ts["funnel_configured"] else f"http://{lan_ip}:8997"),
        },
    ]

    return {
        "timestamp": time.strftime("%d/%m/%Y %H:%M:%S"),
        "system": {
            "os": f"{platform.system()} {platform.release()}",
            "python": sys.version.split()[0],
            "hostname": socket.gethostname(),
            "lan_ip": lan_ip,
            "version": clean_ver,
            "commit": commit_hash,
        },
        "tailscale": ts,
        "autostart": autostart,
        "instances": instances,
    }


def render_local_server_status_html(overview: dict) -> str:
    """Render trang HTML độc lập sắc nét cho `http://127.0.0.1:8998/server-status` (không phụ thuộc CDN ngoài)."""
    sys_info = overview["system"]
    ts = overview["tailscale"]
    auto = overview["autostart"]
    insts = overview["instances"]
    s1, s2 = insts[0], insts[1]

    def _chip(label: str, ok: bool) -> str:
        cls = "chip-ok" if ok else "chip-warn"
        st = "OK" if ok else "Chờ bật"
        return f'<div class="step-chip {cls}">{html.escape(label)}: <b>{st}</b></div>'

    cards_html = []
    for item in insts:
        ok = item["local_ok"]
        dot_cls = "dot-ok" if ok else "dot-off"
        badge_txt = "Đang chạy ngầm" if ok else "Chưa bật"
        badge_cls = "badge-ok" if ok else "badge-off"
        pub = html.escape(item["public_domain"])
        tun = html.escape(item["tunnel_url"] or "Chưa cấu hình Tailscale Funnel")
        loc = html.escape(item["local_url"])
        lan = html.escape(item["lan_url"])
        qr_img = (
            f'<img src="{item["qr_data_uri"]}" alt="QR" class="qr-box">'
            if item.get("qr_data_uri")
            else ""
        )
        cards_html.append(f"""
        <div class="branch-card">
          <div class="branch-main">
            <div class="branch-head">
              <span class="branch-title"><span class="dot {dot_cls}"></span>{html.escape(item['name'])}</span>
              <span class="badge {badge_cls}">{badge_txt} &middot; Port {item['port']}</span>
            </div>
            <div class="meta-line">Cơ sở dữ liệu riêng: <code>{html.escape(item['db'])}</code></div>
            <div class="url-row">
              <span class="url-lbl">Link Online cố định:</span>
              <a href="{pub}" target="_blank" class="url-val">{pub}</a>
              <button type="button" class="btn-copy" onclick="copyTxt('{pub}', this)">Copy</button>
            </div>
            <div class="url-row">
              <span class="url-lbl">Đích Tailscale:</span>
              <span class="url-sub">{tun}</span>
            </div>
            <div class="url-row">
              <span class="url-lbl">Mạng nội bộ (LAN):</span>
              <a href="{lan}" target="_blank" class="url-sub">{lan}</a>
              <span style="color:#cbd5e1">|</span>
              <a href="{loc}" target="_blank" class="url-sub">{loc}</a>
            </div>
            <div class="btn-row">
              <a href="{loc}" class="btn-primary">Mở POS Bán Hàng ({item['port']}) &rarr;</a>
            </div>
          </div>
          {qr_img}
        </div>
        """)

    online_cnt = sum(1 for x in insts if x["local_ok"])
    if online_cnt == len(insts):
        sub_txt = "Cả 2 máy chủ đang chạy ngầm ổn định (không cần giữ cửa sổ CMD đen). Tự làm mới mỗi 20 giây."
    elif online_cnt > 0:
        sub_txt = f"Đang chạy {online_cnt}/{len(insts)} máy chủ nội bộ. Tự làm mới mỗi 20 giây."
    else:
        sub_txt = "Chưa bật cổng 8998 / 8997 (bấm 'Bật Cổng 8997 & Đồng Bộ Lại Vercel' trong Cài Đặt POS hoặc chạy file khởi động). Tự làm mới mỗi 20 giây."
    commit_badge = f" (<code>{html.escape(sys_info['commit'])}</code>)" if sys_info.get("commit") else ""
    chips = "".join([
        _chip("[1] Máy chủ 8998", s1["local_ok"]),
        _chip("[2] Máy chủ 8997", s2["local_ok"]),
        _chip("[3] Tailscale Funnel", ts["funnel_configured"]),
        _chip("[4] Tự khởi động", auto["enabled"]),
    ])

    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="20">
<title>Trung Tâm Máy Chủ POS — {html.escape(sys_info['hostname'])}</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    background: #f1f5f9; color: #0f172a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "DejaVu Sans", Arial, sans-serif;
    font-size: 13px; line-height: 1.5; padding: 20px 14px;
  }}
  .container {{ max-width: 920px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }}
  .panel {{ background: #ffffff; border: 1px solid #cbd5e1; border-radius: 14px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(15,23,42,0.05); }}
  .top-head {{ display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }}
  .title {{ font-size: 17px; font-weight: 800; color: #0f172a; }}
  .subtitle {{ font-size: 12px; color: #64748b; }}
  .step-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }}
  .step-chip {{ padding: 7px 10px; border-radius: 8px; font-size: 12px; text-align: center; border: 1px solid; }}
  .chip-ok {{ background: #dcfce7; border-color: #86efac; color: #166534; }}
  .chip-warn {{ background: #fef3c7; border-color: #fcd34d; color: #92400e; }}
  .cards-grid {{ display: grid; grid-template-columns: 1fr; gap: 12px; }}
  .branch-card {{ background: #ffffff; border: 1px solid #cbd5e1; border-radius: 14px; padding: 15px 18px; display: flex; justify-content: space-between; align-items: center; gap: 14px; }}
  .branch-main {{ flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }}
  .branch-head {{ display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }}
  .branch-title {{ font-size: 15px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 7px; }}
  .dot {{ width: 9px; height: 9px; border-radius: 50%; display: inline-block; }}
  .dot-ok {{ background: #16a34a; box-shadow: 0 0 0 3px #dcfce7; }}
  .dot-off {{ background: #dc2626; box-shadow: 0 0 0 3px #fee2e2; }}
  .badge {{ font-size: 11.5px; font-weight: 700; padding: 2px 9px; border-radius: 99px; }}
  .badge-ok {{ background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }}
  .badge-off {{ background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }}
  .meta-line {{ font-size: 12px; color: #64748b; }}
  code {{ background: #f1f5f9; padding: 1px 6px; border-radius: 5px; font-family: Consolas, "Liberation Mono", monospace; font-size: 11.5px; color: #334155; }}
  .url-row {{ display: flex; align-items: center; flex-wrap: wrap; gap: 7px; font-size: 12.5px; }}
  .url-lbl {{ color: #64748b; min-width: 128px; font-weight: 600; }}
  .url-val {{ font-family: Consolas, "Liberation Mono", monospace; font-weight: 700; color: #0284c7; text-decoration: none; }}
  .url-val:hover {{ text-decoration: underline; }}
  .url-sub {{ font-family: Consolas, "Liberation Mono", monospace; font-size: 12px; color: #475569; text-decoration: none; }}
  .btn-copy {{ border: 1px solid #bae6fd; background: #f0f9ff; color: #0369a1; font-size: 11.5px; font-weight: 700; padding: 2px 9px; border-radius: 6px; cursor: pointer; }}
  .btn-copy:hover {{ background: #e0f2fe; }}
  .btn-row {{ padding-top: 4px; display: flex; gap: 8px; }}
  .btn-primary {{ display: inline-block; background: #0284c7; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 12px; padding: 6px 13px; border-radius: 8px; }}
  .btn-primary:hover {{ background: #0369a1; }}
  .btn-outline {{ display: inline-block; background: #f8fafc; color: #334155; border: 1px solid #cbd5e1; text-decoration: none; font-weight: 700; font-size: 12px; padding: 6px 12px; border-radius: 8px; }}
  .qr-box {{ width: 96px; height: 96px; border: 1px solid #e2e8f0; border-radius: 8px; flex-shrink: 0; image-rendering: pixelated; }}
  .sys-foot {{ display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #64748b; padding: 4px 2px; }}
  @media (max-width: 600px) {{ .branch-card {{ flex-direction: column; align-items: flex-start; }} }}
</style>
</head>
<body>
<div class="container">
  <div class="panel">
    <div class="top-head">
      <div>
        <div class="title">POS Mastercare &mdash; Trung Tâm Điều Khiển Máy Chủ</div>
        <div class="subtitle">{html.escape(sub_txt)}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <a href="/server-status" class="btn-outline">Làm mới ngay</a>
        <a href="/" class="btn-primary">Vào Phần Mềm POS &rarr;</a>
      </div>
    </div>
    <div class="step-grid">{chips}</div>
  </div>

  <div class="cards-grid">
    {''.join(cards_html)}
  </div>

  <div class="sys-foot">
    <span>Hệ điều hành: <b>{html.escape(sys_info['os'])}</b> &middot; Máy chủ: <b>{html.escape(sys_info['hostname'])}</b> &middot; IP LAN: <code>{html.escape(sys_info['lan_ip'])}</code></span>
    <span>Phiên bản: <b>v{html.escape(sys_info['version'])}</b>{commit_badge} &middot; Cập nhật lúc {html.escape(overview['timestamp'])}</span>
  </div>
</div>
<script>
function copyTxt(txt, btn) {{
  if (navigator.clipboard && navigator.clipboard.writeText) {{
    navigator.clipboard.writeText(txt);
  }} else {{
    var ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    try {{ document.execCommand('copy'); }} catch (e) {{}}
    document.body.removeChild(ta);
  }}
  var old = btn.textContent;
  btn.textContent = 'Đã chép!';
  setTimeout(function() {{ btn.textContent = old; }}, 1500);
}}
</script>
</body>
</html>"""

"""
Giao diện dòng lệnh đa nền tảng (Windows cũ conhost, Windows 11, Linux Desktop & SSH):
- Tự động ép mã UTF-8 trên Windows console kể cả khi nâng quyền Admin (RunAs).
- Tuyệt đối không dùng Emoji màu (nguyên nhân vỡ thành '?' trên font Raster/Consolas/TTY).
- Tự động hạ cấp sang bảng ASCII không dấu nếu terminal cổ không hỗ trợ UTF-8 (0 dấu '?').
"""
from __future__ import annotations

import ctypes
import os
import re
import shutil
import subprocess
import sys
import unicodedata
import webbrowser

_EMOJI_RE = re.compile(
    "["
    "\U0001F1E0-\U0001F1FF"
    "\U0001F300-\U0001FAFF"
    "\u2600-\u27BF"
    "\uFE0F"
    "\u200D"
    "\u2B05-\u2B07"
    "\u2934-\u2935"
    "]+",
    flags=re.UNICODE,
)

_ANSI_ENABLED: bool | None = None


def setup_console_utf8() -> bool:
    """Ép console hiện tại sang UTF-8 + bật mã màu VT100 nếu HĐH hỗ trợ."""
    global _ANSI_ENABLED
    os.environ.setdefault("PYTHONUTF8", "1")
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")

    ansi_ok = False
    if os.name == "nt":
        try:
            kernel32 = ctypes.windll.kernel32
            kernel32.SetConsoleOutputCP(65001)
            kernel32.SetConsoleCP(65001)
            handle = kernel32.GetStdHandle(-11)  # STD_OUTPUT_HANDLE
            mode = ctypes.c_uint32()
            if kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
                # ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004
                if kernel32.SetConsoleMode(handle, mode.value | 0x0004):
                    ansi_ok = True
        except Exception:
            ansi_ok = False
    else:
        term = (os.environ.get("TERM") or "").lower()
        ansi_ok = bool(sys.stdout.isatty() and term not in ("", "dumb"))

    if os.environ.get("NO_COLOR") or os.environ.get("POS_NO_COLOR") == "1":
        ansi_ok = False

    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        reconf = getattr(stream, "reconfigure", None)
        if callable(reconf):
            try:
                reconf(encoding="utf-8", errors="replace")
            except Exception:
                pass

    _ANSI_ENABLED = ansi_ok
    return ansi_ok


def supports_utf8() -> bool:
    """Kiểm tra stdout thực tế có ghi được tiếng Việt UTF-8 hay không."""
    if os.environ.get("POS_ASCII_ONLY") == "1":
        return False
    term = (os.environ.get("TERM") or "").lower()
    if term == "linux":  # Linux virtual console thuần (Ctrl+Alt+F1..F6) dễ lỗi dấu tổ hợp
        return False
    enc = (getattr(sys.stdout, "encoding", "") or "").lower().replace("-", "").replace("_", "")
    return enc == "utf8"


def supports_ansi() -> bool:
    if _ANSI_ENABLED is None:
        setup_console_utf8()
    return bool(_ANSI_ENABLED) and not os.environ.get("NO_COLOR")


def strip_emojis(text: str) -> str:
    cleaned = _EMOJI_RE.sub("", text or "")
    return re.sub(r" {3,}", "  ", cleaned)


def to_ascii_vi(text: str) -> str:
    """Chuyển tiếng Việt có dấu sang ASCII không dấu sạch sẽ, không bao giờ sinh dấu '?'."""
    s = strip_emojis(text or "")
    replacements = {
        "Đ": "D",
        "đ": "d",
        "—": "-",
        "–": "-",
        "→": "->",
        "←": "<-",
        "•": "*",
        "“": '"',
        "”": '"',
        "’": "'",
    }
    for src, dst in replacements.items():
        s = s.replace(src, dst)
    norm = unicodedata.normalize("NFKD", s)
    ascii_chars = [ch for ch in norm if not unicodedata.combining(ch) and ord(ch) < 128]
    return "".join(ascii_chars)


def safe_text(text: str, force_ascii: bool | None = None) -> str:
    """Đảm bảo chuỗi in ra sạch 100%: bỏ Emoji; tự chuyển ASCII nếu máy cổ không có UTF-8."""
    use_ascii = (not supports_utf8()) if force_ascii is None else bool(force_ascii)
    if use_ascii:
        return to_ascii_vi(text)
    return strip_emojis(text)


def colorize(text: str, color: str = "") -> str:
    if not color or not supports_ansi():
        return text
    codes = {
        "green": "\033[1;32m",
        "cyan": "\033[1;36m",
        "yellow": "\033[1;33m",
        "red": "\033[1;31m",
        "bold": "\033[1m",
        "muted": "\033[0;37m",
    }
    prefix = codes.get(color, "")
    return f"{prefix}{text}\033[0m" if prefix else text


def step_print(tag: str, message: str, color: str = "") -> None:
    """In 1 dòng trạng thái chuẩn hóa: [OK], [..], [!!], [ERR]."""
    clean_msg = safe_text(message)
    tag_txt = f"[{tag}]"
    if color:
        tag_txt = colorize(tag_txt, color)
    print(f"  {tag_txt:<6} {clean_msg}", flush=True)


def render_dual_status_box(
    rows: list[dict],
    title: str = "POS MASTERCARE — TRUNG TÂM ĐIỀU KHIỂN MÁY CHỦ",
    footer_lines: list[str] | None = None,
    force_ascii: bool | None = None,
) -> str:
    """Vẽ khung bảng trạng thái căn lề tuyệt đối bằng ký tự ASCII (+, -, |)."""
    c1, c2, c3, c4 = 20, 6, 8, 34
    total_inner = c1 + c2 + c3 + c4 + 9  # 3 vách ngăn ' | ' = 9 ký tự

    def _cell(val: str, width: int) -> str:
        txt = safe_text(str(val or ""), force_ascii=force_ascii)
        if len(txt) > width:
            txt = txt[: width - 2] + ".."
        return txt.ljust(width)

    top_border = "+" + "-" * (total_inner + 2) + "+"
    sep_border = f"+-{'-' * c1}-+-{'-' * c2}-+-{'-' * c3}-+-{'-' * c4}-+"

    clean_title = safe_text(title, force_ascii=force_ascii)
    if len(clean_title) > total_inner:
        clean_title = clean_title[:total_inner]
    title_line = f"| {clean_title.ljust(total_inner)} |"

    hdr = (
        f"| {_cell('Chi nhánh', c1)} | {_cell('Cổng', c2)} "
        f"| {_cell('Nội bộ', c3)} | {_cell('Đường truyền Online', c4)} |"
    )

    out = [top_border, title_line, sep_border, hdr, sep_border]
    for r in rows:
        tag = "[OK]" if r.get("ok") else "[--]"
        branch = f"{tag} {r.get('name', '')}"
        port = str(r.get("port", ""))
        local_st = "Online" if r.get("ok") else "Offline"
        pub_url = r.get("public_url") or f"http://127.0.0.1:{port}"
        out.append(
            f"| {_cell(branch, c1)} | {_cell(port, c2)} "
            f"| {_cell(local_st, c3)} | {_cell(pub_url, c4)} |"
        )
    out.append(sep_border)

    for fl in footer_lines or []:
        out.append("  " + safe_text(fl, force_ascii=force_ascii))

    return "\n".join(out)


def has_gui_display(argv: list[str] | None = None) -> bool:
    """Kiểm tra máy hiện tại có màn hình GUI để mở trình duyệt hay không (ẩn trên SSH Linux)."""
    args = argv if argv is not None else sys.argv
    if "--no-browser" in args or os.environ.get("POS_HEADLESS_CLI") == "1":
        return False
    if os.name == "nt":
        # Tránh mở trình duyệt nếu chạy trong non-interactive service session 0
        if os.environ.get("USERNAME", "").endswith("$"):
            return False
        return True
    if sys.platform == "darwin":
        return not bool(os.environ.get("SSH_CONNECTION"))
    # Linux / BSD: phải có DISPLAY hoặc WAYLAND_DISPLAY và không bị ép qua SSH thuần
    has_disp = bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
    if not has_disp:
        return False
    return shutil.which("xdg-open") is not None or shutil.which("sensible-browser") is not None


def open_browser_quiet(url: str) -> bool:
    """Mở URL trên trình duyệt mặc định mà không in rác ra terminal Linux/Windows."""
    if not has_gui_display():
        return False
    try:
        if os.name == "nt":
            os.startfile(url)  # type: ignore[attr-defined]
            return True
        opener = shutil.which("xdg-open") or shutil.which("sensible-browser")
        if opener:
            subprocess.Popen(
                [opener, url],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
            )
            return True
        return webbrowser.open(url)
    except Exception:
        return False

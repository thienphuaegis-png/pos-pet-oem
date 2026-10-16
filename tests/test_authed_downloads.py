import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = {"tailwind.js", "chart.umd.min.js"}
JS_FILES = [p for p in (ROOT / "static" / "js").rglob("*.js") if p.name not in VENDOR]
HTML = ROOT / "templates" / "index.html"
DIRECT_API_NAV = re.compile(r"""(window\.open\(|location\.href\s*=|href\s*=)\s*['"`]/api/""")
LOCATION_URL_VAR = re.compile(r"location\.href\s*=\s*url\b")


def test_auth_js_exposes_download_helpers():
    src = (ROOT / "static" / "js" / "auth.js").read_text(encoding="utf-8")
    assert "async function downloadWithAuth(" in src
    assert "async function openWithAuth(" in src
    assert "window.downloadWithAuth = downloadWithAuth" in src
    assert "window.openWithAuth = openWithAuth" in src


def test_no_direct_browser_navigation_to_api():
    offenders = []
    for p in JS_FILES + [HTML]:
        for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            if DIRECT_API_NAV.search(line) or LOCATION_URL_VAR.search(line):
                offenders.append(f"{p.relative_to(ROOT)}:{i}")
    assert not offenders, "Điều hướng thẳng tới /api không gửi được token: " + ", ".join(offenders)

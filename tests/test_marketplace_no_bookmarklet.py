from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_bookmarklet_removed():
    js = (ROOT / "static/js/modules/marketplace.js").read_text(encoding="utf-8")
    html = (ROOT / "templates/index.html").read_text(encoding="utf-8")
    assert "generateBookmarkletCode" not in js
    assert "copyBookmarkletCode" not in js
    assert "mkt-bookmarklet-link" not in html
    assert "copyBookmarkletCode" not in html

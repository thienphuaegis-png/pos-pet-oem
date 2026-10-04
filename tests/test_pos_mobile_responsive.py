import pytest
from pathlib import Path

def test_pos_html_has_mobile_responsive_layout():
    pos_path = Path("templates/pos.html")
    assert pos_path.exists(), "templates/pos.html must exist"
    content = pos_path.read_text(encoding="utf-8")

    # 1. Main layout container must be flex-col on mobile and md:flex-row on desktop
    assert 'flex-col md:flex-row' in content, "Main area must switch from column on mobile to row on desktop"

    # 2. Cart section must have mobile-bounded height (e.g. h-[38vh] or h-[40vh] md:h-full)
    assert 'h-[38vh]' in content or 'h-[40vh]' in content, "Cart section must have mobile-bounded height"

    # 3. Mobile quick catalog / product grid must exist for bottom 60%
    assert 'id="mobile-quick-catalog"' in content, "Mobile quick catalog must be present for bottom half"

    # 4. Sticky mobile bottom bar for checkout must exist
    assert 'id="mobile-pos-bottom-bar"' in content, "Mobile sticky bottom bar must exist"
    assert 'flex md:hidden' in content or 'md:hidden flex' in content, "Bottom bar must only be visible on mobile"

    # 5. Mobile payment drawer / sheet trigger
    assert 'toggleMobilePaymentSheet' in content or 'openMobilePaymentSheet' in content, "Must have payment drawer trigger for mobile"

def test_pos_js_cart_row_is_responsive():
    js_path = Path("static/js/pos.js")
    assert js_path.exists(), "static/js/pos.js must exist"
    content = js_path.read_text(encoding="utf-8")

    # Verify responsive cart row layout classes or mobile row adapter
    assert 'cart-row-responsive' in content or 'md:grid' in content or 'toggleMobilePaymentSheet' in content, "pos.js must support responsive cart row or mobile sheet"

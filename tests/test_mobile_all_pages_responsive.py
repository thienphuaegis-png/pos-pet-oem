import pytest
from pathlib import Path

def test_index_html_has_mobile_bottom_nav_and_drawer():
    index_path = Path("templates/index.html")
    assert index_path.exists(), "templates/index.html must exist"
    content = index_path.read_text(encoding="utf-8")

    # 1. Mobile Bottom Navigation Bar must exist and only show on mobile
    assert 'id="mobile-main-bottom-nav"' in content, "Must have #mobile-main-bottom-nav"
    assert 'flex md:hidden' in content or 'md:hidden flex' in content, "Bottom nav must be hidden on desktop"

    # 2. Backdrop for off-canvas drawer on mobile
    assert 'id="mobile-sidebar-backdrop"' in content, "Must have #mobile-sidebar-backdrop"

    # 3. Sidebar responsive wrapper
    assert 'id="main-sidebar"' in content, "Main sidebar must exist"

    # 4. Global mobile modal responsiveness
    assert 'calc(100vw' in content or 'max-w-[calc(100vw' in content or 'mobile-modal-responsive' in content, "Must have responsive modal rules"

def test_mobile_sidebar_toggle_logic():
    index_path = Path("templates/index.html")
    content = index_path.read_text(encoding="utf-8")
    assert 'toggleMobileSidebar' in content or 'openMobileSidebar' in content, "Must have toggleMobileSidebar helper"

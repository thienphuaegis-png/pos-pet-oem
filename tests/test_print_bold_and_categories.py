import os
import json
import sqlite3
import pytest

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "pos.db")

def test_print_presets_schema_has_category_and_bold():
    """Kiểm tra 12 preset mẫu in trong database có category và is_bold_all."""
    assert os.path.exists(DB_PATH), "Database file pos.db không tồn tại"
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT value FROM settings WHERE key = 'print_blocks_config'")
    row = c.fetchone()
    conn.close()

    assert row is not None, "Không tìm thấy setting print_blocks_config"
    config = json.loads(row[0])
    presets = config.get("presets", {})
    assert len(presets) >= 12, f"Cần ít nhất 12 preset, hiện có {len(presets)}"

    expected_categories = {
        "a4_b2b": "pos",
        "a4_standard": "pos",
        "a5_standard": "pos",
        "k80_standard": "pos",
        "k58_standard": "pos",
        "spa_intake_k80": "spa",
        "spa_invoice_k80": "spa",
        "cashbook_thu_k80": "cashbook",
        "cashbook_thu_a4": "cashbook",
        "cashbook_chi_k80": "cashbook",
        "cashbook_chi_a4": "cashbook",
        "stock_audit_a4": "inventory",
    }

    for key, expected_cat in expected_categories.items():
        assert key in presets, f"Thiếu preset {key}"
        preset = presets[key]
        assert "category" in preset, f"Preset {key} thiếu trường category"
        assert preset["category"] == expected_cat, f"Preset {key} sai category: {preset['category']} != {expected_cat}"
        assert "is_bold_all" in preset, f"Preset {key} thiếu trường is_bold_all"
        assert isinstance(preset["is_bold_all"], bool), f"Preset {key} is_bold_all phải là boolean"

def test_designer_ui_has_bold_checkbox():
    """Kiểm tra index.html có switch in đậm trên thanh công cụ/cột trái."""
    html_path = os.path.join(os.path.dirname(__file__), "..", "templates", "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    assert ('id="chk-split-bold-toggle"' in html or 'id="chk-preset-bold-all"' in html), "Thiếu switch/checkbox in đậm trong index.html"
    assert "In Đậm" in html or "In đậm" in html, "Thiếu nhãn in đậm trong index.html"

def test_productions_js_optgroup_and_bold_handling():
    """Kiểm tra productions.js có gom nhóm optgroup và toggle is_bold_all."""
    prod_path = os.path.join(os.path.dirname(__file__), "..", "static", "js", "modules", "productions.js")
    with open(prod_path, "r", encoding="utf-8") as f:
        js = f.read()

    assert "optgroup" in js, "productions.js phải sinh thẻ optgroup để phân loại mẫu in"
    assert "is_bold_all" in js, "productions.js phải xử lý thuộc tính is_bold_all"
    assert "toggleCurrentPresetBoldAll" in js or "chk-preset-bold-all" in js, "productions.js phải có hàm toggle in đậm"

def test_pos_js_filters_pos_category_and_injects_bold():
    """Kiểm tra pos.js chỉ nạp preset category pos và inject CSS text-stroke khi is_bold_all."""
    pos_path = os.path.join(os.path.dirname(__file__), "..", "static", "js", "pos.js")
    with open(pos_path, "r", encoding="utf-8") as f:
        js = f.read()

    assert "category" in js, "pos.js phải kiểm tra category để lọc mẫu in"
    assert "-webkit-text-stroke" in js or "font-weight: 900" in js, "pos.js phải inject CSS làm dày nét chữ in đậm"

def test_spa_and_cashbook_bold_support():
    """Kiểm tra spa.js và cashbook voucher có hỗ trợ in đậm chống mờ nhiệt."""
    spa_path = os.path.join(os.path.dirname(__file__), "..", "static", "js", "modules", "spa.js")
    with open(spa_path, "r", encoding="utf-8") as f:
        spa_js = f.read()

    prod_path = os.path.join(os.path.dirname(__file__), "..", "static", "js", "modules", "productions.js")
    with open(prod_path, "r", encoding="utf-8") as f:
        prod_js = f.read()

    assert "-webkit-text-stroke" in spa_js or "is_bold_all" in spa_js, "spa.js phải hỗ trợ CSS chống mờ nhiệt"
    assert "-webkit-text-stroke" in prod_js or "is_bold_all" in prod_js, "productions.js phiếu thu chi phải hỗ trợ CSS chống mờ"

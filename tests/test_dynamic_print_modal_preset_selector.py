import os
import pytest

def test_html_contains_modal_print_preset_selector():
    base_dir = os.path.dirname(os.path.dirname(__file__))
    index_html_path = os.path.join(base_dir, "templates", "index.html")
    pos_html_path = os.path.join(base_dir, "templates", "pos.html")

    with open(index_html_path, "r", encoding="utf-8") as f:
        index_content = f.read()
    with open(pos_html_path, "r", encoding="utf-8") as f:
        pos_content = f.read()

    assert 'id="modal-print-preset-select"' in index_content, "index.html thiếu dropdown modal-print-preset-select"
    assert 'id="modal-print-preset-select"' in pos_content, "pos.html thiếu dropdown modal-print-preset-select"

def test_pos_html_calls_print_invoice_directly():
    base_dir = os.path.dirname(os.path.dirname(__file__))
    pos_html_path = os.path.join(base_dir, "templates", "pos.html")
    with open(pos_html_path, "r", encoding="utf-8") as f:
        pos_content = f.read()
    assert 'onclick="printInvoiceDirectly()"' in pos_content, "pos.html phải dùng printInvoiceDirectly thay vì window.print"

def test_offline_tailwind_configured():
    base_dir = os.path.dirname(os.path.dirname(__file__))
    tailwind_js_path = os.path.join(base_dir, "static", "js", "tailwind.js")
    index_html_path = os.path.join(base_dir, "templates", "index.html")
    pos_html_path = os.path.join(base_dir, "templates", "pos.html")

    assert os.path.exists(tailwind_js_path), "File static/js/tailwind.js offline phải tồn tại"
    assert os.path.getsize(tailwind_js_path) > 100000, "File tailwind.js phải có nội dung đầy đủ"

    with open(index_html_path, "r", encoding="utf-8") as f:
        assert '/static/js/tailwind.js' in f.read(), "index.html phải nạp tailwind.js offline"
    with open(pos_html_path, "r", encoding="utf-8") as f:
        assert '/static/js/tailwind.js' in f.read(), "pos.html phải nạp tailwind.js offline"

def test_pos_js_contains_preset_sync_logic():
    base_dir = os.path.dirname(os.path.dirname(__file__))
    pos_js_path = os.path.join(base_dir, "static", "js", "pos.js")

    with open(pos_js_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "function populateModalPrintPresets" in content, "pos.js thiếu hàm populateModalPrintPresets"
    assert "function changeModalPrintPreset" in content, "pos.js thiếu hàm changeModalPrintPreset"
    assert "populateModalPrintPresets" in content, "pos.js thiếu lệnh gọi populateModalPrintPresets"
    assert "function findBestPresetForSize" in content, "pos.js thiếu hàm findBestPresetForSize"
    assert "isA5" in content, "pos.js phải có xử lý chiều cao riêng cho khổ A5"

def test_settings_merges_presets_concurrently():
    import json
    from routers.settings import update_template_settings
    from schemas import TemplateSettingsUpdate
    from database import get_db

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = 'print_blocks_config'")
    backup_row = cur.fetchone()
    backup_val = backup_row[0] if backup_row else None

    try:
        # Setup database with preset A
        initial_config = json.dumps({
            "active_preset": "preset_a",
            "presets": {
                "preset_a": {"name": "Preset A", "paper_size": "K80"}
            }
        })
        cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('print_blocks_config', ?)", (initial_config,))
        conn.commit()
        conn.close()

        # Client B saves preset B
        req = TemplateSettingsUpdate(print_blocks_config=json.dumps({
            "active_preset": "preset_b",
            "presets": {
                "preset_b": {"name": "Preset B", "paper_size": "A4-portrait"}
            }
        }))
        update_template_settings(req)

        # Check merged result in DB
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT value FROM settings WHERE key = 'print_blocks_config'")
        val = json.loads(cur.fetchone()[0])
        conn.close()

        assert "preset_a" in val["presets"], "Preset A của máy trước không được bị xóa mất"
        assert "preset_b" in val["presets"], "Preset B của máy sau phải được thêm vào"
        assert val["active_preset"] == "preset_b"
    finally:
        if backup_val is not None:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('print_blocks_config', ?)", (backup_val,))
            conn.commit()
            conn.close()

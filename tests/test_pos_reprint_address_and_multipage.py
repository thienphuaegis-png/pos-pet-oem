import json
import pytest
import sqlite3
from database import get_db, init_db

def test_database_preset_address_y_does_not_overlap_phone():
    """Kiểm tra các preset A4 không có phần tử customer_address đè lên customer_phone"""
    init_db()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = 'print_blocks_config'")
    row = cur.fetchone()
    assert row is not None
    cfg = json.loads(row[0] if isinstance(row, tuple) else row["value"])
    presets = cfg.get("presets", {})
    
    for pkey, pval in presets.items():
        paper = pval.get("paper_size", "")
        if not paper.startswith("A4"):
            continue
        elements = pval.get("elements", [])
        # Ưu tiên tìm element có catalog_key == 'customer_phone'
        phone_el = next((e for e in elements if e.get("catalog_key") == "customer_phone"), None)
        addr_el = next((e for e in elements if e.get("catalog_key") == "customer_address"), None)
        
        if phone_el and addr_el:
            phone_y = float(phone_el.get("y", 0))
            addr_y = float(addr_el.get("y", 0))
            # Nếu cùng cột x (chênh lệch x < 100), khoảng cách y phải >= 14px để không đè chữ
            if abs(float(phone_el.get("x", 0)) - float(addr_el.get("x", 0))) < 100:
                assert abs(phone_y - addr_y) >= 14, f"Preset {pkey}: phone_y ({phone_y}) và addr_y ({addr_y}) đè nhau (cách nhau < 14px)!"

def test_pos_js_multipage_iframe_css_and_flow():
    """Kiểm tra file static/js/pos.js không dùng display: flex trên body iframe in"""
    with open("static/js/pos.js", "r", encoding="utf-8") as f:
        pos_js = f.read()

    # Thẻ body trong printInvoiceDirectly không được mang inline style display: flex
    assert '<body style="display: flex;' not in pos_js, "body của iframe in không được dùng display: flex vì Blink chặn ngắt trang!"
    # productions.js printData phải có dia_chi_khach
    with open("static/js/modules/productions.js", "r", encoding="utf-8") as f:
        prod_js = f.read()
    assert "dia_chi_khach:" in prod_js, "printData trong productions.js thiếu trường dia_chi_khach!"

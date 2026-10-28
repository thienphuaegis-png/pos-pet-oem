import os
import re
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent


def test_elaya_7_ui_fixes():
    index_html = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")
    pos_html = (ROOT / "templates" / "pos.html").read_text(encoding="utf-8")
    pos_mob_html = (ROOT / "templates" / "pos_mobile.html").read_text(encoding="utf-8")
    ai_js = (ROOT / "static" / "js" / "modules" / "ai_agent.js").read_text(encoding="utf-8")

    # 1. Sidebar: 20 icons use uniform currentColor, no 14 rainbow bg/text classes
    soup = BeautifulSoup(index_html, "html.parser")
    sidebar_nav = soup.find(id="sidebar-nav")
    assert sidebar_nav is not None
    icon_spans = sidebar_nav.find_all("span", class_="sidebar-icon")
    assert len(icon_spans) == 20
    for sp in icon_spans:
        classes = sp.get("class", [])
        assert "text-current" in classes, f"Sidebar icon must use text-current: {classes}"
        assert not any(c.startswith("bg-") for c in classes), f"Rainbow bg class left on sidebar icon: {classes}"

    # 2. No border-left: 4px solid, no concave scoop ::before/::after, no border-l-4
    assert "border-left: 4px solid" not in index_html
    assert ".tab-btn.active-tab::before" not in index_html
    assert ".tab-btn.active-tab::after" not in index_html
    assert re.search(r"\bborder-l-4\b", index_html) is None
    assert re.search(r"\bborder-l-4\b", pos_html) is None

    # 3. No purple/indigo/pink/violet AI-slop palette or <em> / italic across all tabs in templates/index.html & pos.html
    assert "from-purple-50" not in index_html
    assert "to-indigo-50" not in index_html
    assert re.search(r"\b(?:purple|indigo|pink|violet)-\d+\b", index_html) is None
    assert "<em" not in index_html
    assert "<em" not in pos_html
    assert "<em>" not in ai_js
    assert re.search(r"\bitalic\b", index_html) is None
    assert re.search(r"\bitalic\b", pos_html) is None

    # 4. Root 16px, max weight 700 (no font-black / font-extrabold), no off-scale text-[9/10/11px]
    assert "font-size: 17px" not in index_html
    assert "font-size: 16px" in index_html
    assert "font-size: 16px" in pos_html
    assert "font-size: 16px" in pos_mob_html
    assert re.search(r"\bfont-black\b|\bfont-extrabold\b", index_html) is None
    assert re.search(r"\bfont-black\b|\bfont-extrabold\b", pos_html) is None
    assert re.search(r"\bfont-black\b|\bfont-extrabold\b", pos_mob_html) is None
    assert re.search(r"\btext-\[(?:8\.5|9|10|10\.5|11|13|15)px\]", index_html) is None
    assert re.search(r"\btext-\[(?:8\.5|9|10|10\.5|11|13|15)px\]", pos_html) is None

    # 5. Concentric Radius (Outer 16px + Gap 8px -> Inner 8px) across all major tabs (30+ trays)
    assert index_html.count("elaya-tray") >= 25
    assert ".elaya-tray" in pos_html and ".elaya-inner-card" in pos_html

    # 6. Phosphor Icons local offline bundle + 0 emojis (🔍, 📷, 🖨️, 🧾, 💰) in index.html, pos.html & pos_mobile.html
    assert (ROOT / "static" / "vendor" / "phosphor" / "style.css").exists()
    assert (ROOT / "static" / "vendor" / "phosphor" / "Phosphor.woff2").exists()
    assert "/static/vendor/phosphor/style.css" in index_html
    assert "/static/vendor/phosphor/style.css" in pos_html
    assert "/static/vendor/phosphor/style.css" in pos_mob_html
    for banned_emoji in ("🔍", "📷", "🖨️", "🧾", "💰", "🤖", "🛒", "🐾", "🏨"):
        assert banned_emoji not in index_html, f"Emoji {banned_emoji} still in index.html"
        assert banned_emoji not in pos_html, f"Emoji {banned_emoji} still in pos.html"
        assert banned_emoji not in pos_mob_html, f"Emoji {banned_emoji} still in pos_mobile.html"

    # 7. Asymmetric 2-Column Bento (1.35fr : 1fr) in Reports, Inventory, Contacts, Cashbook Requests, and Overview
    assert index_html.count("lg:grid-cols-[1.35fr_1fr]") >= 6
    required_dom_ids = [
        # Reports
        "rep-kpi-revenue", "rep-kv-net-avg", "rep-kv-net-growth",
        "rep-kv-gross", "rep-kv-gross-avg", "rep-kv-gross-growth",
        "rep-kv-return", "rep-kv-return-avg", "rep-kv-return-growth",
        "rep-kv-profit", "rep-kv-margin-badge", "rep-kv-profit-avg", "rep-kv-profit-growth",
        "rep-kv-cost", "rep-kv-cost-avg", "rep-kv-cost-growth",
        "rep-kv-orders", "rep-kpi-aov", "rep-kv-orders-avg", "rep-kv-orders-growth",
        "rep-kpi-paid", "rep-kpi-debt", "rep-strip-goods", "rep-strip-spa", "rep-strip-hotel",
        "rep-gvs-goods-rev", "rep-gvs-svc-rev", "rep-gvs-hotel-rev",
        # Inventory, Contacts, Cashbook
        "kpi-inv-count", "kpi-inv-qty", "kpi-inv-val", "kpi-card-inv-val",
        "kpi-contacts-customers", "kpi-contacts-cust-debt", "kpi-contacts-supp-debt",
        "stat-exp-reimbursement-pending", "stat-exp-planned-pending", "stat-exp-completed-sum",
    ]
    for rid in required_dom_ids:
        assert soup.find(id=rid) is not None, f"Missing DOM id: #{rid}"


def test_pos_dropdown_soft_tint_and_phosphor_icons():
    pos_js = (ROOT / "static" / "js" / "pos.js").read_text(encoding="utf-8")
    assert ".pos-customer-item.active *" not in pos_js, "Must not force white text on child badges inside active dropdown item"
    assert "background-color: #f0f9ff !important" in pos_js
    assert "box-shadow: inset 0 0 0 1px #0284c7 !important" in pos_js
    assert "pos-badge-seg" in pos_js and "pos-badge-pts" in pos_js
    assert "ph-tag" in pos_js and "ph-trophy" in pos_js and "ph-phone" in pos_js


def test_composite_indexes_and_query_plan_no_seq_scan():
    from database import get_db, init_db
    init_db()
    conn = get_db()
    cur = conn.cursor()

    # 1. Orders by customer_id + created_at DESC must use composite index without TEMP B-TREE
    cur.execute("EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = 1 ORDER BY created_at DESC LIMIT 20")
    plan_ord = " ".join(str(dict(r)) for r in cur.fetchall())
    assert "idx_orders_customer_created" in plan_ord
    assert "TEMP B-TREE" not in plan_ord

    # 2. Pet service history by pet_id + ticket_date DESC must use composite index without SCAN or TEMP B-TREE
    cur.execute("EXPLAIN QUERY PLAN SELECT id, code, ticket_date FROM pet_service_tickets WHERE pet_id = 1 ORDER BY ticket_date DESC, id DESC LIMIT 10")
    plan_pet = " ".join(str(dict(r)) for r in cur.fetchall())
    assert "idx_pet_tickets_pet_date" in plan_pet
    assert "TEMP B-TREE" not in plan_pet

    conn.close()


def test_pos_hd_short_name_and_spa_5_improvements():
    pos_js = Path("static/js/pos.js").read_text(encoding="utf-8")
    index_html = Path("templates/index.html").read_text(encoding="utf-8")
    spa_js = Path("static/js/modules/spa.js").read_text(encoding="utf-8")

    # 1. POS invoice tabs use compact 'HD 1', 'HD ${idx + 1}'
    assert 'name: "HD 1"' in pos_js
    assert "tab.name = `HD ${idx + 1}`" in pos_js

    # 2. Kanban view toggle and board removed from index.html
    assert 'id="btn-spa-view-kanban"' not in index_html
    assert 'id="spa-view-kanban"' not in index_html

    # 3. Paid row full-row highlight CSS on td cells
    assert "tr.card-row.spa-paid-row td" in index_html
    assert "background-color: #d1fae5 !important;" in index_html

    # 4. Removed '✏️ Sửa' button in table-pet-services row action cluster
    assert 'onclick="openServiceProgressModal(${t.id})"' not in spa_js

    # 5. Print 2 slips on intake: Phiếu tiếp nhận Spa + Phiếu số thứ tự dán chuồng
    assert "PHIẾU SỐ THỨ TỰ DÁN CHUỒNG" in spa_js
    assert "generateCageTagHtml" in spa_js


def test_spa_staff_hrm_sync_and_6_columns():
    from routers.partners import list_spa_staff

    rows = list_spa_staff("2026-10")
    assert len(rows) >= 10, "Phải trả về danh sách thợ Spa từ bảng staff (HRM)"
    sample = rows[0]
    for key in ("id", "staff_code", "name", "role", "count_receiver", "count_washer", "count_cutter", "count_dyer", "commission_amount", "tip_amount"):
        assert key in sample, f"Thiếu trường {key} trong dữ liệu thợ Spa"

    spa_js = Path("static/js/modules/spa.js").read_text(encoding="utf-8")
    assert 'colspan="6"' in spa_js
    assert "s.count_washer" in spa_js and "s.commission_amount" in spa_js


def test_ai_low_stock_modal_no_overlap():
    index_html = Path("templates/index.html").read_text(encoding="utf-8")
    ai_js = Path("static/js/modules/ai_agent.js").read_text(encoding="utf-8")
    soup = BeautifulSoup(index_html, "html.parser")
    modal = soup.find(id="modal-ai-low-stock")
    assert modal is not None
    inner = modal.find("div")
    assert "max-w-3xl" in inner.get("class", [])
    sel = modal.find(id="ai-low-stock-partner-filter")
    assert "min-w-0" in sel.get("class", []) and "truncate" in sel.get("class", [])
    assert "ph-lightning" in ai_js and "ph-buildings" in ai_js


def test_interactive_guide_10_sops_and_spotlight_tour():
    index_html = Path("templates/index.html").read_text(encoding="utf-8")
    guide_js = Path("static/js/modules/guide_tour.js").read_text(encoding="utf-8")
    soup = BeautifulSoup(index_html, "html.parser")
    tab_guide = soup.find(id="tab-guide")
    assert tab_guide is not None
    nav_btns = tab_guide.find_all("button", class_="guide-nav-btn")
    assert len(nav_btns) == 10, f"Expected 10 SOP nav buttons, got {len(nav_btns)}"
    for sop_key in ("pos", "spa", "hotel", "wallet", "cashbook", "inventory", "marketplace", "hrm", "ai_import", "setup"):
        assert f"'{sop_key}'" in guide_js or f"{sop_key}:" in guide_js
    assert "toggleGuideAutoPlay" in guide_js
    assert "startLiveSpotlightTour" in guide_js


def test_spa_commission_multi_branch_weight_matrix_and_probation():
    import sqlite3
    from services.commission import (
        DEFAULT_SPA_COMMISSION_CONFIG,
        load_spa_commission_config,
        spa_commission_by_name,
    )

    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)")
    cur.execute("CREATE TABLE spa_commission_rules (id INTEGER PRIMARY KEY, role_key TEXT, service_name TEXT, rate_type TEXT, value REAL, is_active INTEGER DEFAULT 1)")
    cur.execute("CREATE TABLE staff (id INTEGER PRIMARY KEY, name TEXT, spa_commission_tier TEXT DEFAULT 'official', spa_commission_profile_id TEXT DEFAULT '', official_date TEXT, probation_start TEXT)")
    cur.execute("CREATE TABLE pets (id INTEGER PRIMARY KEY, species TEXT, weight REAL)")
    cur.execute("""
        CREATE TABLE pet_service_tickets (
            id INTEGER PRIMARY KEY, code TEXT, pet_id INTEGER, service_type TEXT,
            weight_at_service REAL, price REAL, tip_amount REAL, status TEXT,
            ticket_date TEXT, created_at TEXT, services_json TEXT,
            staff_receiver TEXT, staff_worker_1 TEXT, staff_worker_2 TEXT,
            staff_cutter TEXT, staff_dyer TEXT, art_cutting_fee REAL, surcharge REAL,
            customer_request TEXT, note TEXT
        )
    """)
    cur.execute("INSERT INTO staff (name, spa_commission_tier) VALUES ('Thợ Chính Thức', 'official')")
    cur.execute("INSERT INTO staff (name, spa_commission_tier) VALUES ('Thợ Thử Việc', 'probation')")
    cur.execute("INSERT INTO pets (id, species, weight) VALUES (1, 'Chó', 15.0)")

    # Ca: Chó 15kg (Size Trung <=20kg: Chính thức tắm 60k, Thử việc tắm 50k; Cắt trung 10.1-30kg: Chính thức 100k, Thử việc 90k)
    # 2 thợ cùng tắm (1a: chia 50/50 -> Chính thức 30k, Thử việc 25k)
    # Thợ Chính Thức cắt tỉa (100k) + PT Cắt đầu (25k) + PT Gỡ rối 100k (50k chia 50/50 cho 2 thợ tắm -> mỗi người 25k)
    import json
    svcs = json.dumps([
        {"name": "CB Cắt Tỉa (1+2+3+5)", "price": 350000, "quantity": 1},
        {"name": "PT Cắt đầu", "price": 50000, "quantity": 1},
        {"name": "Phụ thu gỡ rối lông", "price": 100000, "quantity": 1},
    ])
    cur.execute("""
        INSERT INTO pet_service_tickets (
            id, code, pet_id, service_type, weight_at_service, price, tip_amount,
            status, ticket_date, services_json, staff_worker_1, staff_worker_2, staff_cutter, staff_dyer
        ) VALUES (1, 'SPA-901', 1, 'CB Cắt Tỉa', 15.0, 500000, 0, 'completed', '2026-10-27', ?, 'Thợ Chính Thức', 'Thợ Thử Việc', 'Thợ Chính Thức', 'Thợ Thử Việc')
    """, (svcs,))

    cfg = load_spa_commission_config(cur)
    assert len(cfg["profiles"][0]["bath_tiers"]) == 5
    assert len(cfg["profiles"][0]["cut_tiers"]) == 3
    assert len(cfg["profiles"][0]["surcharge_rules"]) == 7

    res = spa_commission_by_name(cur, "2026-10-01", "2026-10-31")
    # Thợ Chính Thức: Tắm (60k * 50% = 30k) + Cắt trung (100k) + PT Cắt đầu (25k) + PT Gỡ rối 100k (50k * 50% = 25k) = 180,000đ
    assert res["thợ chính thức"]["commission"] == 180000
    # Thợ Thử Việc: Tắm (50k * 50% = 25k) + Nhuộm thử việc (40k) + PT Gỡ rối 100k (50k * 50% = 25k) = 90,000đ
    assert res["thợ thử việc"]["commission"] == 90000
    conn.close()






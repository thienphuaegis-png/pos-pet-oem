"""KOC / KOL & Affiliate Video Management & Commission Engine.

Đọc dữ liệu từ bất kỳ link Google Sheet nào (qua /export?format=xlsx, không khóa cứng URL/tab),
bóc tách cả tab Danh sách KOC/Booking (nhiều link trong cột Link Air) lẫn tab Tổng hợp Link & View
(như tab '2', 'Tiktok', 'Tiktok_ChiTiet'), hỗ trợ quét view TikTok trực tiếp qua TikWM API,
và tính hoa hồng/thưởng KPI video cho nhân viên phụ trách (cộng vào Bảng Lương HRM).
"""
import asyncio
import datetime
import io
import json
import re
import time
import urllib.request
from typing import Dict, List, Optional, Tuple

import httpx
import openpyxl

DEFAULT_KOC_RULES = {
    "min_views": 200,
    "kpi_deduct_videos": 0,
    "rate_per_video": 10_000,
    "viral_min_views": 1_000,
    "viral_bonus": 0,
    "manual_adjust_videos": 0,
    "grace_days_prev_month": 5,
}

_VN_TZ = datetime.timezone(datetime.timedelta(hours=7))
TIKTOK_URL_RE = re.compile(r"https?://(?:www\.|vm\.|vt\.|m\.)?tiktok\.com/(?:(?!https?://)[^\s,;\'\"><\)])+", re.I)
VIDEO_ID_RE = re.compile(r"/(?:video|photo)/(\d+)")
USERNAME_RE = re.compile(r"/@([a-zA-Z0-9_.\-]+)")
_SHEET_BYTES_CACHE: Dict[str, Tuple[float, bytes]] = {}


def is_tiktok_video_url(url: str) -> bool:
    low = (url or "").strip().lower()
    if "/video/" in low or "/photo/" in low:
        return True
    if ("vt.tiktok.com/" in low or "vm.tiktok.com/" in low) and "/@" not in low:
        return True
    return False


def extract_cell_video_urls(cell) -> List[str]:
    if cell is None:
        return []
    val = cell.value
    found: List[str] = []
    if val and isinstance(val, str) and "tiktok.com" in val.lower():
        found = [u for u in TIKTOK_URL_RE.findall(val) if is_tiktok_video_url(u)]
    if not found and getattr(cell, "hyperlink", None) and getattr(cell.hyperlink, "target", None):
        hl = str(cell.hyperlink.target or "")
        if "tiktok.com" in hl.lower():
            found = [u for u in TIKTOK_URL_RE.findall(hl) if is_tiktok_video_url(u)]
    return found


def _col_spec_to_indices(spec: Optional[str], max_c: int = 50) -> List[int]:
    raw = str(spec or "").strip()
    if not raw:
        return []
    out: List[int] = []
    for tok in re.split(r"[,;\s+]+", raw):
        t = tok.strip().upper()
        if not t:
            continue
        idx = 0
        if t.isdigit():
            idx = int(t)
        elif re.match(r"^[A-Z]{1,3}$", t):
            try:
                idx = openpyxl.utils.column_index_from_string(t)
            except ValueError:
                idx = 0
        if 1 <= idx <= max_c and idx not in out:
            out.append(idx)
    return out


def extract_tiktok_publish_time(url_or_key: str) -> str:
    """Giải mã thời gian đăng gốc từ TikTok Snowflake ID (32 bit cao = Unix timestamp)."""
    s = str(url_or_key or "").strip()
    if not s:
        return ""
    m = VIDEO_ID_RE.search(s)
    vid_str = m.group(1) if m else (s if s.isdigit() else "")
    if not (vid_str and 18 <= len(vid_str) <= 20):
        return ""
    try:
        ts = int(vid_str) >> 32
        if 1451606400 <= ts <= 4102444800:
            return datetime.datetime.fromtimestamp(ts, tz=_VN_TZ).strftime("%Y-%m-%d %H:%M")
    except (ValueError, OverflowError, OSError):
        pass
    return ""


def ensure_koc_schema(cur) -> None:
    cur.execute("""
    CREATE TABLE IF NOT EXISTS koc_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sheet_url TEXT NOT NULL,
        sheet_id TEXT NOT NULL,
        month TEXT NOT NULL,
        staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
        koc_tab_name TEXT DEFAULT '',
        video_tab_name TEXT DEFAULT '',
        rules_json TEXT,
        last_sync_at DATETIME,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS koc_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL REFERENCES koc_sources(id) ON DELETE CASCADE,
        koc_username TEXT NOT NULL,
        channel_url TEXT DEFAULT '',
        followers TEXT DEFAULT '',
        gmv_text TEXT DEFAULT '',
        contact_info TEXT DEFAULT '',
        product_sample TEXT DEFAULT '',
        approval_status TEXT DEFAULT '',
        cast_fee REAL DEFAULT 0,
        is_freecast INTEGER DEFAULT 1,
        videos_Committed INTEGER DEFAULT 0,
        videos_returned INTEGER DEFAULT 0,
        air_links_raw TEXT DEFAULT '',
        note TEXT DEFAULT '',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_id, koc_username)
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS koc_videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL REFERENCES koc_sources(id) ON DELETE CASCADE,
        video_key TEXT NOT NULL,
        video_url TEXT NOT NULL,
        koc_username TEXT DEFAULT '',
        views INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        title TEXT DEFAULT '',
        product_note TEXT DEFAULT '',
        status TEXT DEFAULT 'OK',
        published_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT '',
        manual_kpi INTEGER DEFAULT 0,
        UNIQUE(source_id, video_key)
    )
    """)
    cur.execute("PRAGMA table_info(koc_sources)")
    ks_cols = {c[1] for c in cur.fetchall()}
    if "column_mapping_json" not in ks_cols:
        cur.execute("ALTER TABLE koc_sources ADD COLUMN column_mapping_json TEXT DEFAULT ''")
    if "sync_meta_json" not in ks_cols:
        cur.execute("ALTER TABLE koc_sources ADD COLUMN sync_meta_json TEXT DEFAULT ''")

    cur.execute("PRAGMA table_info(koc_videos)")
    kv_cols = {c[1] for c in cur.fetchall()}
    if "manual_kpi" not in kv_cols:
        cur.execute("ALTER TABLE koc_videos ADD COLUMN manual_kpi INTEGER DEFAULT 0")
    if "is_manual_added" not in kv_cols:
        cur.execute("ALTER TABLE koc_videos ADD COLUMN is_manual_added INTEGER DEFAULT 0")

    # Giải mã tức thì published_at từ Snowflake ID cho các video cũ chưa có giờ đăng chuẩn
    cur.execute(
        "SELECT id, video_key, video_url, published_at FROM koc_videos "
        "WHERE (COALESCE(published_at, '') = '' OR published_at LIKE '%00:00:00' OR LENGTH(published_at) = 10) "
        "AND LENGTH(video_key) BETWEEN 18 AND 20"
    )
    for r in cur.fetchall():
        sf = extract_tiktok_publish_time(r["video_key"] or r["video_url"])
        if sf and sf != (r["published_at"] or ""):
            cur.execute("UPDATE koc_videos SET published_at = ? WHERE id = ?", (sf, r["id"]))

    cur.execute("CREATE INDEX IF NOT EXISTS idx_koc_sources_month ON koc_sources(month, staff_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_koc_videos_source ON koc_videos(source_id, views)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_koc_videos_vkey ON koc_videos(video_key)")
    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('koc_commission_rules', ?)",
                (json.dumps(DEFAULT_KOC_RULES),))


def load_default_rules(cur) -> dict:
    cur.execute("SELECT value FROM settings WHERE key = 'koc_commission_rules'")
    row = cur.fetchone()
    out = dict(DEFAULT_KOC_RULES)
    if row and row[0]:
        try:
            out.update(json.loads(row[0]))
        except ValueError:
            pass
    return out


def extract_sheet_id(url_or_id: str) -> str:
    raw = (url_or_id or "").strip()
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9_\-]+)", raw)
    if m:
        return m.group(1)
    if re.match(r"^[a-zA-Z0-9_\-]{20,}$", raw):
        return raw
    raise ValueError("Link Google Sheet không hợp lệ (cần có /spreadsheets/d/<ID>)")


def extract_video_key(url: str) -> str:
    u = (url or "").strip()
    m = VIDEO_ID_RE.search(u)
    if m:
        return m.group(1)
    return u.split("?")[0].rstrip("/")


def extract_username(url_or_text: str) -> str:
    s = (url_or_text or "").strip()
    m = USERNAME_RE.search(s)
    if m:
        return m.group(1).strip()
    return s.lstrip("@/").strip()


def clean_tiktok_url(url: str) -> str:
    u = (url or "").strip()
    m = TIKTOK_URL_RE.search(u)
    return m.group(0) if m else u


def _parse_ymd_prefix(s: str) -> Optional[datetime.date]:
    txt = str(s or "").strip()
    if len(txt) < 10:
        return None
    try:
        return datetime.date.fromisoformat(txt[:10])
    except ValueError:
        return None


def _parse_month_first(month_str: str) -> Optional[datetime.date]:
    txt = str(month_str or "").strip()
    if not re.match(r"^\d{4}-(0[1-9]|1[0-2])$", txt):
        return None
    y, m = txt.split("-")
    return datetime.date(int(y), int(m), 1)


def build_prev_dup_lookup(cur) -> Dict[Tuple[int, str], dict]:
    """Xác định các video bị nộp trùng giữa nhiều chiến dịch / nhiều tháng.
    Chiến dịch có (month ASC, id ASC) nhỏ hơn giữ quyền tính đầu tiên (trừ khi dòng đó bị loại tay manual_kpi = -1).
    """
    cur.execute("""
        SELECT ks.id AS source_id, ks.month, ks.name, kv.video_key, COALESCE(kv.manual_kpi, 0) AS manual_kpi
        FROM koc_videos kv
        JOIN koc_sources ks ON ks.id = kv.source_id
        WHERE ks.is_active = 1
        ORDER BY ks.month ASC, ks.id ASC, kv.id ASC
    """)
    first_owner: Dict[str, dict] = {}
    dup_lookup: Dict[Tuple[int, str], dict] = {}
    for r in cur.fetchall():
        sid = int(r["source_id"])
        vk = str(r["video_key"] or "").strip()
        if not vk:
            continue
        mk = int(r["manual_kpi"] or 0)
        owner = first_owner.get(vk)
        if owner is None:
            if mk != -1:
                first_owner[vk] = {"source_id": sid, "month": r["month"], "name": r["name"]}
        elif owner["source_id"] != sid:
            dup_lookup[(sid, vk)] = owner
    return dup_lookup


def evaluate_koc_video(
    v: dict,
    campaign_month: str = "",
    min_views: int = 200,
    grace_days: int = 5,
    dup_info: Optional[dict] = None,
) -> dict:
    views = int(v.get("views") or 0)
    manual_kpi = int(v.get("manual_kpi") or 0)
    status_str = str(v.get("status") or "OK").strip()
    status_low = status_str.lower()

    is_err = any(x in status_low for x in ("lỗi", "error", "riêng tư", "private", "xóa", "dead", "không tồn tại"))
    is_pending = (views <= 0 and status_low != "thành công") or any(
        k in status_low for k in ("chưa quét", "lỗi", "không lấy", "free api limit")
    )

    sf_pub = extract_tiktok_publish_time(v.get("video_key") or v.get("video_url") or "")
    eff_pub = sf_pub or str(v.get("published_at") or "").strip()
    pub_date = _parse_ymd_prefix(eff_pub)
    pub_month = pub_date.strftime("%Y-%m") if pub_date else ""

    camp_first = _parse_month_first(campaign_month)
    is_old_month = False
    is_grace_prev = False
    if pub_date and camp_first:
        earliest_allowed = camp_first - datetime.timedelta(days=max(0, int(grace_days or 0)))
        if pub_date < earliest_allowed:
            is_old_month = True
        elif pub_date < camp_first:
            is_grace_prev = True

    is_dup_prev = bool(dup_info)
    dup_source_name = dup_info["name"] if dup_info else ""
    dup_month = dup_info["month"] if dup_info else ""

    if manual_kpi == 1:
        kpi_state = "manual_approved"
    elif manual_kpi == -1:
        kpi_state = "manual_excluded"
    elif is_dup_prev:
        kpi_state = "excluded_dup"
    elif is_old_month:
        kpi_state = "excluded_old"
    elif views >= min_views:
        kpi_state = "auto_qualified"
    elif is_err:
        kpi_state = "error"
    else:
        kpi_state = "under_kpi"

    return {
        "published_at": eff_pub,
        "pub_month": pub_month,
        "manual_kpi": manual_kpi,
        "min_views": min_views,
        "is_err": is_err,
        "is_pending": is_pending,
        "is_dup_prev": is_dup_prev,
        "dup_source_name": dup_source_name,
        "dup_month": dup_month,
        "is_old_month": is_old_month,
        "is_grace_prev": is_grace_prev,
        "kpi_state": kpi_state,
        "is_kpi_counted": kpi_state in ("auto_qualified", "manual_approved"),
    }


def calc_koc_commission(
    videos: List[dict],
    rules: dict,
    campaign_month: str = "",
    prev_dup_for_source: Optional[Dict[str, dict]] = None,
) -> dict:
    min_views = int(rules.get("min_views") if rules.get("min_views") is not None else 200)
    kpi_deduct = int(rules.get("kpi_deduct_videos") or 0)
    rate = float(rules.get("rate_per_video") if rules.get("rate_per_video") is not None else 10_000)
    viral_min = int(rules.get("viral_min_views") if rules.get("viral_min_views") is not None else 1_000)
    viral_bonus = float(rules.get("viral_bonus") or 0)
    manual_adjust = int(rules.get("manual_adjust_videos") or 0)
    grace_days = int(rules.get("grace_days_prev_month") if rules.get("grace_days_prev_month") is not None else 5)

    total_videos = len(videos)
    active_videos = 0
    error_videos = 0
    pending_videos = 0
    auto_qualified_videos = 0
    manual_approved_videos = 0
    under_kpi_videos = 0
    dup_excluded_videos = 0
    old_excluded_videos = 0
    manual_excluded_videos = 0
    viral_videos = 0
    total_views = 0
    koc_set = set()

    for v in videos:
        views = int(v.get("views") or 0)
        vk = str(v.get("video_key") or "")
        dup_info = prev_dup_for_source.get(vk) if prev_dup_for_source else None
        ev = evaluate_koc_video(v, campaign_month=campaign_month, min_views=min_views, grace_days=grace_days, dup_info=dup_info)

        if ev["is_pending"]:
            pending_videos += 1
        total_views += max(0, views)
        uname = (v.get("koc_username") or "").strip().lstrip("@/").lower()
        if uname:
            koc_set.add(uname)

        st_code = ev["kpi_state"]
        if st_code == "error":
            error_videos += 1
        else:
            active_videos += 1

        if st_code == "auto_qualified":
            auto_qualified_videos += 1
            if viral_min > 0 and views >= viral_min:
                viral_videos += 1
        elif st_code == "manual_approved":
            manual_approved_videos += 1
            if viral_min > 0 and views >= viral_min:
                viral_videos += 1
        elif st_code == "under_kpi":
            under_kpi_videos += 1
        elif st_code == "excluded_dup":
            dup_excluded_videos += 1
        elif st_code == "excluded_old":
            old_excluded_videos += 1
        elif st_code == "manual_excluded":
            manual_excluded_videos += 1

    qualified_videos = auto_qualified_videos + manual_approved_videos
    excluded_videos = dup_excluded_videos + old_excluded_videos + manual_excluded_videos
    payable_videos = max(0, qualified_videos + manual_adjust - max(0, kpi_deduct))
    base_commission = round(payable_videos * rate)
    viral_commission = round(viral_videos * viral_bonus) if viral_bonus > 0 else 0
    total_commission = base_commission + viral_commission

    return {
        "total_videos": total_videos,
        "active_videos": active_videos,
        "error_videos": error_videos,
        "pending_videos": pending_videos,
        "auto_qualified_videos": auto_qualified_videos,
        "manual_approved_videos": manual_approved_videos,
        "qualified_videos": qualified_videos,
        "under_kpi_videos": under_kpi_videos,
        "dup_excluded_videos": dup_excluded_videos,
        "old_excluded_videos": old_excluded_videos,
        "manual_excluded_videos": manual_excluded_videos,
        "excluded_videos": excluded_videos,
        "manual_adjust_videos": manual_adjust,
        "viral_videos": viral_videos,
        "payable_videos": payable_videos,
        "total_views": total_views,
        "unique_kocs": len(koc_set),
        "base_commission": base_commission,
        "viral_commission": viral_commission,
        "commission": total_commission,
        "rules": {
            "min_views": min_views,
            "kpi_deduct_videos": kpi_deduct,
            "rate_per_video": rate,
            "viral_min_views": viral_min,
            "viral_bonus": viral_bonus,
            "manual_adjust_videos": manual_adjust,
            "grace_days_prev_month": grace_days,
        },
    }


def download_sheet_xlsx_bytes(sheet_url_or_id: str, use_cache: bool = False) -> Tuple[str, bytes]:
    sheet_id = extract_sheet_id(sheet_url_or_id)
    now = time.monotonic()
    if use_cache and sheet_id in _SHEET_BYTES_CACHE:
        ts, cached_bytes = _SHEET_BYTES_CACHE[sheet_id]
        if now - ts <= 90.0:
            return sheet_id, cached_bytes
    export_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=xlsx"
    req = urllib.request.Request(export_url, headers={"User-Agent": "Mozilla/5.0"})
    data = urllib.request.urlopen(req, timeout=45).read()
    _SHEET_BYTES_CACHE[sheet_id] = (now, data)
    return sheet_id, data


def inspect_sheet_tab_columns(xlsx_bytes: bytes, tab_name: str) -> dict:
    """Đọc cấu trúc các cột A..AZ của 1 tab trong Google Sheet, đếm số link video từng cột & gợi ý cột chuẩn."""
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), data_only=True)
    ws = _find_sheet_by_name(wb, tab_name)
    if ws is None:
        raise ValueError(f"Không tìm thấy tab '{tab_name}' trong Google Sheet")

    max_r = ws.max_row or 0
    max_c = min(ws.max_column or 0, 40)
    header_row = None
    sub_header_row = None

    for r in range(1, min(25, max_r + 1)):
        vals = [str(ws.cell(r, c).value or "").strip().lower() for c in range(1, max_c + 1)]
        is_booking_hdr = any(x in ("koc", "id koc") for x in vals) and any("link" in x for x in vals)
        is_views_hdr = any("link tiktok" in x for x in vals) and any("lượt xem" in x for x in vals)
        if is_booking_hdr or is_views_hdr:
            header_row = r
            if is_booking_hdr and r + 1 <= max_r:
                vals2 = [str(ws.cell(r + 1, c).value or "").strip().lower() for c in range(1, max_c + 1)]
                if any(x in ("koc", "id koc", "link air") for x in vals2):
                    sub_header_row = r + 1
            break

    eff_hdr_row = sub_header_row or header_row
    data_start = (eff_hdr_row + 1) if eff_hdr_row else 2

    columns = []
    for c in range(1, max_c + 1):
        col_letter = openpyxl.utils.get_column_letter(c)
        h_parts = []
        if header_row:
            v1 = " ".join(str(ws.cell(header_row, c).value or "").split()).strip()
            if v1:
                h_parts.append(v1)
        if sub_header_row:
            v2 = " ".join(str(ws.cell(sub_header_row, c).value or "").split()).strip()
            if v2 and v2.lower() not in {p.lower() for p in h_parts}:
                h_parts.append(v2)
        if not h_parts:
            v_top = " ".join(str(ws.cell(1, c).value or "").split()).strip()
            if v_top and not v_top.startswith("http"):
                h_parts.append(v_top[:40])
        header_label = " / ".join(h_parts)[:55] if h_parts else f"Cột {col_letter}"

        vid_links = 0
        uniq_vkeys = set()
        chan_links = 0
        non_empty = 0
        sample_val = ""
        for r in range(data_start, max_r + 1):
            cell = ws.cell(r, c)
            raw_v = cell.value
            if raw_v is not None and str(raw_v).strip() != "":
                non_empty += 1
                if not sample_val:
                    sample_val = " ".join(str(raw_v).split())[:45]
            v_urls = extract_cell_video_urls(cell)
            if v_urls:
                vid_links += len(v_urls)
                for u in v_urls:
                    uniq_vkeys.add(extract_video_key(u))
            elif raw_v and isinstance(raw_v, str) and "tiktok.com/@" in raw_v.lower():
                chan_links += 1

        if h_parts or non_empty > 0 or vid_links > 0:
            columns.append({
                "col": col_letter,
                "index": c,
                "header": header_label,
                "video_links": vid_links,
                "unique_videos": len(uniq_vkeys),
                "channel_links": chan_links,
                "non_empty": non_empty,
                "sample": sample_val,
            })

    # Tự động gợi ý cột chuẩn nhất
    sug_video = ""
    sug_koc = ""
    sug_prod = ""
    sug_views = ""

    # 1. Cột Link Video: ưu tiên cột có chữ "link air" / "link tiktok" / "link video", sau đó tới cột nhiều video_links nhất (tránh cột LINK KOC / Link nguồn)
    preferred_vid = [
        col for col in columns
        if any(k in col["header"].lower() for k in ("link air", "link tiktok", "link video"))
        and "link nguồn" not in col["header"].lower()
    ]
    if preferred_vid:
        preferred_vid.sort(key=lambda x: (x["video_links"], -x["index"]), reverse=True)
        sug_video = preferred_vid[0]["col"]
    else:
        with_vids = [
            col for col in columns
            if col["video_links"] > 0
            and not any(k in col["header"].lower() for k in ("link koc", "link id", "link kênh", "link nguồn"))
        ]
        if with_vids:
            with_vids.sort(key=lambda x: (x["video_links"], -x["index"]), reverse=True)
            sug_video = with_vids[0]["col"]

    for col in columns:
        hl = col["header"].lower()
        if not sug_koc and (hl in ("koc", "id koc", "tác giả", "tác giả (koc)") or hl.startswith("koc ") or "tác giả" in hl):
            sug_koc = col["col"]
        if not sug_prod and ("mẫu đề xuất" in hl or "sản phẩm" in hl):
            sug_prod = col["col"]
        if not sug_views and ("lượt xem" in hl or hl == "views" or hl == "view"):
            sug_views = col["col"]

    return {
        "tab_name": ws.title,
        "header_row": eff_hdr_row or 1,
        "total_rows": max_r,
        "columns": columns,
        "suggested": {
            "video_col": sug_video,
            "koc_col": sug_koc,
            "product_col": sug_prod,
            "views_col": sug_views,
        },
    }


def inspect_workbook_tabs(xlsx_bytes: bytes) -> List[dict]:
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), data_only=True, read_only=True)
    tabs = []
    for name in wb.sheetnames:
        ws = wb[name]
        sample_text = ""
        row_count = ws.max_row or 0
        sampled_rows = 0
        for row in ws.iter_rows(min_row=1, max_row=16, max_col=25, values_only=True):
            sampled_rows += 1
            non_empty = [str(c).strip() for c in row if c is not None and str(c).strip()]
            if non_empty:
                sample_text += " | ".join(non_empty[:8]) + "\n"
        if not row_count:
            row_count = sampled_rows
        low = sample_text.lower()
        tab_kind = "other"
        if "link tiktok" in low or "lượt xem" in low or "video trên 200" in low:
            tab_kind = "video_views"
        elif "link koc" in low or "mẫu đề xuất" in low or "link air" in low:
            tab_kind = "koc_booking"
        tabs.append({
            "name": name,
            "kind": tab_kind,
            "rows": row_count,
        })
    wb.close()
    return tabs


def _parse_koc_cell(raw_koc: str, raw_link: str) -> Tuple[str, str, str]:
    """Tách chuỗi kiểu 'ID: bupetshop123\\nFollow: 817\\nDoanh thu: 1M₫+' hoặc username thuần."""
    text = str(raw_koc or "").strip()
    username = ""
    followers = ""
    gmv = ""
    if "\n" in text or ":" in text:
        for line in text.splitlines():
            l = line.strip().strip('"')
            low = l.lower()
            if low.startswith("id:"):
                username = l.split(":", 1)[1].strip()
            elif low.startswith("fl:") or low.startswith("follow:"):
                followers = l.split(":", 1)[1].strip()
            elif low.startswith("dt:") or low.startswith("doanh thu:"):
                gmv = l.split(":", 1)[1].strip()
    if not username:
        if raw_link and "tiktok.com/@" in str(raw_link):
            username = extract_username(str(raw_link))
        elif text and not text.lower().startswith("tổng"):
            username = text.splitlines()[0].strip().strip('"')
    username = username.lstrip("@/").strip()
    return username, followers, gmv


def _safe_float(v) -> float:
    if v is None or isinstance(v, bool):
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().lower().replace(",", ".")
    m = re.search(r"(\d+(?:\.\d+)?)\s*(tr|m|k)?", s)
    if not m:
        return 0.0
    num = float(m.group(1))
    unit = m.group(2) or ""
    if unit in ("tr", "m"):
        return num * 1_000_000
    if unit == "k":
        return num * 1_000
    return num


def _fmt_cell_dt(v) -> str:
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(v, datetime.date):
        return v.strftime("%Y-%m-%d")
    return str(v or "").strip()


def parse_koc_booking_sheet(
    ws,
    column_mapping: Optional[dict] = None,
    out_meta: Optional[dict] = None,
) -> Tuple[List[dict], List[dict]]:
    """Đọc tab quản lý KOC của nhân sự (vd THANH 102026, Đôn 62026, Kho KOCKOL...).
    Hỗ trợ chỉ định chính xác cột lấy Link Video / KOC / Sản phẩm / Lượt xem qua column_mapping.
    Trả về (danh_sách_koc_profiles, danh_sách_videos_tách_từ_link_air).
    """
    header_row = None
    col_map: Dict[str, int] = {}
    max_r = ws.max_row or 0
    max_c = min(ws.max_column or 0, 45)
    cmap_in = column_mapping or {}

    for r in range(1, min(25, max_r + 1)):
        vals = [str(ws.cell(r, c).value or "").strip().lower() for c in range(1, max_c + 1)]
        if any(x in ("koc", "id koc") for x in vals) and any("link" in x for x in vals):
            header_row = r
            for c_idx, h in enumerate(vals, start=1):
                if h in ("koc", "id koc") and "koc" not in col_map:
                    col_map["koc"] = c_idx
                elif ("link koc" in h or "link id" in h) and "link" not in col_map:
                    col_map["link"] = c_idx
                elif h == "follow" and "follow" not in col_map:
                    col_map["follow"] = c_idx
                elif h == "gmv" and "gmv" not in col_map:
                    col_map["gmv"] = c_idx
                elif "mẫu đề xuất" in h:
                    col_map["sample"] = c_idx
                elif "duyệt koc" in h or h == "duyệt":
                    col_map["approval"] = c_idx
                elif "có cast" in h:
                    col_map["cast_fee"] = c_idx
                elif "sđt" in h or "zalo" in h:
                    col_map["contact"] = c_idx
                elif "số video đã trả" in h:
                    col_map["videos_returned"] = c_idx
                elif "số video" in h and "videos_committed" not in col_map:
                    col_map["videos_committed"] = c_idx
                elif "link air" in h or h == "trả video":
                    if "link air" in h:
                        col_map["link_air"] = c_idx
                    elif "link_air" not in col_map:
                        col_map["link_air"] = c_idx
                elif "lượt xem" in h and "views" not in col_map:
                    col_map["views"] = c_idx
                elif "ngày air" in h:
                    col_map["air_date"] = c_idx
                elif h == "note" and "note" not in col_map:
                    col_map["note"] = c_idx
            if r + 1 <= max_r:
                vals2 = [str(ws.cell(r + 1, c).value or "").strip().lower() for c in range(1, max_c + 1)]
                if any(x in ("koc", "id koc", "link air") for x in vals2):
                    header_row = r + 1
                    for c_idx, h in enumerate(vals2, start=1):
                        if "link air" in h:
                            col_map["link_air"] = c_idx
                        elif "số video đã trả" in h:
                            col_map["videos_returned"] = c_idx
                        elif h == "note" and "note" not in col_map:
                            col_map["note"] = c_idx
            break

    custom_vid_cols = _col_spec_to_indices(cmap_in.get("video_col"), max_c)
    custom_koc_cols = _col_spec_to_indices(cmap_in.get("koc_col"), max_c)
    custom_prod_cols = _col_spec_to_indices(cmap_in.get("product_col"), max_c)
    custom_view_cols = _col_spec_to_indices(cmap_in.get("views_col"), max_c)

    if not header_row:
        if not custom_vid_cols:
            return [], []
        # Nếu người dùng đã chỉ định cột lấy link trên một tab tùy ý -> tìm dòng bắt đầu có link TikTok
        header_row = 1
        for r in range(1, min(20, max_r + 1)):
            if any(extract_cell_video_urls(ws.cell(r, vc)) for vc in custom_vid_cols):
                header_row = max(0, r - 1)
                break

    if custom_koc_cols:
        col_map["koc"] = custom_koc_cols[0]
    if custom_prod_cols:
        col_map["sample"] = custom_prod_cols[0]
    if custom_view_cols:
        col_map["views"] = custom_view_cols[0]

    # Xác định chính xác cột lấy Link Video (KHÔNG quét nhầm cột D 'LINK KOC' giới thiệu kênh!)
    if custom_vid_cols:
        video_col_indices = custom_vid_cols
    elif col_map.get("link_air"):
        video_col_indices = [col_map["link_air"]]
    else:
        skip_koc_link_col = col_map.get("link")
        video_col_indices = [c for c in range(1, max_c + 1) if c != skip_koc_link_col]

    profiles: Dict[str, dict] = {}
    videos: Dict[str, dict] = {}
    raw_links_count = 0

    for r in range(header_row + 1, max_r + 1):
        raw_koc = ws.cell(r, col_map["koc"]).value if col_map.get("koc") else None
        raw_link = ws.cell(r, col_map["link"]).value if col_map.get("link") else None

        row_video_urls: List[str] = []
        for c in video_col_indices:
            row_video_urls.extend(extract_cell_video_urls(ws.cell(r, c)))
        raw_links_count += len(row_video_urls)

        username, fl, gmv = _parse_koc_cell(raw_koc, raw_link)
        if not username and row_video_urls:
            username = extract_username(row_video_urls[0])
        if not username or username.lower() in ("koc", "id koc", "stt", "tổng kết chiến dịch", "tác giả", "tác giả (koc)"):
            continue

        ch_url = str(raw_link or "").strip()
        if not ch_url or not ch_url.startswith("http") or is_tiktok_video_url(ch_url):
            ch_url = f"https://www.tiktok.com/@{username}"

        if not fl and col_map.get("follow"):
            fl = str(ws.cell(r, col_map["follow"]).value or "").strip()
        if not gmv and col_map.get("gmv"):
            gmv = str(ws.cell(r, col_map["gmv"]).value or "").strip()

        sample = str(ws.cell(r, col_map["sample"]).value or "").strip() if col_map.get("sample") else ""
        approval = str(ws.cell(r, col_map["approval"]).value or "").strip() if col_map.get("approval") else ""
        contact = str(ws.cell(r, col_map["contact"]).value or "").strip() if col_map.get("contact") else ""
        note = str(ws.cell(r, col_map["note"]).value or "").strip() if col_map.get("note") else ""
        cast_fee = _safe_float(ws.cell(r, col_map["cast_fee"]).value) if col_map.get("cast_fee") else 0.0
        v_ret = int(_safe_float(ws.cell(r, col_map["videos_returned"]).value)) if col_map.get("videos_returned") else len(row_video_urls)
        v_com = int(_safe_float(ws.cell(r, col_map["videos_committed"]).value)) if col_map.get("videos_committed") else 0
        row_views = int(_safe_float(ws.cell(r, col_map["views"]).value)) if col_map.get("views") else 0

        key_u = username.lower()
        if key_u in profiles:
            existing = profiles[key_u]
            if not existing["product_sample"] and sample:
                existing["product_sample"] = sample
            existing["videos_returned"] = max(existing["videos_returned"], len(row_video_urls), v_ret)
            if row_video_urls:
                existing["air_links_raw"] = (existing["air_links_raw"] + "\n" + "\n".join(row_video_urls)).strip()
        else:
            profiles[key_u] = {
                "koc_username": username,
                "channel_url": ch_url,
                "followers": fl,
                "gmv_text": gmv,
                "contact_info": contact,
                "product_sample": sample,
                "approval_status": approval or ("DUYỆT" if row_video_urls else ""),
                "cast_fee": cast_fee,
                "is_freecast": 0 if cast_fee > 0 else 1,
                "videos_committed": v_com,
                "videos_returned": max(v_ret, len(row_video_urls)),
                "air_links_raw": "\n".join(row_video_urls),
                "note": note,
            }

        for vu in row_video_urls:
            vkey = extract_video_key(vu)
            v_author = extract_username(vu) or username
            init_views = row_views if len(row_video_urls) == 1 else 0
            videos[vkey] = {
                "video_key": vkey,
                "video_url": vu,
                "koc_username": v_author,
                "views": init_views,
                "likes": 0,
                "comments": 0,
                "shares": 0,
                "title": "",
                "product_note": sample,
                "status": "OK" if init_views > 0 else "Chưa quét view",
                "published_at": extract_tiktok_publish_time(vu),
                "updated_at": "",
            }

    if isinstance(out_meta, dict):
        used_cols_str = ",".join(openpyxl.utils.get_column_letter(i) for i in video_col_indices[:4])
        out_meta.update({
            "raw_links": raw_links_count,
            "unique_videos": len(videos),
            "dup_in_sheet": max(0, raw_links_count - len(videos)),
            "video_col": used_cols_str,
        })
    return list(profiles.values()), list(videos.values())


def parse_video_views_sheet(
    ws,
    column_mapping: Optional[dict] = None,
    out_meta: Optional[dict] = None,
) -> Tuple[List[dict], Optional[dict]]:
    """Đọc tab tổng hợp Link TikTok & Lượt xem (vd tab '2', 'Tiktok', 'Bản sao của Tiktok', 'Tiktok_ChiTiet').
    Trả về (danh_sách_videos, rules_nếu_có_trong_sheet).
    """
    max_r = ws.max_row or 0
    max_c = min(ws.max_column or 0, 40)
    detected_rules = {}
    cmap_in = column_mapping or {}

    header_row = None
    col_url = 1
    col_views = 2
    col_updated = 3
    col_status = 4
    col_author = None
    col_title = None
    col_likes = None
    col_comments = None
    col_shares = None
    col_pub = None
    col_prod_note = None

    for r in range(1, min(18, max_r + 1)):
        for c in range(1, min(10, max_c + 1)):
            v_str = str(ws.cell(r, c).value or "").strip().lower()
            if "mức view sàn" in v_str:
                nv = ws.cell(r, c + 1).value
                if isinstance(nv, (int, float)):
                    detected_rules["min_views"] = int(nv)
            elif "đơn giá hoa hồng" in v_str:
                nv = ws.cell(r, c + 1).value
                if isinstance(nv, (int, float)):
                    detected_rules["rate_per_video"] = float(nv)
            elif "thưởng thêm video viral" in v_str:
                nv = ws.cell(r, c + 1).value
                if isinstance(nv, (int, float)):
                    detected_rules["viral_bonus"] = float(nv)

        row_vals = [str(ws.cell(r, c).value or "").strip().lower() for c in range(1, max_c + 1)]
        if any(("link tiktok" in x or "link air" in x) for x in row_vals) and any(("lượt xem" in x or "koc" in x) for x in row_vals):
            header_row = r
            for c_idx, h in enumerate(row_vals, start=1):
                if "link tiktok" in h or "link air" in h:
                    col_url = c_idx
                elif "lượt xem" in h:
                    col_views = c_idx
                elif "cập nhật" in h:
                    col_updated = c_idx
                elif "trạng thái" in h:
                    col_status = c_idx
                elif "tác giả" in h or h in ("koc", "id koc"):
                    col_author = c_idx
                elif "tiêu đề" in h:
                    col_title = c_idx
                elif "mẫu đề xuất" in h or "sản phẩm" in h:
                    col_prod_note = c_idx
                elif "lượt thích" in h:
                    col_likes = c_idx
                elif "bình luận" in h:
                    col_comments = c_idx
                elif "chia sẻ" in h:
                    col_shares = c_idx
                elif "ngày đăng" in h:
                    col_pub = c_idx
            break

    url_cols = _col_spec_to_indices(cmap_in.get("video_col"), max_c) or [col_url]
    custom_view_cols = _col_spec_to_indices(cmap_in.get("views_col"), max_c)
    custom_koc_cols = _col_spec_to_indices(cmap_in.get("koc_col"), max_c)
    custom_prod_cols = _col_spec_to_indices(cmap_in.get("product_col"), max_c)
    if custom_view_cols:
        col_views = custom_view_cols[0]
    elif not header_row and cmap_in.get("video_col"):
        col_views = None
    if custom_koc_cols:
        col_author = custom_koc_cols[0]
    if custom_prod_cols:
        col_prod_note = custom_prod_cols[0]

    start_r = (header_row + 1) if header_row else 2
    videos: Dict[str, dict] = {}
    raw_links_count = 0

    for r in range(start_r, max_r + 1):
        row_urls: List[str] = []
        for uc in url_cols:
            row_urls.extend(extract_cell_video_urls(ws.cell(r, uc)))
        if not row_urls:
            continue
        raw_links_count += len(row_urls)

        raw_views = ws.cell(r, col_views).value if col_views else 0
        views = int(_safe_float(raw_views)) if isinstance(raw_views, (int, float)) else 0
        updated = _fmt_cell_dt(ws.cell(r, col_updated).value) if (col_updated and header_row) else ""
        status = str(ws.cell(r, col_status).value or ("OK" if views > 0 else "Chưa quét view")).strip() if (col_status and header_row) else ("OK" if views > 0 else "Chưa quét view")
        raw_author_val = ws.cell(r, col_author).value if col_author else ""
        author_parsed, _, _ = _parse_koc_cell(raw_author_val, "")
        author = author_parsed or str(raw_author_val or "").strip().lstrip("@/")
        title = str(ws.cell(r, col_title).value or "").strip() if col_title else ""
        likes = int(_safe_float(ws.cell(r, col_likes).value)) if col_likes else 0
        comments = int(_safe_float(ws.cell(r, col_comments).value)) if col_comments else 0
        shares = int(_safe_float(ws.cell(r, col_shares).value)) if col_shares else 0
        pub = _fmt_cell_dt(ws.cell(r, col_pub).value) if col_pub else ""

        prod_note = str(ws.cell(r, col_prod_note).value or "").strip() if col_prod_note else ""
        if not prod_note and not col_likes and max_c >= 7 and 7 not in url_cols:
            g_val = ws.cell(r, 7).value
            if isinstance(g_val, str) and not g_val.startswith("http") and "video" not in g_val.lower():
                prod_note = g_val.strip()

        for u in row_urls:
            url = clean_tiktok_url(u)
            vkey = extract_video_key(url)
            u_author = extract_username(url) or author
            videos[vkey] = {
                "video_key": vkey,
                "video_url": url,
                "koc_username": u_author,
                "views": views if len(row_urls) == 1 else 0,
                "likes": likes if len(row_urls) == 1 else 0,
                "comments": comments if len(row_urls) == 1 else 0,
                "shares": shares if len(row_urls) == 1 else 0,
                "title": title,
                "product_note": prod_note,
                "status": status if len(row_urls) == 1 else "Chưa quét view",
                "published_at": extract_tiktok_publish_time(url) or pub,
                "updated_at": updated,
            }

    if isinstance(out_meta, dict):
        used_cols_str = ",".join(openpyxl.utils.get_column_letter(i) for i in url_cols[:4])
        out_meta.update({
            "raw_links": raw_links_count,
            "unique_videos": len(videos),
            "dup_in_sheet": max(0, raw_links_count - len(videos)),
            "video_col": used_cols_str,
        })
    return list(videos.values()), (detected_rules or None)


def _find_sheet_by_name(wb, target_name: str):
    if not target_name:
        return None
    if target_name in wb.sheetnames:
        return wb[target_name]
    t_strip = target_name.strip().lower()
    for n in wb.sheetnames:
        if n.strip().lower() == t_strip:
            return wb[n]
    return None


def sync_source_from_xlsx_bytes(cur, source_id: int, xlsx_bytes: bytes) -> dict:
    cur.execute("SELECT * FROM koc_sources WHERE id = ?", (source_id,))
    src = cur.fetchone()
    if not src:
        raise ValueError("Không tìm thấy nguồn KOC")
    src_dict = dict(src)

    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), data_only=True)

    koc_tab = (src_dict.get("koc_tab_name") or "").strip()
    video_tab = (src_dict.get("video_tab_name") or "").strip()
    col_mapping: dict = {}
    if src_dict.get("column_mapping_json"):
        try:
            col_mapping = json.loads(src_dict["column_mapping_json"]) or {}
        except ValueError:
            col_mapping = {}

    profiles_list: List[dict] = []
    booking_videos: List[dict] = []
    view_videos: List[dict] = []
    meta_koc: dict = {}
    meta_vid: dict = {}

    ws_koc = _find_sheet_by_name(wb, koc_tab)
    if ws_koc is not None:
        profiles_list, booking_videos = parse_koc_booking_sheet(ws_koc, column_mapping=col_mapping, out_meta=meta_koc)
        # Nếu người dùng chọn 1 tab danh sách Video thuần (vd 'Tiktok', 'Tiktok_ChiTiet', '2') vào ô Tab chính
        if not profiles_list and not booking_videos:
            booking_videos, _ = parse_video_views_sheet(ws_koc, column_mapping=col_mapping, out_meta=meta_koc)

    ws_vid = _find_sheet_by_name(wb, video_tab)
    if ws_vid is not None and (ws_koc is None or ws_vid.title != ws_koc.title):
        # Chỉ áp column_mapping cho ws_vid nếu không có koc_tab riêng
        vid_cmap = col_mapping if ws_koc is None else None
        view_videos, _ = parse_video_views_sheet(ws_vid, column_mapping=vid_cmap, out_meta=meta_vid)
        if not view_videos:
            extra_prof, view_videos = parse_koc_booking_sheet(ws_vid, column_mapping=vid_cmap, out_meta=meta_vid)
            if not profiles_list and extra_prof:
                profiles_list = extra_prof

    # Merge videos: ưu tiên số view từ tab video_tab, giữ thêm thông tin mẫu SP từ tab booking
    merged_videos: Dict[str, dict] = {}
    for v in booking_videos:
        merged_videos[v["video_key"]] = v
    for v in view_videos:
        vk = v["video_key"]
        if vk in merged_videos:
            if not v.get("product_note") and merged_videos[vk].get("product_note"):
                v["product_note"] = merged_videos[vk]["product_note"]
            if not v.get("published_at") and merged_videos[vk].get("published_at"):
                v["published_at"] = merged_videos[vk]["published_at"]
        merged_videos[vk] = v

    # Nếu chỉ chọn tab video hoặc tab không có cột KOC riêng -> tự gom danh sách KOC từ danh sách video
    existing_profile_keys = {p["koc_username"].lower() for p in profiles_list}
    by_author_count: Dict[str, int] = {}
    for v in merged_videos.values():
        au = (v.get("koc_username") or "").strip().lstrip("@/")
        if au:
            by_author_count[au] = by_author_count.get(au, 0) + 1
    for au, cnt in by_author_count.items():
        if au.lower() not in existing_profile_keys:
            profiles_list.append({
                "koc_username": au,
                "channel_url": f"https://www.tiktok.com/@{au}",
                "followers": "",
                "gmv_text": "",
                "contact_info": "",
                "product_sample": "",
                "approval_status": "DUYỆT",
                "cast_fee": 0.0,
                "is_freecast": 1,
                "videos_committed": cnt,
                "videos_returned": cnt,
                "air_links_raw": "",
                "note": "Tự động trích xuất từ danh sách video",
            })

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for p in profiles_list:
        cur.execute("""
            INSERT INTO koc_profiles (
                source_id, koc_username, channel_url, followers, gmv_text, contact_info,
                product_sample, approval_status, cast_fee, is_freecast,
                videos_Committed, videos_returned, air_links_raw, note, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_id, koc_username) DO UPDATE SET
                channel_url = excluded.channel_url,
                followers = CASE WHEN excluded.followers != '' THEN excluded.followers ELSE koc_profiles.followers END,
                gmv_text = CASE WHEN excluded.gmv_text != '' THEN excluded.gmv_text ELSE koc_profiles.gmv_text END,
                contact_info = CASE WHEN excluded.contact_info != '' THEN excluded.contact_info ELSE koc_profiles.contact_info END,
                product_sample = CASE WHEN excluded.product_sample != '' THEN excluded.product_sample ELSE koc_profiles.product_sample END,
                approval_status = CASE WHEN excluded.approval_status != '' THEN excluded.approval_status ELSE koc_profiles.approval_status END,
                cast_fee = excluded.cast_fee,
                is_freecast = excluded.is_freecast,
                videos_Committed = excluded.videos_Committed,
                videos_returned = excluded.videos_returned,
                air_links_raw = CASE WHEN excluded.air_links_raw != '' THEN excluded.air_links_raw ELSE koc_profiles.air_links_raw END,
                note = CASE WHEN excluded.note != '' THEN excluded.note ELSE koc_profiles.note END,
                updated_at = excluded.updated_at
        """, (
            source_id, p["koc_username"], p["channel_url"], p["followers"], p["gmv_text"],
            p["contact_info"], p["product_sample"], p["approval_status"], p["cast_fee"],
            p["is_freecast"], p["videos_committed"], p["videos_returned"], p["air_links_raw"],
            p["note"], now_str
        ))

    # Dọn các link cũ từng hút nhầm cột (vd cột D LINK KOC) khi Sheet trả về danh sách hợp lệ:
    # BẢO TOÀN 100% mọi video đã duyệt tay (manual_kpi != 0) và mọi video dán lẻ thủ công (is_manual_added = 1)
    if merged_videos:
        cur.execute(
            "SELECT id, video_key FROM koc_videos "
            "WHERE source_id = ? AND COALESCE(manual_kpi, 0) = 0 AND COALESCE(is_manual_added, 0) = 0",
            (source_id,),
        )
        stale_ids = [r["id"] for r in cur.fetchall() if r["video_key"] not in merged_videos]
        if stale_ids:
            ph = ",".join("?" for _ in stale_ids)
            cur.execute(f"DELETE FROM koc_videos WHERE id IN ({ph})", tuple(stale_ids))

    for v in merged_videos.values():
        cur.execute("""
            INSERT INTO koc_videos (
                source_id, video_key, video_url, koc_username, views, likes, comments, shares,
                title, product_note, status, published_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_id, video_key) DO UPDATE SET
                video_url = excluded.video_url,
                koc_username = CASE WHEN excluded.koc_username != '' THEN excluded.koc_username ELSE koc_videos.koc_username END,
                views = CASE WHEN excluded.views > 0 OR koc_videos.views = 0 THEN excluded.views ELSE koc_videos.views END,
                likes = CASE WHEN excluded.likes > 0 THEN excluded.likes ELSE koc_videos.likes END,
                comments = CASE WHEN excluded.comments > 0 THEN excluded.comments ELSE koc_videos.comments END,
                shares = CASE WHEN excluded.shares > 0 THEN excluded.shares ELSE koc_videos.shares END,
                title = CASE WHEN excluded.title != '' THEN excluded.title ELSE koc_videos.title END,
                product_note = CASE WHEN excluded.product_note != '' THEN excluded.product_note ELSE koc_videos.product_note END,
                status = CASE WHEN excluded.views > 0 OR koc_videos.views = 0 THEN excluded.status ELSE koc_videos.status END,
                published_at = CASE WHEN excluded.published_at != '' THEN excluded.published_at ELSE koc_videos.published_at END,
                updated_at = CASE WHEN excluded.updated_at != '' THEN excluded.updated_at ELSE koc_videos.updated_at END
        """, (
            source_id, v["video_key"], v["video_url"], v["koc_username"], int(v["views"] or 0),
            int(v["likes"] or 0), int(v["comments"] or 0), int(v["shares"] or 0),
            v["title"], v["product_note"], v["status"], v["published_at"], v["updated_at"] or now_str
        ))

    primary_meta = meta_koc if meta_koc.get("raw_links") else (meta_vid if meta_vid.get("raw_links") else meta_koc)
    raw_links_total = int(primary_meta.get("raw_links") or len(merged_videos))
    dup_in_sheet = max(0, raw_links_total - len(merged_videos))
    video_col_used = primary_meta.get("video_col") or (col_mapping.get("video_col") or "")
    sync_meta = {
        "raw_links": raw_links_total,
        "dup_in_sheet": dup_in_sheet,
        "unique_videos": len(merged_videos),
        "video_col": video_col_used,
    }
    cur.execute(
        "UPDATE koc_sources SET last_sync_at = ?, sync_meta_json = ? WHERE id = ?",
        (now_str, json.dumps(sync_meta), source_id),
    )
    return {
        "profiles_synced": len(profiles_list),
        "videos_synced": len(merged_videos),
        "raw_links_found": raw_links_total,
        "dup_links_in_sheet": dup_in_sheet,
        "video_col": video_col_used,
    }


_TIKWM_LOCKS: Dict[int, asyncio.Lock] = {}
_LAST_TIKWM_TS: float = 0.0
_TIKTOK_WEB_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
}


async def _wait_tikwm_rate_slot(min_interval: float = 1.08) -> None:
    global _LAST_TIKWM_TS
    loop_id = id(asyncio.get_running_loop())
    lock = _TIKWM_LOCKS.get(loop_id)
    if lock is None:
        lock = asyncio.Lock()
        _TIKWM_LOCKS[loop_id] = lock
    async with lock:
        gap = min_interval - (time.monotonic() - _LAST_TIKWM_TS)
        if gap > 0:
            await asyncio.sleep(gap)
        _LAST_TIKWM_TS = time.monotonic()


async def _fetch_tiktok_html_fallback(clean_u: str, orig_url: str, now_str: str, client: httpx.AsyncClient) -> Optional[dict]:
    try:
        r = await client.get(clean_u, headers=_TIKTOK_WEB_HEADERS, follow_redirects=True, timeout=10.0)
        if r.status_code != 200:
            return None
        m = re.search(r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', r.text)
        if not m:
            return None
        data = json.loads(m.group(1))
        detail = (data.get("__DEFAULT_SCOPE__") or {}).get("webapp.video-detail") or {}
        item = (detail.get("itemInfo") or {}).get("itemStruct")
        if not item:
            return None
        st = item.get("stats") or {}
        author = ((item.get("author") or {}).get("uniqueId")) or extract_username(orig_url)
        pub_ts = item.get("createTime")
        pub_str = (
            datetime.datetime.fromtimestamp(int(pub_ts), tz=_VN_TZ).strftime("%Y-%m-%d %H:%M")
            if pub_ts else extract_tiktok_publish_time(orig_url)
        )
        return {
            "ok": True,
            "views": int(st.get("playCount") or 0),
            "likes": int(st.get("diggCount") or 0),
            "comments": int(st.get("commentCount") or 0),
            "shares": int(st.get("shareCount") or 0),
            "title": str(item.get("desc") or "").strip(),
            "koc_username": author,
            "published_at": pub_str,
            "status": "Thành công",
            "updated_at": now_str,
        }
    except Exception:
        return None


async def fetch_tiktok_video_metrics(video_url: str, client: httpx.AsyncClient) -> dict:
    clean_u = video_url.split("?")[0].strip()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    last_err = "Không lấy được view"
    for attempt in range(2):
        try:
            await _wait_tikwm_rate_slot(1.08 if attempt == 0 else 1.25)
            res = await client.post("https://www.tikwm.com/api/", data={"url": clean_u}, timeout=12.0)
            if res.status_code == 200:
                payload = res.json()
                if payload.get("code") == 0 and payload.get("data"):
                    d = payload["data"]
                    author = (d.get("author") or {}).get("unique_id") or extract_username(video_url)
                    pub_ts = d.get("create_time")
                    pub_str = (
                        datetime.datetime.fromtimestamp(int(pub_ts), tz=_VN_TZ).strftime("%Y-%m-%d %H:%M")
                        if pub_ts else extract_tiktok_publish_time(video_url)
                    )
                    return {
                        "ok": True,
                        "views": int(d.get("play_count") or 0),
                        "likes": int(d.get("digg_count") or 0),
                        "comments": int(d.get("comment_count") or 0),
                        "shares": int(d.get("share_count") or 0),
                        "title": str(d.get("title") or "").strip(),
                        "koc_username": author,
                        "published_at": pub_str,
                        "status": "Thành công",
                        "updated_at": now_str,
                    }
                msg = str(payload.get("msg") or "Lỗi hoặc riêng tư")
                last_err = f"Lỗi: {msg[:40]}"
                if "limit" in msg.lower() and attempt == 0:
                    continue
                break
        except Exception as e:
            last_err = f"Lỗi mạng: {str(e)[:30]}"
            break

    fb = await _fetch_tiktok_html_fallback(clean_u, video_url, now_str, client)
    if fb:
        return fb
    return {"ok": False, "status": last_err, "updated_at": now_str}


def source_rules(cur, src_row, default_rules: dict = None) -> dict:
    base = dict(default_rules or load_default_rules(cur))
    if src_row and src_row["rules_json"]:
        try:
            base.update(json.loads(src_row["rules_json"]))
        except ValueError:
            pass
    return base


def list_sources_summary(cur, month: Optional[str] = None) -> dict:
    default_rules = load_default_rules(cur)
    dup_lookup = build_prev_dup_lookup(cur)
    sql = """
        SELECT ks.*, s.name AS staff_name, s.employee_code AS staff_code
        FROM koc_sources ks
        LEFT JOIN staff s ON s.id = ks.staff_id
        WHERE ks.is_active = 1
    """
    params = []
    if month:
        sql += " AND ks.month = ?"
        params.append(month)
    sql += " ORDER BY ks.month DESC, ks.id DESC"
    cur.execute(sql, tuple(params))
    sources = [dict(r) for r in cur.fetchall()]

    out_sources = []
    for src in sources:
        sid = int(src["id"])
        cur.execute("SELECT COUNT(*) FROM koc_profiles WHERE source_id = ?", (sid,))
        koc_count = cur.fetchone()[0]
        cur.execute("SELECT * FROM koc_videos WHERE source_id = ?", (sid,))
        vids = [dict(r) for r in cur.fetchall()]
        rules = source_rules(cur, src, default_rules)
        prev_for_src = {vk: info for (s_id, vk), info in dup_lookup.items() if s_id == sid}
        calc = calc_koc_commission(vids, rules, campaign_month=src.get("month") or "", prev_dup_for_source=prev_for_src)
        src["koc_count"] = koc_count
        src["custom_rules"] = bool(src.get("rules_json"))
        src["rules"] = rules
        src["stats"] = calc
        col_map_parsed = {}
        if src.get("column_mapping_json"):
            try:
                col_map_parsed = json.loads(src["column_mapping_json"]) or {}
            except ValueError:
                col_map_parsed = {}
        sync_meta_parsed = {}
        if src.get("sync_meta_json"):
            try:
                sync_meta_parsed = json.loads(src["sync_meta_json"]) or {}
            except ValueError:
                sync_meta_parsed = {}
        src["column_mapping"] = col_map_parsed
        src["sync_meta"] = sync_meta_parsed
        out_sources.append(src)

    return {"sources": out_sources, "default_rules": default_rules}


def list_enriched_videos(
    cur,
    source_id: Optional[int] = None,
    month: Optional[str] = None,
    kpi_filter: str = "all",
    q: Optional[str] = None,
) -> dict:
    default_rules = load_default_rules(cur)
    dup_lookup = build_prev_dup_lookup(cur)

    src_sql = """
        SELECT ks.*, s.name AS staff_name
        FROM koc_sources ks
        LEFT JOIN staff s ON s.id = ks.staff_id
        WHERE ks.is_active = 1
    """
    src_params = []
    if source_id:
        src_sql += " AND ks.id = ?"
        src_params.append(source_id)
    if month:
        src_sql += " AND ks.month = ?"
        src_params.append(month)
    cur.execute(src_sql, tuple(src_params))
    src_rows = [dict(r) for r in cur.fetchall()]
    if not src_rows:
        return {
            "videos": [],
            "min_views": int(default_rules.get("min_views") if default_rules.get("min_views") is not None else 200),
            "filter_counts": {"all": 0, "qualified": 0, "under": 0, "under_zero_koc": 0, "manual": 0, "excluded": 0},
        }

    src_meta: Dict[int, Tuple[dict, dict]] = {}
    for sr in src_rows:
        src_meta[int(sr["id"])] = (sr, source_rules(cur, sr, default_rules))

    placeholders = ",".join("?" for _ in src_meta)
    cur.execute(
        f"SELECT * FROM koc_videos WHERE source_id IN ({placeholders}) ORDER BY views DESC, id ASC",
        tuple(src_meta.keys()),
    )
    raw_videos = [dict(r) for r in cur.fetchall()]

    # Bước 1: Đánh giá toàn bộ video & tính tiến độ từng kênh KOC trên toàn chiến dịch (trước khi lọc)
    koc_progress: Dict[Tuple[int, str], dict] = {}
    evaluated_all: List[dict] = []
    for rv in raw_videos:
        sid = int(rv["source_id"])
        sr, rls = src_meta[sid]
        min_v = int(rls.get("min_views") if rls.get("min_views") is not None else 200)
        grace_d = int(rls.get("grace_days_prev_month") if rls.get("grace_days_prev_month") is not None else 5)
        dup_info = dup_lookup.get((sid, str(rv.get("video_key") or "")))
        ev = evaluate_koc_video(rv, campaign_month=sr.get("month") or "", min_views=min_v, grace_days=grace_d, dup_info=dup_info)

        item = {
            **rv,
            **ev,
            "source_name": sr.get("name") or "",
            "month": sr.get("month") or "",
            "staff_name": sr.get("staff_name") or "",
        }
        evaluated_all.append(item)

        uname_key = (rv.get("koc_username") or "").strip().lstrip("@/").lower()
        if uname_key:
            kp = koc_progress.setdefault((sid, uname_key), {"total": 0, "auto": 0, "manual": 0})
            kp["total"] += 1
            if ev["kpi_state"] == "auto_qualified":
                kp["auto"] += 1
            elif ev["kpi_state"] == "manual_approved":
                kp["manual"] += 1

    counts = {"all": 0, "qualified": 0, "under": 0, "under_zero_koc": 0, "manual": 0, "excluded": 0}
    for it in evaluated_all:
        sid = int(it["source_id"])
        uname_key = (it.get("koc_username") or "").strip().lstrip("@/").lower()
        kp = koc_progress.get((sid, uname_key), {"total": 1, "auto": 0, "manual": 0})
        it["koc_total_videos"] = kp["total"]
        it["koc_auto_qual"] = kp["auto"]
        it["koc_manual_qual"] = kp["manual"]

        st = it["kpi_state"]
        views_num = int(it.get("views") or 0)
        is_under_bucket = st in ("under_kpi", "error") or (
            st == "manual_approved" and views_num < it["min_views"] and not it["is_dup_prev"] and not it["is_old_month"]
        )
        counts["all"] += 1
        if it["is_kpi_counted"]:
            counts["qualified"] += 1
        if is_under_bucket:
            counts["under"] += 1
        if st == "under_kpi" and (kp["auto"] + kp["manual"]) == 0:
            counts["under_zero_koc"] += 1
        if st == "manual_approved":
            counts["manual"] += 1
        if st in ("excluded_dup", "excluded_old", "manual_excluded"):
            counts["excluded"] += 1
        it["_under_bucket"] = is_under_bucket

    # Bước 2: Lọc theo kpi_filter & từ khóa tìm kiếm q
    flt = (kpi_filter or "all").strip().lower()
    kw = (q or "").strip().lower()
    out_videos = []
    for it in evaluated_all:
        st = it["kpi_state"]
        under_b = it.pop("_under_bucket", False)
        if flt == "qualified" and not it["is_kpi_counted"]:
            continue
        elif flt == "under" and not under_b:
            continue
        elif flt == "under_zero_koc" and not (st == "under_kpi" and (it["koc_auto_qual"] + it["koc_manual_qual"]) == 0):
            continue
        elif flt == "manual" and st != "manual_approved":
            continue
        elif flt == "excluded" and st not in ("excluded_dup", "excluded_old", "manual_excluded"):
            continue

        if kw:
            hay = " ".join([
                str(it.get("koc_username") or ""),
                str(it.get("video_url") or ""),
                str(it.get("product_note") or ""),
                str(it.get("title") or ""),
                str(it.get("published_at") or ""),
                str(it.get("dup_source_name") or ""),
            ]).lower()
            if kw not in hay:
                continue
        out_videos.append(it)

    rep_min_views = (
        int(next(iter(src_meta.values()))[1].get("min_views") or 200)
        if len(src_meta) == 1
        else int(default_rules.get("min_views") if default_rules.get("min_views") is not None else 200)
    )
    return {
        "videos": out_videos,
        "min_views": rep_min_views,
        "filter_counts": counts,
    }


def commission_by_staff(cur, month: str) -> Dict[int, dict]:
    """Tính tổng hoa hồng KOC theo staff_id trong tháng YYYY-MM để cộng vào Bảng Lương HRM."""
    ensure_koc_schema(cur)
    summary = list_sources_summary(cur, month=month)
    out: Dict[int, dict] = {}
    for src in summary["sources"]:
        sid = src.get("staff_id")
        if not sid:
            continue
        st = src["stats"]
        rec = out.setdefault(sid, {
            "commission": 0,
            "videos": 0,
            "qualified_videos": 0,
            "auto_qualified_videos": 0,
            "manual_approved_videos": 0,
            "payable_videos": 0,
            "excluded_videos": 0,
        })
        rec["commission"] += int(st.get("commission") or 0)
        rec["videos"] += int(st.get("total_videos") or 0)
        rec["qualified_videos"] += int(st.get("qualified_videos") or 0)
        rec["auto_qualified_videos"] += int(st.get("auto_qualified_videos") or 0)
        rec["manual_approved_videos"] += int(st.get("manual_approved_videos") or 0)
        rec["payable_videos"] += int(st.get("payable_videos") or 0)
        rec["excluded_videos"] += int(st.get("excluded_videos") or 0)
    return out

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
}

TIKTOK_URL_RE = re.compile(r"https?://(?:www\.|vm\.|vt\.)?tiktok\.com/[^\s,;\'\"><\)]+", re.I)
VIDEO_ID_RE = re.compile(r"/video/(\d+)")
USERNAME_RE = re.compile(r"/@([a-zA-Z0-9_.\-]+)")


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
        UNIQUE(source_id, video_key)
    )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_koc_sources_month ON koc_sources(month, staff_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_koc_videos_source ON koc_videos(source_id, views)")
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


def calc_koc_commission(videos: List[dict], rules: dict) -> dict:
    min_views = int(rules.get("min_views") if rules.get("min_views") is not None else 200)
    kpi_deduct = int(rules.get("kpi_deduct_videos") or 0)
    rate = float(rules.get("rate_per_video") if rules.get("rate_per_video") is not None else 10_000)
    viral_min = int(rules.get("viral_min_views") if rules.get("viral_min_views") is not None else 1_000)
    viral_bonus = float(rules.get("viral_bonus") or 0)

    total_videos = len(videos)
    active_videos = 0
    error_videos = 0
    qualified_videos = 0
    under_kpi_videos = 0
    viral_videos = 0
    total_views = 0
    koc_set = set()

    for v in videos:
        views = int(v.get("views") or 0)
        status_str = str(v.get("status") or "OK").strip().lower()
        is_err = any(x in status_str for x in ("lỗi", "error", "riêng tư", "private", "xóa", "dead", "không tồn tại"))
        total_views += max(0, views)
        uname = (v.get("koc_username") or "").strip().lstrip("@/").lower()
        if uname:
            koc_set.add(uname)
        if is_err and views < min_views:
            error_videos += 1
        else:
            active_videos += 1
        if views >= min_views:
            qualified_videos += 1
            if viral_min > 0 and views >= viral_min:
                viral_videos += 1
        elif not is_err:
            under_kpi_videos += 1

    payable_videos = max(0, qualified_videos - max(0, kpi_deduct))
    base_commission = round(payable_videos * rate)
    viral_commission = round(viral_videos * viral_bonus) if viral_bonus > 0 else 0
    total_commission = base_commission + viral_commission

    return {
        "total_videos": total_videos,
        "active_videos": active_videos,
        "error_videos": error_videos,
        "qualified_videos": qualified_videos,
        "under_kpi_videos": under_kpi_videos,
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
        },
    }


def download_sheet_xlsx_bytes(sheet_url_or_id: str) -> Tuple[str, bytes]:
    sheet_id = extract_sheet_id(sheet_url_or_id)
    export_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=xlsx"
    req = urllib.request.Request(export_url, headers={"User-Agent": "Mozilla/5.0"})
    data = urllib.request.urlopen(req, timeout=45).read()
    return sheet_id, data


def inspect_workbook_tabs(xlsx_bytes: bytes) -> List[dict]:
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), data_only=True, read_only=True)
    tabs = []
    for name in wb.sheetnames:
        ws = wb[name]
        sample_text = ""
        row_count = 0
        for r_idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
            row_count = r_idx
            if r_idx <= 16:
                non_empty = [str(c).strip() for c in row[:25] if c is not None and str(c).strip()]
                if non_empty:
                    sample_text += " | ".join(non_empty[:8]) + "\n"
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


def parse_koc_booking_sheet(ws) -> Tuple[List[dict], List[dict]]:
    """Đọc tab quản lý KOC của nhân sự (vd THANH 102026, Đôn 62026, Kho KOCKOL...).
    Trả về (danh_sách_koc_profiles, danh_sách_videos_tách_từ_link_air).
    """
    header_row = None
    col_map: Dict[str, int] = {}
    max_r = ws.max_row or 0
    max_c = min(ws.max_column or 0, 40)

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
                    # Kiểm tra nếu cột tiếp theo là Link Air thì ưu tiên Link Air
                    if "link air" in h:
                        col_map["link_air"] = c_idx
                    elif "link_air" not in col_map:
                        col_map["link_air"] = c_idx
                elif "ngày air" in h:
                    col_map["air_date"] = c_idx
                elif h == "note" and "note" not in col_map:
                    col_map["note"] = c_idx
            # Nếu dòng kế tiếp cũng là header phụ (như dòng 14 trong THANH 102026)
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

    if not header_row:
        return [], []

    profiles: Dict[str, dict] = {}
    videos: Dict[str, dict] = {}

    for r in range(header_row + 1, max_r + 1):
        raw_koc = ws.cell(r, col_map.get("koc", 3)).value if col_map.get("koc") else None
        raw_link = ws.cell(r, col_map.get("link", 4)).value if col_map.get("link") else None
        # Quét toàn bộ dòng tìm các link TikTok video (phòng trường hợp cột Link Air bị dịch chuyển giữa các tháng)
        row_video_urls = []
        for c in range(1, max_c + 1):
            cell_val = ws.cell(r, c).value
            if cell_val and isinstance(cell_val, str) and "/video/" in cell_val:
                row_video_urls.extend(TIKTOK_URL_RE.findall(cell_val))

        username, fl, gmv = _parse_koc_cell(raw_koc, raw_link)
        if not username and row_video_urls:
            username = extract_username(row_video_urls[0])
        if not username or username.lower() in ("koc", "id koc", "stt", "tổng kết chiến dịch"):
            continue

        ch_url = str(raw_link or "").strip()
        if not ch_url or not ch_url.startswith("http"):
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
        air_dt = _fmt_cell_dt(ws.cell(r, col_map["air_date"]).value) if col_map.get("air_date") else ""

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
            videos[vkey] = {
                "video_key": vkey,
                "video_url": vu,
                "koc_username": v_author,
                "views": 0,
                "likes": 0,
                "comments": 0,
                "shares": 0,
                "title": "",
                "product_note": sample,
                "status": "Chưa quét view",
                "published_at": air_dt,
                "updated_at": "",
            }

    return list(profiles.values()), list(videos.values())


def parse_video_views_sheet(ws) -> Tuple[List[dict], Optional[dict]]:
    """Đọc tab tổng hợp Link TikTok & Lượt xem (vd tab '2', 'Tiktok', 'Bản sao của Tiktok', 'Tiktok_ChiTiet').
    Trả về (danh_sách_videos, rules_nếu_có_trong_sheet).
    """
    max_r = ws.max_row or 0
    max_c = min(ws.max_column or 0, 20)
    detected_rules = {}

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

    for r in range(1, min(15, max_r + 1)):
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
        if any("link tiktok" in x for x in row_vals) and any("lượt xem" in x for x in row_vals):
            header_row = r
            for c_idx, h in enumerate(row_vals, start=1):
                if "link tiktok" in h:
                    col_url = c_idx
                elif "lượt xem" in h:
                    col_views = c_idx
                elif "cập nhật" in h:
                    col_updated = c_idx
                elif "trạng thái" in h:
                    col_status = c_idx
                elif "tác giả" in h:
                    col_author = c_idx
                elif "tiêu đề" in h:
                    col_title = c_idx
                elif "lượt thích" in h:
                    col_likes = c_idx
                elif "bình luận" in h:
                    col_comments = c_idx
                elif "chia sẻ" in h:
                    col_shares = c_idx
                elif "ngày đăng" in h:
                    col_pub = c_idx
            break

    start_r = (header_row + 1) if header_row else 2
    videos: Dict[str, dict] = {}

    for r in range(start_r, max_r + 1):
        raw_url = ws.cell(r, col_url).value
        if not raw_url or not isinstance(raw_url, str) or "tiktok.com" not in raw_url.lower():
            continue
        url = clean_tiktok_url(raw_url)
        if "/video/" not in url:
            continue
        vkey = extract_video_key(url)
        raw_views = ws.cell(r, col_views).value if col_views else 0
        views = int(_safe_float(raw_views)) if isinstance(raw_views, (int, float)) else 0
        updated = _fmt_cell_dt(ws.cell(r, col_updated).value) if col_updated else ""
        status = str(ws.cell(r, col_status).value or "OK").strip() if col_status else "OK"
        author = str(ws.cell(r, col_author).value or "").strip().lstrip("@/") if col_author else ""
        if not author:
            author = extract_username(url)
        title = str(ws.cell(r, col_title).value or "").strip() if col_title else ""
        likes = int(_safe_float(ws.cell(r, col_likes).value)) if col_likes else 0
        comments = int(_safe_float(ws.cell(r, col_comments).value)) if col_comments else 0
        shares = int(_safe_float(ws.cell(r, col_shares).value)) if col_shares else 0
        pub = _fmt_cell_dt(ws.cell(r, col_pub).value) if col_pub else ""

        # Ở tab '2' cột G (7) lưu tên sản phẩm (vd 'xương orgo', 'nước hoa juno')
        prod_note = ""
        if not col_likes and max_c >= 7:
            g_val = ws.cell(r, 7).value
            if isinstance(g_val, str) and not g_val.startswith("http") and "video" not in g_val.lower():
                prod_note = g_val.strip()

        videos[vkey] = {
            "video_key": vkey,
            "video_url": url,
            "koc_username": author,
            "views": views,
            "likes": likes,
            "comments": comments,
            "shares": shares,
            "title": title,
            "product_note": prod_note,
            "status": status,
            "published_at": pub,
            "updated_at": updated,
        }

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

    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), data_only=True)

    koc_tab = (src["koc_tab_name"] or "").strip()
    video_tab = (src["video_tab_name"] or "").strip()

    profiles_list: List[dict] = []
    booking_videos: List[dict] = []
    view_videos: List[dict] = []

    ws_koc = _find_sheet_by_name(wb, koc_tab)
    if ws_koc is not None:
        profiles_list, booking_videos = parse_koc_booking_sheet(ws_koc)

    ws_vid = _find_sheet_by_name(wb, video_tab)
    if ws_vid is not None:
        view_videos, _ = parse_video_views_sheet(ws_vid)

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

    # Nếu chỉ chọn tab video_tab mà không chọn koc_tab -> tự gom danh sách KOC từ danh sách video
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

    cur.execute("UPDATE koc_sources SET last_sync_at = ? WHERE id = ?", (now_str, source_id))
    return {"profiles_synced": len(profiles_list), "videos_synced": len(merged_videos)}


async def fetch_tiktok_video_metrics(video_url: str, client: httpx.AsyncClient) -> dict:
    clean_u = video_url.split("?")[0].strip()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        res = await client.post("https://www.tikwm.com/api/", data={"url": clean_u}, timeout=12.0)
        if res.status_code == 200:
            payload = res.json()
            if payload.get("code") == 0 and payload.get("data"):
                d = payload["data"]
                author = (d.get("author") or {}).get("unique_id") or extract_username(video_url)
                pub_ts = d.get("create_time")
                pub_str = datetime.datetime.fromtimestamp(int(pub_ts)).strftime("%Y-%m-%d %H:%M") if pub_ts else ""
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
            return {"ok": False, "status": f"Lỗi: {msg[:40]}", "updated_at": now_str}
    except Exception as e:
        return {"ok": False, "status": f"Lỗi mạng: {str(e)[:30]}", "updated_at": now_str}
    return {"ok": False, "status": "Không lấy được view", "updated_at": now_str}


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
        cur.execute("SELECT COUNT(*) FROM koc_profiles WHERE source_id = ?", (src["id"],))
        koc_count = cur.fetchone()[0]
        cur.execute("SELECT * FROM koc_videos WHERE source_id = ?", (src["id"],))
        vids = [dict(r) for r in cur.fetchall()]
        rules = source_rules(cur, src, default_rules)
        calc = calc_koc_commission(vids, rules)
        src["koc_count"] = koc_count
        src["custom_rules"] = bool(src.get("rules_json"))
        src["rules"] = rules
        src["stats"] = calc
        out_sources.append(src)

    return {"sources": out_sources, "default_rules": default_rules}


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
        rec = out.setdefault(sid, {"commission": 0, "videos": 0, "qualified_videos": 0})
        rec["commission"] += int(st.get("commission") or 0)
        rec["videos"] += int(st.get("total_videos") or 0)
        rec["qualified_videos"] += int(st.get("qualified_videos") or 0)
    return out

"""Đọc file Excel máy chấm công (định dạng sheet 'CHI TIẾT CHẤM CÔNG') -> list dòng chuẩn hoá."""
import io
import re
import unicodedata
from datetime import date, datetime

import openpyxl

from services.payroll_engine import to_min, fmt_min


def _norm(s) -> str:
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


HEADER_ALIASES = {
    "device_code": ["machamcong", "mamay", "userid", "enrollnumber", "acno"],
    "name": ["tennvien", "tennhanvien", "hoten", "name"],
    "work_date": ["ngay", "date", "ngaycham"],
    "punch": ["vao1", "ra1", "vao2", "ra2", "vao3", "ra3"],
}


def _parse_date(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v or "").strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def _code(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def parse_attendance_xlsx(content: bytes) -> dict:
    """Trả {"rows": [{device_code, name, work_date(date), punches[list phút]}], "errors": [str]}."""
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    ws = wb.active
    header_row, cols = None, {}
    rows_iter = list(ws.iter_rows(values_only=True))
    for idx, row in enumerate(rows_iter[:15]):
        normed = [_norm(c) for c in row]
        if any(n in HEADER_ALIASES["device_code"] for n in normed) and any(n in HEADER_ALIASES["work_date"] for n in normed):
            header_row = idx
            for ci, n in enumerate(normed):
                for key, aliases in HEADER_ALIASES.items():
                    if n in aliases:
                        if key == "punch":
                            cols.setdefault("punch", []).append(ci)
                        else:
                            cols.setdefault(key, ci)
            break
    if header_row is None or "punch" not in cols:
        return {"rows": [], "errors": ["Không tìm thấy dòng tiêu đề (cần cột 'Mã chấm công', 'Ngày', 'Vào1'...'Ra3')."]}

    out, errors = [], []
    for i, row in enumerate(rows_iter[header_row + 1:], start=header_row + 2):
        code = _code(row[cols["device_code"]] if cols["device_code"] < len(row) else None)
        if not code:
            continue
        d = _parse_date(row[cols["work_date"]] if cols["work_date"] < len(row) else None)
        if not d:
            errors.append(f"Dòng {i}: ngày không hợp lệ")
            continue
        raw = [row[c] for c in cols["punch"] if c < len(row)]
        punches = sorted({m for m in (to_min(v) for v in raw) if m is not None})
        name = str(row[cols["name"]]).strip() if "name" in cols and cols["name"] < len(row) and row[cols["name"]] else ""
        out.append({"device_code": code, "name": name, "work_date": d, "punches": punches})
    return {"rows": out, "errors": errors}


def punches_to_json(punches) -> list:
    return [fmt_min(m) for m in punches]

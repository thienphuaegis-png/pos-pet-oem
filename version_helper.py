import os
import json
import subprocess
import datetime
from pathlib import Path

def find_version_file():
    candidates = [
        Path("version.json"),
        Path(__file__).parent / "version.json",
        Path(os.environ.get("_MEIPASS", "")) / "version.json" if "_MEIPASS" in os.environ else None
    ]
    for c in candidates:
        if c and c.exists():
            return c
    return None

def get_git_metadata():
    """Lấy commit hash và ngày commit gần nhất từ Git nếu có"""
    try:
        commit = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
            cwd=str(Path(__file__).parent)
        ).decode().strip()
        
        date_str = subprocess.check_output(
            ["git", "log", "-1", "--format=%cd", "--date=format:%Y.%m.%d"],
            stderr=subprocess.DEVNULL,
            cwd=str(Path(__file__).parent)
        ).decode().strip()
        return commit, date_str
    except Exception:
        return None, None

def get_app_version_info():
    """Trả về thông tin phiên bản động kèm changelog"""
    info = {
        "version": "v3.5.0",
        "short_version": "v3.5",
        "build_date": datetime.date.today().strftime("%Y.%m.%d"),
        "commit_hash": "latest",
        "release_title": "Bản Cập Nhật Mới",
        "is_recent": True,
        "changelog": []
    }

    # Đọc từ version.json nếu có
    v_path = find_version_file()
    if v_path and v_path.exists():
        try:
            with open(v_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                info.update(data)
        except Exception:
            pass

    # Nếu có Git, ưu tiên lấy commit hash và ngày thực tế từ Git
    git_commit, git_date = get_git_metadata()
    if git_commit:
        info["commit_hash"] = git_commit
    if git_date:
        info["build_date"] = git_date

    # Tính short_version (ví dụ v3.5 từ v3.5.0)
    ver = info.get("version", "v3.5.0")
    parts = ver.lstrip("v").split(".")
    if len(parts) >= 2:
        info["short_version"] = f"v{parts[0]}.{parts[1]}"
    else:
        info["short_version"] = ver

    # Kiểm tra xem có phải bản mới trong vòng 3 ngày không
    try:
        parts = info["build_date"].split(".")
        if len(parts) == 3:
            b_date = datetime.date(int(parts[0]), int(parts[1]), int(parts[2]))
            days_diff = (datetime.date.today() - b_date).days
            info["is_recent"] = (0 <= days_diff <= 3)
    except Exception:
        info["is_recent"] = True

    return info

#!/usr/bin/env python3
"""scripts/bump_version.py: Tự động tăng version SemVer trong version.json và cập nhật changelog.
Dùng:
    python scripts/bump_version.py --auto
    python scripts/bump_version.py --patch
    python scripts/bump_version.py --minor
    python scripts/bump_version.py --major
    python scripts/bump_version.py --tag
"""
import argparse
import datetime
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
VERSION_JSON_PATH = ROOT_DIR / "version.json"


def get_git_info():
    """Lấy commit hash ngắn và ngày hiện tại từ git"""
    try:
        commit = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
            cwd=str(ROOT_DIR),
        ).decode().strip()
    except Exception:
        commit = "latest"

    date_str = datetime.date.today().strftime("%Y.%m.%d")
    return commit, date_str


def parse_semver(v_str: str):
    prefix = "v" if v_str.startswith("v") else ""
    m = re.match(r"^v?(\d+)\.(\d+)\.(\d+)", v_str)
    if not m:
        raise ValueError(f"Version không đúng định dạng SemVer: {v_str}")
    return prefix, [int(x) for x in m.groups()]


def bump(parts, level: str):
    maj, mino, pat = parts
    if level == "major":
        return [maj + 1, 0, 0]
    if level == "minor":
        return [maj, mino + 1, 0]
    return [maj, mino, pat + 1]


def detect_level_from_git(base_commit: str = None):
    """Phân tích commit log từ base_commit đến HEAD theo Conventional Commits"""
    try:
        rng = f"{base_commit}..HEAD" if base_commit else "HEAD"
        log = subprocess.check_output(
            ["git", "log", rng, "--pretty=%s"],
            stderr=subprocess.DEVNULL,
            cwd=str(ROOT_DIR),
        ).decode()
        if not log.strip():
            return "patch"
        if re.search(r"\bBREAKING CHANGE\b|!:", log, re.M):
            return "major"
        if re.search(r"^feat(\(.+\))?:", log, re.M):
            return "minor"
        return "patch"
    except Exception:
        return "patch"


def get_commit_messages_since(base_commit: str = None, limit: int = 15):
    """Lấy danh sách tóm tắt commit gần đây làm changelog items"""
    try:
        rng = f"{base_commit}..HEAD" if base_commit else f"-n {limit}"
        args = ["git", "log", rng, "--format=%s"]
        if not base_commit:
            args = ["git", "log", f"-n{limit}", "--format=%s"]
        out = subprocess.check_output(args, stderr=subprocess.DEVNULL, cwd=str(ROOT_DIR)).decode().strip()
        lines = [line.strip() for line in out.splitlines() if line.strip()]
        return lines[:limit] if lines else ["Cập nhật định kỳ hệ thống."]
    except Exception:
        return ["Cập nhật định kỳ hệ thống."]


def bump_version_json(level: str = "patch", dry_run: bool = False, create_tag: bool = False):
    if not VERSION_JSON_PATH.exists():
        sys.exit(f"❌ Không tìm thấy {VERSION_JSON_PATH}")

    with open(VERSION_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    current_ver = data.get("version", "v3.5.0")
    base_commit = data.get("commit_hash")
    head_commit, today_str = get_git_info()

    if level == "auto":
        level = detect_level_from_git(base_commit)

    prefix, parts = parse_semver(current_ver)
    new_parts = bump(parts, level)
    new_ver = f"{prefix}{new_parts[0]}.{new_parts[1]}.{new_parts[2]}"

    # Lấy commit messages để làm changelog mới
    recent_msgs = get_commit_messages_since(base_commit)

    # Đánh dấu changelog cũ thành is_new: False
    for cl in data.get("changelog", []):
        cl["is_new"] = False

    new_changelog_entry = {
        "tag": new_ver,
        "date": today_str,
        "title": f"Bản phát hành {new_ver} ({today_str})",
        "is_new": True,
        "items": recent_msgs,
    }

    data["version"] = new_ver
    data["build_date"] = today_str
    data["commit_hash"] = head_commit
    data["changelog"] = [new_changelog_entry] + data.get("changelog", [])

    if dry_run:
        print(f"[DRY-RUN] Sẽ bump: {current_ver} -> {new_ver} (level={level}, commit={head_commit})")
        return new_ver

    with open(VERSION_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"✅ Đã cập nhật version.json: {current_ver} -> {new_ver} (level={level}, commit={head_commit})")

    if create_tag:
        try:
            subprocess.run(["git", "tag", "-a", new_ver, "-m", f"release {new_ver}"], cwd=str(ROOT_DIR), check=True)
            print(f"🏷️  Đã tạo git tag: {new_ver}")
        except Exception as e:
            print(f"⚠️  Không thể tạo git tag: {e}")

    return new_ver


def main():
    parser = argparse.ArgumentParser(description="Tự động bump version và cập nhật version.json")
    parser.add_argument("--major", action="store_true", help="Tăng MAJOR version")
    parser.add_argument("--minor", action="store_true", help="Tăng MINOR version")
    parser.add_argument("--patch", action="store_true", help="Tăng PATCH version")
    parser.add_argument("--auto", action="store_true", help="Tự động phân tích commit log để chọn level")
    parser.add_argument("--tag", action="store_true", help="Tạo git tag sau khi bump")
    parser.add_argument("--dry-run", action="store_true", help="Chỉ kiểm tra, không ghi file")

    args = parser.parse_args()

    level = "patch"
    if args.auto:
        level = "auto"
    elif args.major:
        level = "major"
    elif args.minor:
        level = "minor"
    elif args.patch:
        level = "patch"
    else:
        # Mặc định auto nếu không truyền cờ
        level = "auto"

    bump_version_json(level=level, dry_run=args.dry_run, create_tag=args.tag)


if __name__ == "__main__":
    main()

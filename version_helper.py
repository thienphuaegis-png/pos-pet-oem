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

def get_git_commits_ahead(base_commit: str = None) -> int:
    """Đếm số commit từ base_commit đến HEAD để tự động đếm phiên bản không bị sót."""
    if not base_commit or base_commit == "latest":
        return 0
    try:
        root_dir = str(Path(__file__).parent)
        out = subprocess.check_output(
            ["git", "rev-list", "--count", f"{base_commit}..HEAD"],
            stderr=subprocess.DEVNULL,
            cwd=root_dir
        ).decode().strip()
        return int(out) if out.isdigit() else 0
    except Exception:
        return 0

def get_git_total_commits() -> int:
    """Lấy tổng số commit trong repository (build number)."""
    try:
        root_dir = str(Path(__file__).parent)
        out = subprocess.check_output(
            ["git", "rev-list", "--count", "HEAD"],
            stderr=subprocess.DEVNULL,
            cwd=root_dir
        ).decode().strip()
        return int(out) if out.isdigit() else 0
    except Exception:
        return 0

def check_remote_update_available():
    """Kiểm tra xem remote repository (github/origin) có bản commit mới hơn local không."""
    try:
        root_dir = Path(__file__).parent.resolve()
        local_head = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL,
            cwd=str(root_dir)
        ).decode().strip()

        # Thiết lập SSH key nếu có để git không bị hỏi xác thực
        env = os.environ.copy()
        id_key = root_dir / "deploy" / "id_pos_shop"
        if id_key.exists():
            env["GIT_SSH_COMMAND"] = f'ssh -i "{str(id_key).replace(chr(92), "/")}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new'

        remote_head = None

        # 1. Thử remote 'github'
        try:
            out = subprocess.check_output(
                ["git", "ls-remote", "github", "HEAD"],
                stderr=subprocess.DEVNULL,
                cwd=str(root_dir),
                env=env,
                timeout=5
            ).decode().strip()
            if out:
                remote_head = out.split()[0]
        except Exception:
            pass

        # 2. Thử remote 'origin'
        if not remote_head:
            try:
                out = subprocess.check_output(
                    ["git", "ls-remote", "origin", "HEAD"],
                    stderr=subprocess.DEVNULL,
                    cwd=str(root_dir),
                    env=env,
                    timeout=5
                ).decode().strip()
                if out:
                    remote_head = out.split()[0]
            except Exception:
                pass

        # 3. Thử direct URL repo
        if not remote_head:
            try:
                out = subprocess.check_output(
                    ["git", "ls-remote", "https://github.com/thienphuaegis-png/pos-pet-oem.git", "HEAD"],
                    stderr=subprocess.DEVNULL,
                    cwd=str(root_dir),
                    env=env,
                    timeout=5
                ).decode().strip()
                if out:
                    remote_head = out.split()[0]
            except Exception:
                pass

        if remote_head:
            if remote_head != local_head:
                return {
                    "update_available": True,
                    "local_commit": local_head[:7],
                    "remote_commit": remote_head[:7],
                    "message": f"Có bản cập nhật mới trên GitHub (commit {remote_head[:7]})!"
                }
            else:
                return {
                    "update_available": False,
                    "local_commit": local_head[:7],
                    "remote_commit": remote_head[:7],
                    "message": "Bạn đang dùng phiên bản mới nhất."
                }
    except Exception as e:
        pass

    return {
        "update_available": False,
        "local_commit": "latest",
        "remote_commit": "latest",
        "message": "Hệ thống đang hoạt động với phiên bản hiện tại."
    }

def get_app_version_info():
    """Trả về thông tin phiên bản động kèm changelog tự động từ Git + version.json"""
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
    base_commit = None
    if v_path and v_path.exists():
        try:
            with open(v_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                info.update(data)
                base_commit = data.get("commit_hash")
        except Exception:
            pass

    # Nếu có Git, ưu tiên lấy commit hash và ngày thực tế từ Git
    git_commit, git_date = get_git_metadata()
    if git_commit:
        info["commit_hash"] = git_commit
    if git_date:
        info["build_date"] = git_date

    # Tự động đếm số commit (build number) và đếm bù phiên bản nếu có commits mới
    total_commits = get_git_total_commits()
    if total_commits:
        info["build_number"] = total_commits

    ahead = get_git_commits_ahead(base_commit)
    info["commits_ahead"] = ahead
    if ahead > 0:
        ver = info.get("version", "v3.6.0")
        v_prefix = "v" if ver.startswith("v") else ""
        clean_ver = ver.lstrip("v")
        v_parts = clean_ver.split(".")
        if len(v_parts) == 3 and v_parts[0].isdigit() and v_parts[1].isdigit() and v_parts[2].isdigit():
            info["version"] = f"{v_prefix}{v_parts[0]}.{v_parts[1]}.{int(v_parts[2]) + ahead}"
        elif len(v_parts) >= 2 and v_parts[0].isdigit() and v_parts[1].isdigit():
            info["version"] = f"{v_prefix}{v_parts[0]}.{v_parts[1]}.{ahead}"

    # TỰ ĐỘNG ĐỌC NHẬT KÝ TỪ LỊCH SỬ GIT LOG ĐỂ KHÔNG BỊ BỎ SÓT CẬP NHẬT GẦN ĐÂY
    try:
        root_dir = Path(__file__).parent.resolve()
        log_out = subprocess.check_output(
            ["git", "log", "-n", "8", "--format=%h|%cd|%s", "--date=format:%Y.%m.%d %H:%M"],
            stderr=subprocess.DEVNULL,
            cwd=str(root_dir)
        ).decode().strip()

        if log_out:
            recent_items = []
            prefix_map = {
                "feat(ux)": "✨ Trải Nghiệm:",
                "fix(spa)": "💆 Spa:",
                "fix(ui)": "🎨 Giao Diện:",
                "feat(system)": "🚀 Hệ Thống:",
                "feat(version)": "🏷️ Phiên Bản:",
                "feat(oem)": "🏭 Gia Công OEM:",
                "feat(bom)": "📦 Định Lượng BOM:",
                "fix(purchases)": "📥 Nhập Hàng:",
                "feat(topup)": "💳 Nạp Ví Spa:",
                "feat(inventory)": "⚖️ Kiểm Kê Kho:"
            }

            for line in log_out.splitlines():
                parts = line.split("|", 2)
                if len(parts) == 3:
                    c_hash, c_date, c_msg = parts[0].strip(), parts[1].strip(), parts[2].strip()
                    # Dịch nhẹ prefix sang tiếng Việt dễ đọc
                    formatted_msg = c_msg
                    for k, v in prefix_map.items():
                        if c_msg.lower().startswith(k):
                            formatted_msg = f"{v} {c_msg[len(k):].strip()}"
                            break
                    recent_items.append(f"[{c_hash}] {formatted_msg} ({c_date})")

            # Đặt nhóm commit gần nhất lên đầu changelog
            if recent_items:
                git_log_group = {
                    "tag": info.get("version", "v3.5.0"),
                    "date": info.get("build_date", datetime.date.today().strftime("%Y.%m.%d")),
                    "title": "⚡ Các thay đổi vừa cập nhật từ Git (Tự động đồng bộ):",
                    "is_new": True,
                    "items": recent_items
                }
                # Giữ lại các changelog mẫu cũ bên dưới
                existing_changelogs = [c for c in info.get("changelog", []) if not c.get("is_git_live")]
                git_log_group["is_git_live"] = True
                info["changelog"] = [git_log_group] + existing_changelogs
    except Exception as e:
        pass

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

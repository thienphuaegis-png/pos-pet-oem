"""Canh cửa: git không được track DB, log, binary, secret.

Nếu test này fail nghĩa là `git pull` trên máy tiệm có thể ĐÈ dữ liệu thật
của khách. Đây là rủi ro mất dữ liệu nghiêm trọng nhất của toàn bộ thiết kế
triển khai nhiều tiệm — đừng tắt test này.
"""
import subprocess, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FORBIDDEN_EXT = (".db", ".pyc", ".log", ".exe", ".db-wal", ".db-shm")
FORBIDDEN_DIR = ("logs/", "__pycache__/", "data/backups/", ".venv/", "dist/", "build/")


def _tracked():
    out = subprocess.run(["git", "ls-files"], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout
    return [l.strip() for l in out.splitlines() if l.strip()]


def test_no_forbidden_extensions():
    bad = [f for f in _tracked() if f.lower().endswith(FORBIDDEN_EXT)]
    assert not bad, f"Git đang track file không được phép: {bad}"


def test_no_forbidden_dirs():
    bad = [f for f in _tracked() if any(d in f.replace("\\", "/") for d in FORBIDDEN_DIR)]
    assert not bad, f"Git đang track thư mục không được phép: {bad}"


def test_env_not_tracked():
    assert ".env" not in _tracked(), ".env chứa JWT secret, không được commit"


def test_gitignore_covers_them():
    with open(os.path.join(ROOT, ".gitignore"), encoding="utf-8") as f:
        ig = f.read()
    for pat in ("data/*.db", "logs/", "__pycache__/", "cloudflared.exe",
                "data/backups/", ".env", ".venv/", "deploy/khoa_tiem"):
        assert pat in ig, f".gitignore thiếu: {pat}"


def test_no_private_keys_tracked():
    """Mỗi tiệm có deploy key riêng đặt ở deploy/khoa_tiem. Commit nhầm khoá
    riêng = ai đọc được repo cũng clone được repo bằng danh nghĩa tiệm đó."""
    bad = [f for f in _tracked()
           if "khoa_tiem" in f or f.endswith((".pem", "id_rsa", "id_ed25519"))]
    assert not bad, f"Git đang track khoá riêng: {bad}"


def test_no_token_in_source():
    """File mồi gửi cho tiệm có token nhúng trong. Bản đã điền token KHÔNG
    được commit — token GitHub có dạng ghp_* hoặc github_pat_*."""
    import re, os as _os
    pat = re.compile(r"(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})")
    # Kiểm tra cả tracked và các file bat trong deploy/
    checked = set(_tracked())
    for f in _os.listdir(os.path.join(ROOT, "deploy")):
        if (f.endswith(".bat") and not f.startswith("_file_moi_")
                and not f.startswith("CAI_DAT_POS_ONLINE_")
                and f != "khoa_tiem.txt"):
            checked.add(os.path.join("deploy", f).replace("\\", "/"))

    for f in checked:
        full = _os.path.join(ROOT, f)
        if not _os.path.isfile(full) or _os.path.getsize(full) > 2_000_000:
            continue
        try:
            with open(full, encoding="utf-8", errors="ignore") as fh:
                m = pat.search(fh.read())
        except OSError:
            continue
        assert not m, f"Token GitHub bị commit trong {f}: {m.group()[:12]}..."


if __name__ == "__main__":
    test_no_forbidden_extensions(); print("✓ không track db/pyc/log/exe")
    test_no_forbidden_dirs();       print("✓ không track logs/pycache/backups")
    test_env_not_tracked();         print("✓ .env an toàn")
    test_gitignore_covers_them();   print("✓ .gitignore đầy đủ")
    test_no_private_keys_tracked(); print("✓ không track khoá riêng")
    test_no_token_in_source();      print("✓ không commit token GitHub")
    print("\nALL PASS ✅")

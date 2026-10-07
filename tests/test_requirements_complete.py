"""Canh cửa: mọi thư viện runtime phải có trong requirements.txt.

Vì sao cần: `passlib`, `bcrypt`, `PyJWT` từng bị thiếu trong requirements.txt
dù `routers/auth.py` và `dependencies.py` dùng để hash mật khẩu + tạo token.
Máy tiệm cài theo requirements sẽ crash ngay lúc đăng nhập. Test này bắt
lỗi đó trước khi phát hành.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# File chạy khi server hoạt động (không tính tests/, scripts/, tools/)
RUNTIME_FILES = ["main.py", "server.py", "database.py", "schemas.py",
                 "dependencies.py", "activity_logger.py", "backup_service.py",
                 "logger_config.py"]
RUNTIME_DIRS = ["routers", "services"]

# import-name → tên trên PyPI (khi khác nhau)
PYPI_NAME = {
    "dotenv": "python-dotenv", "jwt": "pyjwt", "PIL": "pillow",
    "bs4": "beautifulsoup4", "multipart": "python-multipart",
    "yaml": "pyyaml", "win32api": "pywin32", "pywintypes": "pywin32",
}


def _runtime_imports():
    paths = [os.path.join(ROOT, f) for f in RUNTIME_FILES]
    for d in RUNTIME_DIRS:
        for f in os.listdir(os.path.join(ROOT, d)):
            if f.endswith(".py"):
                paths.append(os.path.join(ROOT, d, f))

    mods = set()
    pat = re.compile(r"^\s*(?:from|import)\s+([a-zA-Z_][a-zA-Z0-9_]*)", re.M)
    for p in paths:
        if not os.path.exists(p):
            continue
        with open(p, encoding="utf-8") as fh:
            mods.update(pat.findall(fh.read()))
    return mods


def _third_party(mods):
    stdlib = set(sys.stdlib_module_names)
    local = {os.path.splitext(f)[0] for f in os.listdir(ROOT) if f.endswith(".py")}
    local |= {"routers", "scripts", "tests", "tools", "deploy", "services"}
    return {m for m in mods if m not in stdlib and m not in local}


def test_all_runtime_deps_in_requirements():
    with open(os.path.join(ROOT, "requirements.txt"), encoding="utf-8") as f:
        req = f.read().lower()
    missing = sorted(
        m for m in _third_party(_runtime_imports())
        if PYPI_NAME.get(m, m).lower() not in req
    )
    assert not missing, (
        f"Thư viện runtime THIẾU trong requirements.txt: {missing}\n"
        "Máy tiệm cài theo requirements.txt sẽ crash. Thêm vào ngay."
    )


def test_auth_deps_present():
    """Kiểm riêng 3 dep đăng nhập — từng thiếu, hậu quả nặng nhất."""
    with open(os.path.join(ROOT, "requirements.txt"), encoding="utf-8") as f:
        req = f.read().lower()
    for dep in ("passlib", "bcrypt", "pyjwt"):
        assert dep in req, f"requirements.txt thiếu {dep} — không đăng nhập được"


if __name__ == "__main__":
    test_all_runtime_deps_in_requirements(); print("✓ dep runtime đầy đủ")
    test_auth_deps_present();                print("✓ dep đăng nhập đầy đủ")
    print("\nALL PASS ✅")

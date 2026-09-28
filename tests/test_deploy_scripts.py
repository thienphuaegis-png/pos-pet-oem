"""Kiểm tra các script triển khai (.bat/.ps1/.vbs) trước khi phát hành cho tiệm.

Không chạy được .bat trong test (cần Administrator, đổi firewall thật), nên
test này kiểm các thuộc tính tĩnh mà nếu sai sẽ phá máy tiệm:
- Không gọi `winget` trần (không có trong PATH shell non-interactive)
- Không có dấu tiếng Việt trong dòng `echo` (console cp437 vỡ chữ)
- Backup DB phải nằm TRƯỚC git pull
- Không ghi đè data\\pos.db khi cài lại
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEPLOY = os.path.join(ROOT, "deploy")

BATS = ["CAI_DAT_MAY_CHU.bat", "CAP_NHAT.bat", "CAI_MAY_CON.bat"]


def _read(name):
    with open(os.path.join(DEPLOY, name), encoding="utf-8") as f:
        return f.read()


def _existing_bats():
    return [b for b in BATS if os.path.exists(os.path.join(DEPLOY, b))]


def test_no_bare_winget():
    """`winget` không nằm trong PATH của shell non-interactive dù đã cài.
    Nó là app-execution-alias — phải gọi full path %LOCALAPPDATA%\\...\\winget.exe."""
    for b in _existing_bats():
        for i, line in enumerate(_read(b).splitlines(), 1):
            s = line.strip()
            if s.startswith(("REM", "::", "echo")):
                continue
            assert not re.search(r'(?<!["\\])\bwinget\b(?!\.exe")', s) or "%WINGET%" in s \
                or "WINGET=" in s or "winget.exe" in s, \
                f"{b}:{i} gọi winget trần, sẽ fail trên máy tiệm: {s}"


def test_echo_lines_are_ascii():
    """Console Windows dùng cp437 — chữ có dấu in ra sẽ vỡ thành ký tự lạ."""
    for b in _existing_bats():
        for i, line in enumerate(_read(b).splitlines(), 1):
            s = line.strip()
            if not s.lower().startswith("echo"):
                continue
            non_ascii = [c for c in s if ord(c) > 127]
            assert not non_ascii, \
                f"{b}:{i} dòng echo có dấu tiếng Việt {non_ascii}, console sẽ vỡ: {s}"


def test_installer_does_not_overwrite_db():
    src = _read("CAI_DAT_MAY_CHU.bat")
    assert 'if exist "data\\pos.db"' in src, \
        "CAI_DAT_MAY_CHU.bat phải kiểm tra DB tồn tại trước khi tạo mới"
    # init_db chỉ được gọi trong nhánh else (khi CHƯA có DB)
    idx_check = src.find('if exist "data\\pos.db"')
    idx_init = src.find("database.init_db()")
    assert idx_check < idx_init, \
        "init_db() phải nằm SAU kiểm tra DB tồn tại, không thì ghi đè dữ liệu tiệm"


def test_installer_requires_admin():
    src = _read("CAI_DAT_MAY_CHU.bat")
    assert "net session" in src, \
        "CAI_DAT_MAY_CHU.bat phải kiểm tra quyền Administrator (firewall + schtasks)"


def test_update_backs_up_before_pull():
    if not os.path.exists(os.path.join(DEPLOY, "CAP_NHAT.bat")):
        return
    src = _read("CAP_NHAT.bat")
    i_backup = src.lower().find("copy ")
    i_pull = src.find("git pull")
    assert i_backup != -1, "CAP_NHAT.bat không có bước sao lưu DB"
    assert i_pull != -1, "CAP_NHAT.bat không có git pull"
    assert i_backup < i_pull, "Sao lưu PHẢI nằm trước git pull"


def test_update_aborts_on_pull_failure():
    if not os.path.exists(os.path.join(DEPLOY, "CAP_NHAT.bat")):
        return
    src = _read("CAP_NHAT.bat")
    tail = src[src.find("git pull"):]
    assert "errorlevel" in tail, "Pull lỗi mà không kiểm tra errorlevel"


def test_vbs_sets_production_flag():
    """Máy chủ tiệm phải tắt uvicorn reload watcher: tiết kiệm RAM và tránh
    reload giữa lúc git pull đang thay file."""
    with open(os.path.join(DEPLOY, "start_server.vbs"), encoding="utf-8") as f:
        src = f.read()
    assert "POS_PRODUCTION" in src, "start_server.vbs phải set POS_PRODUCTION=1"
    assert ", 0, False" in src, "start_server.vbs phải chạy ẩn cửa sổ (window style 0)"


def test_ping_identifier_matches_everywhere():
    """Đổi tên app ở server mà quên sửa script quét là máy con mất kết nối."""
    with open(os.path.join(ROOT, "server.py"), encoding="utf-8") as f:
        assert '"pos-offline-petcare"' in f.read(), "server.py thiếu identifier ping"
    with open(os.path.join(DEPLOY, "find_server.ps1"), encoding="utf-8") as f:
        assert '"pos-offline-petcare"' in f.read(), \
            "find_server.ps1 dùng identifier khác server.py — máy con sẽ không thấy server"


if __name__ == "__main__":
    test_no_bare_winget();                  print("✓ không gọi winget trần")
    test_echo_lines_are_ascii();            print("✓ dòng echo không dấu")
    test_installer_does_not_overwrite_db(); print("✓ không ghi đè DB khi cài lại")
    test_installer_requires_admin();        print("✓ kiểm tra quyền admin")
    test_update_backs_up_before_pull();     print("✓ backup trước pull")
    test_update_aborts_on_pull_failure();   print("✓ pull lỗi thì dừng")
    test_vbs_sets_production_flag();        print("✓ VBS tắt reload + chạy ẩn")
    test_ping_identifier_matches_everywhere(); print("✓ identifier khớp server/script")
    print("\nALL PASS ✅")

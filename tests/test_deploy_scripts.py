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


def test_tailscale_installers_no_bare_winget():
    """CAI_TAILSCALE.bat (gốc + deploy/) từng gọi winget trần → máy tiệm báo
    'winget is not recognized'. Phải gọi full path và có đường tải MSI dự phòng."""
    paths = [p for p in (os.path.join(ROOT, "CAI_TAILSCALE.bat"), os.path.join(DEPLOY, "CAI_TAILSCALE.bat")) if os.path.exists(p)]
    assert paths, "Phải có ít nhất 1 file CAI_TAILSCALE.bat"
    for path in paths:
        with open(path, encoding="utf-8") as f:
            src = f.read()
        for i, line in enumerate(src.splitlines(), 1):
            s = line.strip()
            if s.startswith(("REM", "::", "echo")):
                continue
            assert not re.search(r'(?<!["\\])\bwinget\b(?!\.exe")', s) or "%WINGET%" in s \
                or "WINGET=" in s or "winget.exe" in s, f"{path}:{i} gọi winget trần: {s}"
        assert "tailscale-setup-latest-amd64.msi" in src, f"{path} thiếu đường tải MSI khi không có winget"


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
    assert "-Verb RunAs" in src, \
        "Phải TỰ xin quyền — người ở tiệm bấm đúp, không biết 'Run as administrator'"


def test_installer_asks_no_questions():
    """Người ở tiệm không biết trả lời câu hỏi kỹ thuật. Bộ cài phải chạy
    thẳng tới hết, chỉ dừng ở `pause` để họ đọc kết quả."""
    import re
    src = _read("CAI_DAT_MAY_CHU.bat")
    for i, line in enumerate(src.splitlines(), 1):
        # `set /p X=<file` là đọc từ file, không phải hỏi người dùng
        if re.search(r"set\s+/p\s+\"?\w+=[^<]", line):
            raise AssertionError(
                f"CAI_DAT_MAY_CHU.bat:{i} hỏi người dùng — họ không biết trả lời"
            )


def test_update_backs_up_before_pull():
    src = _read("CAP_NHAT.bat")
    i_backup = src.find(".backup(")
    i_pull = src.find("pull --ff-only")
    assert i_backup != -1, "CAP_NHAT.bat phải backup bằng sqlite3 backup API (an toàn với WAL)"
    assert i_pull != -1, "CAP_NHAT.bat không có bước pull"
    assert i_backup < i_pull, "Sao lưu PHẢI nằm trước pull"


def test_update_stops_server_before_backup():
    """copy pos.db khi server đang chạy chế độ WAL → bản sao thiếu giao dịch gần nhất."""
    src = _read("CAP_NHAT.bat")
    i_stop = src.find("Stop-Process")
    i_backup = src.find(".backup(")
    assert -1 < i_stop < i_backup, "Phải tắt server TRƯỚC khi backup DB"


def test_update_auto_mode_never_pauses():
    """Chạy từ nút web (/auto) không có ai bấm phím — `pause` trần làm treo vĩnh viễn."""
    src = _read("CAP_NHAT.bat")
    assert '"%~1"=="/auto"' in src, "CAP_NHAT.bat phải nhận tham số /auto"
    for i, line in enumerate(src.splitlines(), 1):
        s = line.strip().lower()
        if s.startswith(("rem", "::", "echo")):
            continue
        assert not re.search(r"(^|&|\()\s*pause\b", s), \
            f"CAP_NHAT.bat:{i} dùng pause trần — đổi thành %PAUSE%: {line.strip()}"


def test_update_rolls_back_on_failure():
    """Bản mới hỏng (init_db lỗi / server không lên) → quay về commit cũ + DB cũ.
    Thiếu cái này, anh cập nhật từ xa mà bản mới crash là mất luôn đường vào."""
    src = _read("CAP_NHAT.bat")
    assert "rev-parse HEAD" in src, "Phải nhớ commit cũ TRƯỚC khi pull"
    assert "reset --hard !OLD!" in src, "Rollback phải về đúng commit cũ"
    rb = src[src.find(":rollback"):]
    assert ":rollback" in src and ".backup(" in rb, "Rollback phải khôi phục DB từ bản backup"
    assert "pos.db-wal" in rb, "Phải xóa pos.db-wal cũ trước khi khôi phục DB"
    i_init = src.find("database.init_db()")
    i_ping = src.find("/api/ping", i_init)
    assert "goto rollback" in src[i_init:i_init + 400], "init_db lỗi phải rollback"
    assert "goto rollback" in src[i_ping:i_ping + 900], "Server không lên phải rollback"
    for r in ("ROLLED_BACK", "ROLLBACK_FAILED", "FAILED_PULL", "NO_CHANGE"):
        assert r in src, f"Thiếu trạng thái {r}"


def test_update_aborts_on_pull_failure():
    if not os.path.exists(os.path.join(DEPLOY, "CAP_NHAT.bat")):
        return
    src = _read("CAP_NHAT.bat")
    tail = src[src.find("pull --ff-only"):]
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


def test_no_timeout_command():
    """`timeout` không dùng được trong script này, hai lý do độc lập:
    - máy có Git Bash trong PATH gọi nhầm bản Unix (cú pháp khác) →
      "timeout: invalid time interval '/t'", không chờ gì cả;
    - timeout.exe của Windows thoát ngay khi stdin bị chuyển hướng →
      "Input redirection is not supported".
    Cả hai đều gặp thật. Thay bằng PowerShell Start-Sleep."""
    import re
    for name in ("CAI_DAT_MAY_CHU.bat", "CAP_NHAT.bat"):
        with open(os.path.join(DEPLOY, name), encoding="utf-8") as f:
            for i, line in enumerate(f, 1):
                if re.search(r"\btimeout(\.exe)?\b", line, re.I) and "/t" in line:
                    raise AssertionError(
                        f"{name}:{i} dùng `timeout` — thay bằng "
                        f"powershell Start-Sleep (xem docstring)"
                    )


def test_git_detected_by_absolute_path():
    """Máy tiệm trắng không có git trong PATH, và PATH của session admin khác
    PATH của user. Dò `git` trần là hỏng — đã gặp đúng lỗi này với python."""
    for name in ("CAI_DAT_MAY_CHU.bat", "CAP_NHAT.bat"):
        with open(os.path.join(DEPLOY, name), encoding="utf-8") as f:
            src = f.read()
        assert "Git\\cmd\\git.exe" in src, \
            f"{name} phải dò git bằng đường dẫn tuyệt đối, không chỉ dựa vào PATH"


def test_update_uses_shop_key():
    """Máy tiệm không có SSH key mặc định. Không chỉ định khoá riêng thì
    git pull báo Permission denied — đã gặp thật khi chạy trên bản clone."""
    with open(os.path.join(DEPLOY, "CAP_NHAT.bat"), encoding="utf-8") as f:
        src = f.read()
    assert "GIT_SSH_COMMAND" in src, "CAP_NHAT.bat phải chỉ định khoá riêng của tiệm"
    assert "KEYPATH:\\=/" in src, \
        "Đường dẫn khoá phải đổi \\ sang / — ssh nuốt dấu backslash trên Windows"


def test_template_bait_file():
    """File mồi mẫu phải an toàn: không chứa token thật, tự xin quyền admin,
    dò git tuyệt đối, lưu token vào deploy/khoa_tiem.txt đã gitignore."""
    path = os.path.join(DEPLOY, "_mau_file_moi.bat")
    assert os.path.exists(path), "_mau_file_moi.bat phải tồn tại"
    with open(path, encoding="utf-8") as f:
        src = f.read()
    assert 'TOKEN=DAN_TOKEN_VAO_DAY' in src, "File mẫu không được chứa token thật"
    assert "Start-Process" in src and "RunAs" in src, "File mồi phải tự xin quyền admin"
    assert "Git\\cmd\\git.exe" in src, "File mồi phải dò git tuyệt đối"
    assert "khoa_tiem.txt" in src, "File mồi phải lưu token vào khoa_tiem.txt"


if __name__ == "__main__":
    test_no_bare_winget();                  print("✓ không gọi winget trần")
    test_echo_lines_are_ascii();            print("✓ dòng echo không dấu")
    test_installer_does_not_overwrite_db(); print("✓ không ghi đè DB khi cài lại")
    test_installer_requires_admin();        print("✓ tự xin quyền admin")
    test_installer_asks_no_questions();     print("✓ không hỏi người dùng câu nào")
    test_update_backs_up_before_pull();     print("✓ backup trước pull")
    test_update_aborts_on_pull_failure();   print("✓ pull lỗi thì dừng")
    test_vbs_sets_production_flag();        print("✓ VBS tắt reload + chạy ẩn")
    test_ping_identifier_matches_everywhere(); print("✓ identifier khớp server/script")
    test_no_timeout_command();              print("✓ không dùng lệnh timeout")
    test_git_detected_by_absolute_path();   print("✓ git dò bằng đường dẫn tuyệt đối")
    test_update_uses_shop_key();            print("✓ cập nhật dùng khoá riêng của tiệm")
    test_template_bait_file();              print("✓ file mồi mẫu đúng chuẩn an toàn")
    print("\nALL PASS ✅")

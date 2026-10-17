"""Cập nhật từ xa: nút web → deploy\\CAP_NHAT.bat /auto chạy tách rời."""
import sys
import pytest
from fastapi.testclient import TestClient
import server
from server import app
from tests.auth_helpers import owner_auth_headers, staff_auth_headers

client = TestClient(app)
pytestmark = pytest.mark.skipif(not sys.platform.startswith("win"), reason="nhánh Windows")


@pytest.fixture(autouse=True)
def clean_overrides():
    saved = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(saved)


@pytest.fixture
def upd_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "UPDATE_DIR", tmp_path)
    return tmp_path


def test_apply_update_spawns_deploy_bat_auto(upd_dir, monkeypatch):
    calls = []
    monkeypatch.setattr(server.subprocess, "Popen", lambda *a, **k: calls.append((a, k)))
    r = client.post("/api/system/apply-update", headers=owner_auth_headers())
    assert r.status_code == 200, r.text
    args = calls[0][0][0]
    assert args[-1] == "/auto"
    assert args[-2].endswith("deploy\\CAP_NHAT.bat"), "Phải gọi bản deploy (có rollback), không phải bản gốc"
    assert calls[0][1]["creationflags"] & server.subprocess.DETACHED_PROCESS, \
        "Phải tách rời — script tắt server, không được chết theo"
    assert (upd_dir / "update.lock").exists()


def test_apply_update_rejects_while_running(upd_dir, monkeypatch):
    monkeypatch.setattr(server.subprocess, "Popen", lambda *a, **k: None)
    (upd_dir / "update.lock").write_text("x")
    r = client.post("/api/system/apply-update", headers=owner_auth_headers())
    assert r.status_code == 409


def test_apply_update_requires_owner(upd_dir, monkeypatch):
    monkeypatch.setattr(server.subprocess, "Popen", lambda *a, **k: pytest.fail("không được chạy"))
    r = client.post("/api/system/apply-update", headers=staff_auth_headers("cashier"))
    assert r.status_code == 403


def test_update_status_reads_result(upd_dir):
    (upd_dir / "update_status.txt").write_text(
        "result=ROLLED_BACK\nmessage=Server ban moi khong khoi dong duoc\nold=aaa\nnew=bbb\nbackup=x.db\nat=20261017_220000\n")
    (upd_dir / "update_20261017_220000.log").write_text("dong 1\n[ROLLBACK] abc\n")
    r = client.get("/api/system/update-status", headers=owner_auth_headers())
    assert r.status_code == 200
    d = r.json()
    assert d["in_progress"] is False
    assert d["last"]["result"] == "ROLLED_BACK"
    assert "[ROLLBACK]" in d["log_tail"]


def test_update_status_empty(upd_dir):
    d = client.get("/api/system/update-status", headers=owner_auth_headers()).json()
    assert d == {"in_progress": False, "last": None, "log_tail": ""}


def test_frontend_polls_update_status():
    src = open("static/js/app.js", encoding="utf-8").read()
    body = src[src.find("async function triggerServerUpdate"):]
    body = body[:body.find("\n        }\n", body.find("catch(err)"))]
    assert "/api/system/update-status" in body, "Phải poll kết quả thay vì reload cứng"
    chk = src[src.find("async function checkServerUpdateStatus"):src.find("async function triggerServerUpdate")]
    assert "btn.classList.remove('hidden');\n\n            try" not in chk, \
        "Nút cập nhật không được luôn hiện"

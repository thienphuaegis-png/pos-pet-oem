import os

def test_project_state_is_compact_and_under_100_lines():
    state_path = "D:/Projects_Hermes/pos-offline-petcare2/PROJECT_STATE.md"
    assert os.path.exists(state_path), "PROJECT_STATE.md must exist as the single source of truth"
    with open(state_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    assert len(lines) < 100, f"PROJECT_STATE.md must be under 100 lines, found {len(lines)}"
    content = "".join(lines)
    assert "## 1. Phiên Hiện Tại" in content
    assert "## 2. Bằng Chứng Kiểm Thử" in content
    assert "## 4. Việc Kế Tiếp" in content

def test_legacy_tracking_removed_and_archived():
    root_tracking = "D:/Projects_Hermes/pos-offline-petcare2/PROJECT_TRACKING.md"
    archive_tracking = "D:/Projects_Hermes/pos-offline-petcare2/docs/archive/LEGACY_TRACKING.md"
    archive_state = "D:/Projects_Hermes/pos-offline-petcare2/docs/archive/STATE_2026_09.md"
    
    assert not os.path.exists(root_tracking), "PROJECT_TRACKING.md must be removed from project root"
    assert os.path.exists(archive_tracking), "LEGACY_TRACKING.md must be present in docs/archive"
    assert os.path.exists(archive_state), "STATE_2026_09.md must be present in docs/archive"

def test_project_map_has_tree_and_nav():
    map_path = "D:/Projects_Hermes/pos-offline-petcare2/PROJECT_MAP.html"
    assert os.path.exists(map_path), "PROJECT_MAP.html must exist"
    with open(map_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    assert 'id="view-tasks"' in content, "Must have view-tasks container"
    assert 'id="view-tree"' in content, "Must have view-tree container"
    assert 'switchMainView' in content, "Must have switchMainView JS helper"
    assert ('v2.9-2026-09-27' in content or 'v2.8-2026-09-27' in content), "Must bump ROADMAP_VERSION"
    assert 'routers/' in content and 'pos.py' in content, "Must document routers in project tree"

def test_coding_standards_skill_has_checkpoint_protocol():
    skill_path = r"C:\Users\thien\AppData\Local\hermes\skills\software-development\coding-standards\SKILL.md"
    assert os.path.exists(skill_path), "coding-standards SKILL.md must exist"
    with open(skill_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "CHECKPOINT PROTOCOL" in content, "coding-standards must define CHECKPOINT PROTOCOL"
    assert "PROJECT_STATE.md" in content
    assert "PROJECT_MAP.html" in content

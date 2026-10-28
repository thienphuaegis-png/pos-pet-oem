import os

def test_project_state_is_compact_and_under_100_lines():
    state_path = "D:/Projects_Hermes/pos-offline-petcare2/.ai/STATE.md"
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
    archive_tracking = "D:/Projects_Hermes/pos-offline-petcare2/.ai/checkpoints/archive/LEGACY_TRACKING.md"
    archive_state = "D:/Projects_Hermes/pos-offline-petcare2/.ai/checkpoints/archive/STATE_2026_09.md"
    
    assert not os.path.exists(root_tracking), "PROJECT_TRACKING.md must be removed from project root"
    assert os.path.exists(archive_tracking), "LEGACY_TRACKING.md must be present in .ai/checkpoints/archive"
    assert os.path.exists(archive_state), "STATE_2026_09.md must be present in .ai/checkpoints/archive"

def test_project_map_has_tree_and_nav():
    map_path = "D:/Projects_Hermes/pos-offline-petcare2/.ai/MAP.html"
    assert os.path.exists(map_path), "PROJECT_MAP.html must exist"
    with open(map_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    assert 'id="view-tasks"' in content, "Must have view-tasks container"
    assert 'id="view-tree"' in content, "Must have view-tree container"
    assert 'switchMainView' in content, "Must have switchMainView JS helper"
    import re
    assert re.search(r'v\d+\.\d+-\d{4}-\d{2}-\d{2}', content), "Must have valid ROADMAP_VERSION (e.g. v3.0-2026-09-30)"
    assert 'routers/' in content and 'pos.py' in content, "Must document routers in project tree"

def test_coding_standards_skill_has_checkpoint_protocol():
    skill_path = r"C:\Users\thien\AppData\Local\hermes\skills\software-development\coding-standards\SKILL.md"
    assert os.path.exists(skill_path), "coding-standards SKILL.md must exist"
    with open(skill_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "CHECKPOINT PROTOCOL" in content, "coding-standards must define CHECKPOINT PROTOCOL"
    assert ".ai/STATE.md" in content
    assert ".ai/MAP.html" in content

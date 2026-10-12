import pytest
from pathlib import Path
from version_helper import get_app_version_info, get_git_commits_ahead, get_git_total_commits
from scripts.bump_version import parse_semver, bump, detect_level_from_git


def test_semver_parse_and_bump():
    prefix, parts = parse_semver("v3.6.0")
    assert prefix == "v"
    assert parts == [3, 6, 0]

    assert bump([3, 6, 0], "patch") == [3, 6, 1]
    assert bump([3, 6, 0], "minor") == [3, 7, 0]
    assert bump([3, 6, 0], "major") == [4, 0, 0]


def test_git_commits_ahead_calculation():
    # HEAD so với HEAD phải là 0 commits ahead
    info = get_app_version_info()
    assert "commits_ahead" in info
    assert "build_number" in info
    assert info["build_number"] > 0
    # Commit hash HEAD hiện tại không được âm
    assert info["commits_ahead"] >= 0


def test_dynamic_version_increments_when_ahead(monkeypatch):
    # Giả lập base_commit bị lùi lại 3 commits
    monkeypatch.setattr("version_helper.get_git_commits_ahead", lambda base: 3)
    info = get_app_version_info()
    assert info["commits_ahead"] == 3
    # Phải tự động tăng thêm 3 vào số patch của version.json (v3.6.1 + 3 = v3.6.4)
    assert info["version"] == "v3.6.4"

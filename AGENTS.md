# AI Agent Onboarding Protocol (READ FIRST)

Before scanning files, answering questions about this codebase, or modifying code, **every AI agent MUST read these files in order**:

1. **`.ai/STATE.md`** — Hot-state handoff (<100 lines): latest commit, current session changes, test verification, and next tasks.
2. **`.ai/checkpoints/PROJECT_STATE.json`** — Compact 6-layer architecture snapshot (~1.5k tokens), core file map, guided tour, and local `codegraph` AST commands (`codegraph callers/callees/impact <symbol>`). **Do NOT blindly read all repository files.**
3. **`.ai/MAP.html` & `.ai/DATAFLOW.html`** — Interactive feature checklist (`DEFAULT_TASKS` + `ROADMAP_VERSION`) and system dataflow map.

## Mandatory Repo Hygiene Rules
- **AI workspace isolation**: Store ALL plans, specs, mockups, and checkpoints strictly inside `.ai/` (`plans/`, `specs/`, `sketches/`, `checkpoints/`). Never drop AI markdown/HTML files in repo root or `docs/`.
- **Secrets & DB safety**: Never read/print/commit `.env`, `.cf_auth.json`, `deploy/khoa_tiem*`, `data/*.db`, or `logs/*`. Local `data/pos.db` on dev machines is a dev copy, not live store data.
- **Log-first debugging**: Check `logs/client.log` and `logs/pos_server.log` before guessing UI/API bugs.
- **Checkpoint sync after changes**: Update `.ai/STATE.md` + `.ai/MAP.html`, run `.venv/Scripts/python.exe scripts/generate_checkpoint.py`, and verify with `.venv/Scripts/python.exe -m pytest -q tests/test_checkpoint_integrity.py tests/test_git_hygiene.py`.

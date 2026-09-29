# Supabase & Vercel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans or inline execution.

**Goal:** Migrate POS system to run on Supabase PostgreSQL and Vercel Serverless without altering route handlers.

**Architecture:** Create a drop-in database adapter in `database.py` that emulates sqlite3 API using psycopg2/PostgreSQL. Adjust `server.py` for read-only filesystem environments, export/import 53 tables and data to Supabase, and configure Vercel routing.

**Tech Stack:** FastAPI, Supabase (PostgreSQL 17.6), psycopg2-binary, Vercel Serverless (Python).

---

### Task 1: Migrate Schema & Seed Data to Supabase
**Files:**
- Modify/Run: `scripts/migrate_to_supabase.py`
- Target: Supabase Project `ifhlvbplslznumfpeojy`

- [ ] **Step 1:** Enhance migration script with batch inserts and sequence reset.
- [ ] **Step 2:** Run migration script against Supabase pooler.
- [ ] **Step 3:** Verify table counts and row counts on Supabase match SQLite.

---

### Task 2: Build Database Adapter in `database.py`
**Files:**
- Modify: `database.py`
- Test: `tests/test_pg_adapter.py`

- [ ] **Step 1:** Write unit test testing `?` placeholder replacement, `lastrowid`, and row index/name access.
- [ ] **Step 2:** Implement `RowWrapper`, `PGCursorWrapper`, and `PGConnectionWrapper`.
- [ ] **Step 3:** Switch `get_db()` to PostgreSQL when `DATABASE_URL` is set, fallback to SQLite when not set.
- [ ] **Step 4:** Run tests to verify compatibility.

---

### Task 3: Adjust `server.py` and Configure `vercel.json`
**Files:**
- Modify: `server.py`
- Create: `vercel.json`
- Modify: `requirements.txt`

- [ ] **Step 1:** Make `server.py` logging conditional (stdout in cloud, file in local).
- [ ] **Step 2:** Ensure static files mount properly under serverless lambda environment.
- [ ] **Step 3:** Create `vercel.json` with builds and routes.
- [ ] **Step 4:** Add `psycopg2-binary` to `requirements.txt`.

---

### Task 4: Local End-to-End Verification & Push
**Files:**
- Test: `tests/test_e2e_supabase.py`

- [ ] **Step 1:** Run local server against Supabase database.
- [ ] **Step 2:** Test API endpoints (contacts, products, spa tickets).
- [ ] **Step 3:** Commit and push to `cloud-supabase` branch on GitHub.

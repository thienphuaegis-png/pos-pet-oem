def test_init_db_survives_cashbook_sync_failure(monkeypatch):
    import scripts.migrate_cashbook_sync as m

    def boom(conn):
        raise RuntimeError("sync lỗi giả lập")

    monkeypatch.setattr(m, "sync_missing_cashbook_entries", boom)
    from database import init_db
    init_db()

def test_pytest_does_not_start_telegram_poller():
    import server  # noqa: F401
    from services import telegram_bot
    assert telegram_bot._polling_thread is None

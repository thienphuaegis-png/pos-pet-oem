import logging


def test_httpx_request_logs_suppressed():
    import server  # noqa: F401
    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING

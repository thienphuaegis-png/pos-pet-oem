def test_server_has_datetime_for_linux_update_path():
    import datetime
    import server
    assert server.datetime is datetime

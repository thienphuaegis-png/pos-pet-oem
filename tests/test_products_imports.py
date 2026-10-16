def test_products_router_has_datetime():
    import datetime
    import routers.products as rp
    assert rp.datetime is datetime

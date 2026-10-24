import pytest
from scripts.import_hrm_from_sheets import clean_currency, parse_vn_date


def test_clean_currency():
    assert clean_currency("7.000.000 đ") == 7000000.0
    assert clean_currency("-500.000 đ") == -500000.0
    assert clean_currency("1,200,000") == 1200000.0
    assert clean_currency("800000") == 800000.0
    assert clean_currency("") == 0.0
    assert clean_currency(None) == 0.0


def test_parse_vn_date():
    assert parse_vn_date("15/04/1997") == "1997-04-15"
    assert parse_vn_date("02/05/2025") == "2025-05-02"
    assert parse_vn_date("2026-10-24") == "2026-10-24"
    assert parse_vn_date("") is None
    assert parse_vn_date(None) is None

"""NV miễn chấm công, khối TTS 1 ca (ngưỡng công theo độ dài ca), nghỉ có bù."""
from datetime import date

from services.payroll_engine import Block, Rules, DayInput, classify_day, parse_punches

VP = Block("Văn Phòng", start=480, end=1050, lunch=90, std_hours=8.0, off_sunday=True, monthly_off_days=0, split=720)
TTS_SANG = Block("TTS Ca Sáng", start=480, end=720, lunch=0, std_hours=4.0, off_sunday=True, monthly_off_days=0, split=600)
TTS_CHIEU = Block("TTS Ca Chiều", start=810, end=1050, lunch=0, std_hours=4.0, off_sunday=True, monthly_off_days=0, split=930)
R = Rules()
TUE, SUN = date(2026, 11, 3), date(2026, 11, 1)


def day(b, d, punches=(), **kw):
    return classify_day(DayInput(work_date=d, punches=parse_punches(punches), **kw), b, R)


def test_exempt_no_punch_full_credit_no_penalty():
    r = day(VP, TUE, exempt=True)
    assert (r.code, r.credit, r.penalty, r.violations) == ("X", 1.0, 0, [])


def test_exempt_respects_leave_sunday_probation():
    assert day(VP, TUE, exempt=True, leave="off").credit == 0.0
    assert day(VP, TUE, exempt=True, leave="off_morning").credit == 0.5
    assert day(VP, SUN, exempt=True).code == "CN"
    assert day(VP, TUE, exempt=True, probation=True).code == "TV"


def test_tts_one_shift_full_credit_no_late():
    m = day(TTS_SANG, TUE, ["08:00", "12:00"])
    a = day(TTS_CHIEU, TUE, ["13:30", "17:30"])
    assert (m.credit, m.penalty) == (1.0, 0)
    assert (a.credit, a.penalty, a.late_min) == (1.0, 0, 0)
    assert day(TTS_SANG, TUE, ["08:00", "10:00"]).credit == 0.5


def test_office_block_thresholds_unchanged():
    assert day(VP, TUE, ["08:00", "12:00"]).credit == 0.5   # TTS 2 ca làm 1 buổi vẫn 0.5
    assert day(VP, TUE, ["08:00", "17:30"]).credit == 1.0


def test_make_up_day():
    assert (day(VP, TUE, leave="off").credit, day(VP, TUE, leave="off").penalty) == (0.0, 0)
    assert day(VP, SUN, ["08:00", "17:30"]).credit == 1.0   # làm bù CN có quẹt = 1 công

"""apply_tier_by_points: không nhảy ngang giữa các nhóm cùng ngưỡng điểm (bug GOLD/LE -> LAZADA mỗi lần mua)."""
import sqlite3
from services.loyalty import apply_tier_by_points


def _db():
    m = sqlite3.connect(":memory:")
    m.row_factory = sqlite3.Row
    m.executescript("""
        CREATE TABLE customer_segments(id INTEGER PRIMARY KEY, name, min_points, allow_points, priority, is_active);
        CREATE TABLE contacts(id INTEGER PRIMARY KEY, segment_id, points);
        INSERT INTO customer_segments VALUES (1,'LE',0,1,1,1),(6,'GOLD',0,1,10,1),(15,'LAZADA',0,1,20,1),(20,'Bac',50,1,5,1),(21,'Vang',100,1,5,1);
        INSERT INTO contacts VALUES (1,6,0);
    """)
    return m.cursor()


def _seg(cur):
    return cur.execute("SELECT segment_id FROM contacts WHERE id=1").fetchone()[0]


def test_same_threshold_groups_never_swap():
    cur = _db()
    assert apply_tier_by_points(cur, 1, 30) is None
    assert _seg(cur) == 6


def test_upgrade_then_downgrade_ladder():
    cur = _db()
    assert apply_tier_by_points(cur, 1, 640) == "Vang"
    assert apply_tier_by_points(cur, 1, 60) is None and _seg(cur) == 20

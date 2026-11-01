"""Xét hạng thành viên theo điểm: chỉ đi theo bậc thang min_points, không nhảy ngang giữa các nhóm cùng ngưỡng."""


def apply_tier_by_points(cur, contact_id, points):
    """Lên hạng nếu ngưỡng mới > ngưỡng hạng hiện tại; xuống hạng nếu điểm < ngưỡng hạng hiện tại.
    Nhóm cùng min_points (vd LE/GOLD/LAZADA đều 0) không bao giờ bị đổi qua lại.
    Trả về tên hạng mới khi LÊN hạng, ngược lại None."""
    cur.execute("""
        SELECT c.segment_id, COALESCE(cs.min_points, 0) AS cur_min
        FROM contacts c LEFT JOIN customer_segments cs ON cs.id = c.segment_id
        WHERE c.id = ?
    """, (contact_id,))
    row = cur.fetchone()
    if not row:
        return None
    cur.execute("""
        SELECT id, name, min_points FROM customer_segments
        WHERE is_active = 1 AND allow_points = 1 AND min_points <= ?
        ORDER BY min_points DESC, priority DESC, id DESC LIMIT 1
    """, (points,))
    target = cur.fetchone()
    if not target or target["id"] == row["segment_id"]:
        return None
    if target["min_points"] > row["cur_min"]:
        cur.execute("UPDATE contacts SET segment_id = ? WHERE id = ?", (target["id"], contact_id))
        return target["name"]
    if row["cur_min"] > points:
        # ponytail: hạ về nhóm xếp hạng cao nhất <= điểm (như cũ); muốn về đúng nhóm trước khi lên hạng thì cần lưu lịch sử hạng
        cur.execute("UPDATE contacts SET segment_id = ? WHERE id = ?", (target["id"], contact_id))
    return None

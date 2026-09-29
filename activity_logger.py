"""Ghi log hoat dong tung account vao bang activity_log.

Middleware khong dung duoc Depends(get_current_user) nen tu giai ma JWT tu header.
Mo ta hanh dong (action) duoc suy tu method + path (VD: POST /api/orders -> "Tao don hang"),
neu path khong khop pattern nao thi dung mo ta chung "METHOD /path".
"""
import re
import jwt as pyjwt

from dependencies import SECRET, ALGO
from database import get_db

# Danh sach mau -> mo ta nghiep vu de doc. Kiem tra theo thu tu, khop dau tien duoc dung.
ACTION_PATTERNS = [
    (r"^POST /api/auth/login$", "Đăng nhập"),
    (r"^POST /api/orders$", "Tạo đơn hàng"),
    (r"^(PUT|DELETE) /api/orders/", "Sửa/xóa đơn hàng"),
    (r"^POST /api/staff$", "Thêm nhân viên"),
    (r"^(PUT|DELETE) /api/staff/", "Sửa/khóa nhân viên"),
    (r"^POST /api/contacts$", "Thêm khách hàng/NCC"),
    (r"^(PUT|DELETE) /api/contacts/", "Sửa/xóa khách hàng/NCC"),
    (r"^POST /api/cashbook", "Ghi phiếu thu/chi"),
    (r"^POST /api/shifts/open$", "Mở ca làm việc"),
    (r"^POST /api/shifts/\d+/close$", "Đóng ca làm việc"),
    (r"^POST /api/pos/orders", "Tạo đơn hàng POS"),
    (r"^POST /api/pos/draft", "Lưu nháp đơn hàng POS"),
    (r"^DELETE /api/pos/draft", "Xóa nháp đơn hàng POS"),
    (r"^POST /api/shifts/open", "Mở ca làm việc"),
    (r"^POST /api/shifts/close", "Đóng ca làm việc"),
    (r"^POST /api/shifts/\d+/verify", "Duyệt lệch ca làm việc"),
    (r"^POST /api/cashbook/transactions", "Lập phiếu thu/chi"),
    (r"^POST /api/purchases", "Tạo phiếu nhập hàng"),
    (r"^(POST|PUT) /api/products", "Thêm/sửa hàng hóa"),
    (r"^DELETE /api/products", "Xóa hàng hóa"),
    (r"^POST /api/settings/permissions", "Đổi phân quyền theo vai trò"),
    (r"^POST /api/settings/staff-permissions", "Đổi quyền riêng nhân viên"),
    (r"^POST /api/settings/modules", "Bật/tắt module hệ thống"),
    (r"^POST /api/settings/reset", "Reset dữ liệu hệ thống"),
    (r"^POST /api/hotel/rooms/\d+/checkin", "Check-in phòng Hotel"),
    (r"^POST /api/hotel/bookings/\d+/checkout", "Check-out phòng Hotel"),
    (r"^POST /api/hotel/book-spa-for-guest/\d+", "Đặt Spa cho khách Hotel"),
    (r"^POST /api/hotel/.*", "Thao tác Khách sạn Hotel"),
    (r"^POST /api/pet-services/tickets", "Tạo phiếu Spa dịch vụ"),
    (r"^PUT /api/pet-services/tickets/\d+/status", "Cập nhật tiến độ Spa"),
    (r"^POST /api/oem/.*", "Thao tác Gia công OEM"),
    (r"^POST /api/price-lists/.*", "Thao tác Bảng giá"),
]


def _describe(method: str, path: str) -> str:
    key = f"{method} {path}"
    for pattern, desc in ACTION_PATTERNS:
        if re.match(pattern, key):
            return desc
    return key


def log_activity_from_request(request, response):
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return  # request khong dang nhap (vd login that bai) - khong log duoc ai lam
    token = auth[7:]
    try:
        payload = pyjwt.decode(token, SECRET, algorithms=[ALGO])
    except Exception:
        return
    staff_id = payload.get("sub")
    if not staff_id:
        return

    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT name, role FROM staff WHERE id=?", (staff_id,))
    row = cur.fetchone()
    staff_name = row["name"] if row else None
    role = row["role"] if row else None

    action = _describe(request.method, request.url.path)
    ip = request.client.host if request.client else None
    cur.execute(
        "INSERT INTO activity_log (staff_id, staff_name, role, action, method, path, ip) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (staff_id, staff_name, role, action, request.method, request.url.path, ip)
    )
    db.commit()
    db.close()


def cleanup_old_logs():
    """Xoa log qua 90 ngay. Goi dinh ky tu backup_service hoac 1 lan luc khoi dong."""
    db = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM activity_log WHERE created_at < datetime('now', '-90 days')")
    db.commit()
    db.close()

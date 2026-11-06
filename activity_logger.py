"""Ghi log hoat dong tung account vao bang activity_log.

Middleware khong dung duoc Depends(get_current_user) nen tu giai ma JWT tu header.
Mo ta hanh dong (action) duoc suy tu method + path (VD: POST /api/orders -> "Tao don hang"),
neu path khong khop pattern nao thi dung mo ta chung "METHOD /path".
"""
import re
import queue
import threading
import jwt as pyjwt

from dependencies import SECRET, ALGO
from database import get_db

_LOG_QUEUE = queue.Queue(maxsize=2000)

def _log_worker():
    while True:
        try:
            item = _LOG_QUEUE.get()
            if item is None:
                break
            staff_id, action, method, path, ip = item
            db = get_db()
            cur = db.cursor()
            cur.execute("SELECT name, role FROM staff WHERE id=?", (staff_id,))
            row = cur.fetchone()
            staff_name = row["name"] if row else None
            role = row["role"] if row else None
            cur.execute(
                "INSERT INTO activity_log (staff_id, staff_name, role, action, method, path, ip) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (staff_id, staff_name, role, action, method, path, ip)
            )
            db.commit()
            db.close()
        except Exception:
            pass
        finally:
            _LOG_QUEUE.task_done()

_worker_thread = threading.Thread(target=_log_worker, daemon=True, name="ActivityLoggerWorker")
_worker_thread.start()

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
    (r"^POST /api/pet-services(/batch)?$", "Tạo phiếu Spa dịch vụ"),
    (r"^PUT /api/pet-services/tickets/bulk-update$", "Cập nhật hàng loạt phiếu Spa"),
    (r"^PUT /api/pet-services/\d+/(status|progress)$", "Cập nhật tiến độ Spa"),
    (r"^PUT /api/pet-services/\d+/call-status$", "Cập nhật gọi khách Spa"),
    (r"^POST /api/pet-services/\d+/pay$", "Thanh toán phiếu Spa"),
    (r"^DELETE /api/pet-services/\d+$", "Xóa phiếu Spa"),
    (r"^(POST|PUT|DELETE) /api/pet-services/", "Cài đặt dịch vụ Spa"),
    (r"^(POST|PUT|DELETE) /api/hrm/config/", "Sửa cấu hình chấm công/lương"),
    (r"^(POST|PUT|DELETE) /api/hrm/commissions/", "Sửa chính sách hoa hồng"),
    (r"^(POST|PUT|DELETE) /api/hrm/payroll/", "Tính/chốt/trả lương"),
    (r"^(POST|PUT|DELETE) /api/hrm/", "Thao tác Nhân sự (HRM)"),
    (r"^POST /api/oem/.*", "Thao tác Gia công OEM"),
    (r"^(POST|PUT|DELETE) /api/price-lists", "Thao tác Bảng giá"),
    (r"^POST /api/suppliers/\d+/assign-items$", "Gán mặt hàng cho nhà cung cấp"),
    (r"^POST /api/marketplace/koc/inspect-(sheet|columns)$", "Kiểm tra cấu trúc Google Sheet KOC"),
    (r"^POST /api/marketplace/koc/sources/\d+/sync$", "Đồng bộ chiến dịch KOC từ Sheet"),
    (r"^POST /api/marketplace/koc/sources/\d+/refresh-views$", "Quét lượt xem video TikTok KOC"),
    (r"^POST /api/marketplace/koc/sources$", "Lưu chiến dịch Google Sheet KOC"),
    (r"^DELETE /api/marketplace/koc/sources/\d+$", "Xóa chiến dịch KOC"),
    (r"^POST /api/marketplace/koc/videos/bulk-kpi$", "Duyệt KPI video KOC hàng loạt"),
    (r"^POST /api/marketplace/koc/videos$", "Dán thêm link video KOC"),
    (r"^PUT /api/marketplace/koc/videos/\d+$", "Cập nhật lượt xem / KPI video KOC"),
    (r"^DELETE /api/marketplace/koc/videos/\d+$", "Xóa link video KOC"),
    (r"^PUT /api/marketplace/koc/rules$", "Cập nhật công thức hoa hồng KOC"),
    (r"^(POST|PUT|DELETE) /api/marketplace/", "Thao tác Sàn TMĐT"),
]


def _describe(method: str, path: str) -> str:
    key = f"{method} {path}"
    for pattern, desc in ACTION_PATTERNS:
        if re.match(pattern, key):
            return desc
    return key


# Các đường dẫn tần suất cao không ghi vào bảng activity_log để tránh đốt hạn mức DB (đặc biệt trên Cloud D1)
# + các POST chỉ tính toán/xem trước, không đổi dữ liệu
_IGNORED_ACTIVITY_PATHS = {
    "/api/client-log", "/api/pos/draft",
    "/api/pricing/calculate", "/api/pricing/calculate-spa", "/api/oem/calculate-bom-stock",
    "/api/marketplace/koc/inspect-sheet", "/api/marketplace/koc/inspect-columns",
}


def log_activity_from_request(request, response):
    if request.url.path in _IGNORED_ACTIVITY_PATHS:
        return
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

    action = _describe(request.method, request.url.path)
    ip = request.client.host if request.client else None
    try:
        _LOG_QUEUE.put_nowait((staff_id, action, request.method, request.url.path, ip))
    except queue.Full:
        pass


def cleanup_old_logs():
    """Xoa log qua 90 ngay. Goi dinh ky tu backup_service hoac 1 lan luc khoi dong."""
    db = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM activity_log WHERE created_at < datetime('now', '-90 days')")
    db.commit()
    db.close()

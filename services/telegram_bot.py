import json
import logging
import sqlite3
import threading
import time
from datetime import datetime, date
from typing import Optional
import httpx
from database import get_db

logger = logging.getLogger("telegram_bot")

_polling_thread: Optional[threading.Thread] = None
_stop_event = threading.Event()

def send_telegram_api(token: str, method: str, payload: dict) -> dict:
    url = f"https://api.telegram.org/bot{token}/{method}"
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(url, json=payload)
            return resp.json()
    except Exception as e:
        logger.error(f"Telegram API {method} error: {e}")
        return {"ok": False, "description": str(e)}

def notify_user(chat_id: int, text: str, reply_markup: Optional[dict] = None):
    token = get_telegram_setting("telegram_bot_token")
    if not token:
        return
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown"
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    send_telegram_api(token, "sendMessage", payload)


def get_telegram_setting(key: str, default: str = "") -> str:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cur.fetchone()
    conn.close()
    return row["value"] if row else default

def set_telegram_setting(key: str, value: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
    conn.commit()
    conn.close()

def is_admin(chat_id: int) -> bool:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM telegram_admins WHERE chat_id = ? AND is_active = 1", (chat_id,))
    row = cur.fetchone()
    conn.close()
    return row is not None

def register_admin_request(chat_id: int, username: str = "", first_name: str = "") -> dict:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM telegram_admins WHERE chat_id = ? AND is_active = 1", (chat_id,))
    if cur.fetchone():
        conn.close()
        return {"status": "already_admin", "message": "Anh đã là Admin hệ thống rồi ạ."}

    cur.execute("SELECT status FROM telegram_admin_requests WHERE chat_id = ?", (chat_id,))
    req = cur.fetchone()
    if req and req["status"] == "pending":
        conn.close()
        return {"status": "pending", "message": f"Yêu cầu của anh (ID: {chat_id}) đang chờ duyệt trên Web POS."}

    cur.execute("""
    INSERT OR REPLACE INTO telegram_admin_requests (chat_id, username, first_name, status, created_at)
    VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    """, (chat_id, username or "", first_name or ""))
    conn.commit()
    conn.close()
    return {
        "status": "success",
        "message": f"Đã gửi yêu cầu đăng ký Admin (Chat ID: {chat_id}). Vui lòng vào màn hình Cài đặt POS để bấm [Duyệt]."
    }

def approve_admin_request(chat_id: int, approved_by: str = "Web POS", username: str = "", first_name: str = "") -> bool:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM telegram_admin_requests WHERE chat_id = ?", (chat_id,))
    req = cur.fetchone()
    u_name = req["username"] if req else username
    f_name = req["first_name"] if req else first_name

    cur.execute("""
    INSERT OR REPLACE INTO telegram_admins (chat_id, username, first_name, role, approved_by, approved_at, is_active)
    VALUES (?, ?, ?, 'admin', ?, CURRENT_TIMESTAMP, 1)
    """, (chat_id, u_name or "", f_name or "", approved_by))

    if req:
        cur.execute("UPDATE telegram_admin_requests SET status = 'approved' WHERE chat_id = ?", (chat_id,))
    conn.commit()
    conn.close()

    try:
        notify_user(
            chat_id,
            "🎉 *Chúc mừng!* Yêu cầu quyền Admin POS của anh đã được phê duyệt thành công.\n\nGõ `/start` hoặc `/baocao` để bắt đầu điều khiển từ xa!"
        )
    except Exception:
        pass
    return True

def reject_admin_request(chat_id: int) -> bool:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE telegram_admin_requests SET status = 'rejected' WHERE chat_id = ?", (chat_id,))
    cur.execute("UPDATE telegram_admins SET is_active = 0 WHERE chat_id = ?", (chat_id,))
    conn.commit()
    conn.close()
    return True

def query_out_of_stock() -> list:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
    SELECT id, code, name, stock, unit, cost_price, category
    FROM products
    WHERE is_active = 1 AND type != 'service' AND stock <= 0
    ORDER BY stock ASC, name ASC
    LIMIT 30
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def query_product_price(keyword: str) -> list:
    conn = get_db()
    cur = conn.cursor()
    kw = f"%{keyword.strip()}%"
    cur.execute("""
    SELECT id, code, name, sell_price, stock, unit, category
    FROM products
    WHERE is_active = 1 AND (name LIKE ? OR code LIKE ?)
    ORDER BY name ASC
    LIMIT 15
    """, (kw, kw))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def query_categories() -> list:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT category FROM products WHERE is_active = 1 AND category IS NOT NULL AND category != '' ORDER BY category ASC")
    rows = [r["category"] for r in cur.fetchall()]
    conn.close()
    return rows

def query_quick_report(period: str = "homnay") -> dict:
    conn = get_db()
    cur = conn.cursor()
    today_str = date.today().isoformat()

    if period == "homnay":
        date_filter = "DATE(created_at) = DATE('now', 'localtime')"
        title = f"Hôm nay ({today_str})"
    elif period == "homqua":
        date_filter = "DATE(created_at) = DATE('now', 'localtime', '-1 day')"
        title = "Hôm qua"
    elif period == "thangnay":
        date_filter = "strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')"
        title = "Tháng này"
    else:
        date_filter = "DATE(created_at) = DATE('now', 'localtime')"
        title = f"Hôm nay ({today_str})"

    cur.execute(f"""
    SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(final_amount), 0) as total_revenue,
        COALESCE(SUM(paid_amount), 0) as total_paid,
        COALESCE(SUM(debt_amount), 0) as total_debt
    FROM orders
    WHERE {date_filter}
    """)
    summary = dict(cur.fetchone())

    # Chi tiết thanh toán qua cashbook
    cur.execute(f"""
    SELECT 
        COALESCE(pa.name, 'Tiền mặt') as method_name,
        COALESCE(SUM(cb.amount), 0) as amount
    FROM cashbook cb
    LEFT JOIN payment_accounts pa ON cb.account_id = pa.id
    WHERE cb.type = 'in' AND cb.ref_type = 'order' AND {date_filter.replace('created_at', 'cb.created_at')}
    GROUP BY pa.id, pa.name
    """)
    payments = [dict(r) for r in cur.fetchall()]

    conn.close()
    return {
        "period": period,
        "title": title,
        "summary": summary,
        "payments": payments
    }

def get_order_details(order_code: str) -> dict:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
    SELECT o.*, c.name as customer_name, c.phone as customer_phone
    FROM orders o
    LEFT JOIN contacts c ON o.customer_id = c.id
    WHERE o.code = ?
    """, (order_code.strip(),))
    order = cur.fetchone()
    if not order:
        conn.close()
        return {}

    order_dict = dict(order)
    cur.execute("""
    SELECT oi.*, p.name as product_name
    FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
    """, (order_dict["id"],))
    order_dict["items"] = [dict(r) for r in cur.fetchall()]

    # Lay thông tin thanh toán hiện tại
    cur.execute("""
    SELECT cb.account_id, pa.name as account_name
    FROM cashbook cb
    LEFT JOIN payment_accounts pa ON cb.account_id = pa.id
    WHERE cb.ref_type = 'order' AND cb.ref_id = ?
    LIMIT 1
    """, (order_dict["id"],))
    cb = cur.fetchone()
    order_dict["current_payment"] = cb["account_name"] if cb and cb["account_name"] else "Tiền mặt"
    order_dict["current_account_id"] = cb["account_id"] if cb else None

    conn.close()
    return order_dict

def execute_cancel_order(order_code: str) -> dict:
    """Hủy đơn hàng: hoàn tồn kho sản phẩm, hoàn BOM, điều chỉnh nợ, xóa phiếu thu cashbook, xóa đơn."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM orders WHERE code = ?", (order_code.strip(),))
        order = cur.fetchone()
        if not order:
            conn.close()
            return {"success": False, "message": f"Không tìm thấy đơn hàng {order_code}."}

        order_id = order["id"]
        customer_id = order["customer_id"]
        debt_amount = order["debt_amount"] or 0

        cur.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,))
        items = cur.fetchall()
        warehouse_id = 1

        for item in items:
            prod_id = item["product_id"]
            unit_ratio = float(item["unit_ratio"] or 1) if "unit_ratio" in item.keys() else 1.0
            qty = item["quantity"] * unit_ratio

            cur.execute("UPDATE products SET stock = stock + ? WHERE id = ? AND type != 'service'", (qty, prod_id))
            cur.execute("""
            UPDATE product_inventory 
            SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
            WHERE warehouse_id = ? AND product_id = ?
            """, (qty, warehouse_id, prod_id))

            # Hoàn BOM
            cur.execute("""
            SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
            FROM product_bom b
            JOIN ingredients i ON b.ingredient_id = i.id
            WHERE b.product_id = ?
            """, (prod_id,))
            for bom in cur.fetchall():
                if bom["ingredient_type"] == 'SERVICE':
                    continue
                total_consumed = bom["quantity"] * qty
                cur.execute("""
                UPDATE inventory 
                SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                WHERE warehouse_id = ? AND ingredient_id = ?
                """, (total_consumed, warehouse_id, bom["ingredient_id"]))

        cur.execute("DELETE FROM inventory_logs WHERE order_id = ? OR order_code = ?", (order_id, order_code))

        # Điều chỉnh công nợ khách
        if customer_id and debt_amount > 0:
            cur.execute("UPDATE contacts SET debt = MAX(0, debt - ?) WHERE id = ?", (debt_amount, customer_id))

        # Xóa phiếu thu sổ quỹ
        cur.execute("DELETE FROM cashbook WHERE ref_type = 'order' AND ref_id = ?", (order_id,))

        # Xóa chi tiết và đơn
        cur.execute("DELETE FROM order_items WHERE order_id = ?", (order_id,))
        cur.execute("DELETE FROM orders WHERE id = ?", (order_id,))

        conn.commit()
        conn.close()
        return {"success": True, "message": f"Đã hủy thành công đơn hàng {order_code} và hoàn trả kho."}
    except Exception as e:
        conn.rollback()
        conn.close()
        return {"success": False, "message": f"Lỗi khi hủy đơn: {str(e)}"}

def get_available_payment_accounts() -> list:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, name, account_type FROM payment_accounts WHERE is_active = 1 ORDER BY is_default DESC, id ASC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def execute_change_payment(order_code: str, new_account_id: int) -> dict:
    """Thay đổi hình thức thanh toán của đơn hàng (cập nhật cashbook sang account_id mới)."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM orders WHERE code = ?", (order_code.strip(),))
        order = cur.fetchone()
        if not order:
            conn.close()
            return {"success": False, "message": f"Không tìm thấy đơn hàng {order_code}."}

        order_id = order["id"]

        cur.execute("SELECT id, name FROM payment_accounts WHERE id = ?", (new_account_id,))
        acc = cur.fetchone()
        if not acc:
            conn.close()
            return {"success": False, "message": "Tài khoản thanh toán không tồn tại."}

        # Cập nhật các dòng thu tiền của đơn trong cashbook sang account_id mới
        cur.execute("""
        UPDATE cashbook 
        SET account_id = ?
        WHERE ref_type = 'order' AND ref_id = ?
        """, (new_account_id, order_id))

        conn.commit()
        conn.close()
        return {
            "success": True,
            "message": f"Đã đổi thanh toán đơn {order_code} sang [{acc['name']}]."
        }
    except Exception as e:
        conn.rollback()
        conn.close()
        return {"success": False, "message": f"Lỗi khi đổi thanh toán: {str(e)}"}

def format_vnd(amount) -> str:
    try:
        return f"{int(amount):,} đ".replace(",", ".")
    except Exception:
        return f"{amount} đ"

def handle_message(message: dict) -> dict:
    """Xử lý incoming text message từ Telegram."""
    chat_id = message.get("chat", {}).get("id")
    text = (message.get("text") or "").strip()
    from_user = message.get("from", {})
    username = from_user.get("username", "")
    first_name = from_user.get("first_name", "")

    if not chat_id or not text:
        return {"reply": ""}

    # 1. Đăng ký Admin
    if text.startswith("/dangky") or text.startswith("/register") or text.startswith("/start"):
        if text.startswith("/start") and is_admin(chat_id):
            return {
                "reply": (
                    "👋 Chào mừng Anh Quản Lý POS!\n\n"
                    "⚡ *Bộ lệnh nhanh:*\n"
                    "• `/baocao` - Xem doanh thu bán hàng\n"
                    "• `/hanghet` - Danh sách hàng hết cần đặt NCC\n"
                    "• `/gia <tên>` - Tra giá & tồn kho báo khách\n"
                    "• `/danhmuc` - Xem các danh mục hàng hóa\n"
                    "• `/huyhoadon <mã>` - Hủy đơn hoàn kho\n"
                    "• `/suathanhtoan <mã>` - Đổi hình thức thanh toán\n"
                )
            }
        res = register_admin_request(chat_id, username, first_name)
        return {"reply": res["message"]}

    # Kiểm tra quyền Admin
    if not is_admin(chat_id):
        return {
            "reply": "⛔ Anh chưa được cấp quyền Admin POS.\nVui lòng gửi lệnh `/dangky` rồi bấm duyệt trên Web POS để sử dụng."
        }

    # 2. Xem hàng hết
    if text.startswith("/hanghet") or text.startswith("/canhang"):
        items = query_out_of_stock()
        if not items:
            return {"reply": "✅ Tuyệt vời! Hiện tại không có hàng nào bị hết hoặc âm kho."}
        lines = [f"📦 *DANH SÁCH HÀNG HẾT CẦN ĐẶT ({len(items)} món):*"]
        for idx, it in enumerate(items, 1):
            lines.append(f"{idx}. *{it['name']}* ({it['code'] or 'N/A'})")
            lines.append(f"   • Tồn: `{it['stock']}` {it['unit'] or 'cái'} | Giá nhập: `{format_vnd(it['cost_price'])}`")
        return {"reply": "\n".join(lines)}

    # 3. Tra cứu giá báo khách
    if text.startswith("/gia"):
        parts = text.split(maxsplit=1)
        if len(parts) < 2:
            return {"reply": "💡 Cú pháp: `/gia <tên_hoặc_mã_hàng>` (ví dụ: `/gia royal canin`)"}
        keyword = parts[1]
        products = query_product_price(keyword)
        if not products:
            return {"reply": f"🔍 Không tìm thấy sản phẩm nào khớp với: *{keyword}*"}
        lines = [f"🔍 *KẾT QUẢ BÁO GIÁ CHO: '{keyword}'*"]
        for idx, p in enumerate(products, 1):
            lines.append(f"{idx}. *{p['name']}*")
            lines.append(f"   • Mã: `{p['code'] or '-'}` | Nhóm: `{p['category'] or 'Khác'}`")
            lines.append(f"   • Giá bán: *{format_vnd(p['sell_price'])}* | Còn: *{p['stock']}* {p['unit'] or 'cái'}")
        return {"reply": "\n".join(lines)}

    # 4. Danh mục
    if text.startswith("/danhmuc"):
        cats = query_categories()
        if not cats:
            return {"reply": "Chưa có danh mục nào trên POS."}
        lines = ["📂 *DANH MỤC HÀNG HÓA:*"]
        for idx, c in enumerate(cats, 1):
            lines.append(f"{idx}. {c}")
        lines.append("\n💡 Gõ `/gia <tên_nhóm>` để tra cứu sản phẩm trong nhóm.")
        return {"reply": "\n".join(lines)}

    # 5. Xem báo cáo
    if text.startswith("/baocao"):
        parts = text.split()
        period = parts[1].lower() if len(parts) > 1 else "homnay"
        if period not in ["homnay", "homqua", "thangnay"]:
            period = "homnay"
        rep = query_quick_report(period)
        lines = [
            f"📊 *BÁO CÁO DOANH THU {rep['title'].upper()}*",
            f"• Số đơn hàng: *{rep['summary']['total_orders']}* đơn",
            f"• Tổng doanh thu: *{format_vnd(rep['summary']['total_revenue'])}*",
            f"• Thực thu: *{format_vnd(rep['summary']['total_paid'])}*",
            f"• Công nợ phát sinh: *{format_vnd(rep['summary']['total_debt'])}*",
            "-----------------------------"
        ]
        if rep["payments"]:
            lines.append("💳 *Chi tiết dòng tiền:*")
            for p in rep["payments"]:
                lines.append(f"• {p['method_name']}: {format_vnd(p['amount'])}")
        return {
            "reply": "\n".join(lines),
            "inline_keyboard": [
                [
                    {"text": "📅 Hôm nay", "callback_data": "report:homnay"},
                    {"text": "⏮️ Hôm qua", "callback_data": "report:homqua"},
                    {"text": "📆 Tháng này", "callback_data": "report:thangnay"}
                ]
            ]
        }

    # 6. Hủy hóa đơn
    if text.startswith("/huyhoadon"):
        parts = text.split()
        if len(parts) < 2:
            return {"reply": "💡 Cú pháp: `/huyhoadon <Mã_Đơn>` (ví dụ: `/huyhoadon HD10023`)"}
        order_code = parts[1].upper()
        order = get_order_details(order_code)
        if not order:
            return {"reply": f"❌ Không tìm thấy đơn hàng *{order_code}* trên POS."}

        lines = [
            f"⚠️ *XÁC NHẬN HỦY HÓA ĐƠN: {order_code}*",
            f"• Khách hàng: {order.get('customer_name') or 'Khách lẻ'} ({order.get('customer_phone') or '-'})",
            f"• Tổng tiền: *{format_vnd(order.get('final_amount', 0))}*",
            f"• Thanh toán hiện tại: {order.get('current_payment', 'Tiền mặt')}",
            "• Danh sách món:"
        ]
        for it in order.get("items", []):
            lines.append(f"  - {it.get('product_name') or 'Món'}: SL {it.get('quantity')} ({format_vnd(it.get('price', 0))})")
        lines.append("\n❓ *Anh có chắc chắn muốn hủy đơn này không? Kho và sổ quỹ sẽ tự động hoàn trả.*")

        return {
            "reply": "\n".join(lines),
            "inline_keyboard": [
                [
                    {"text": "🔴 Xác nhận HỦY ĐƠN", "callback_data": f"confirm_cancel:{order_code}"},
                    {"text": "❌ Bỏ qua", "callback_data": "dismiss"}
                ]
            ]
        }

    # 7. Sửa hình thức thanh toán
    if text.startswith("/suathanhtoan"):
        parts = text.split()
        if len(parts) < 2:
            return {"reply": "💡 Cú pháp: `/suathanhtoan <Mã_Đơn>` (ví dụ: `/suathanhtoan HD10023`)"}
        order_code = parts[1].upper()
        order = get_order_details(order_code)
        if not order:
            return {"reply": f"❌ Không tìm thấy đơn hàng *{order_code}* trên POS."}

        accounts = get_available_payment_accounts()
        buttons = []
        for acc in accounts:
            icon = "💵" if acc["account_type"] == "cash" else "🏦"
            buttons.append([{"text": f"{icon} {acc['name']}", "callback_data": f"paychange:{order_code}:{acc['id']}"}])
        buttons.append([{"text": "❌ Hủy thao tác", "callback_data": "dismiss"}])

        reply_text = (
            f"💳 *SỬA HÌNH THỨC THANH TOÁN: {order_code}*\n"
            f"• Khách hàng: {order.get('customer_name') or 'Khách lẻ'}\n"
            f"• Tổng tiền: *{format_vnd(order.get('final_amount', 0))}*\n"
            f"• Hình thức hiện tại: *{order.get('current_payment', 'Tiền mặt')}*\n\n"
            f"👉 *Vui lòng chọn hình thức thanh toán mới bên dưới:*"
        )
        return {
            "reply": reply_text,
            "inline_keyboard": buttons
        }

    return {
        "reply": "❓ Lệnh không hợp lệ. Gõ `/start` để xem danh sách lệnh."
    }

def handle_callback_query(callback_query: dict) -> dict:
    """Xử lý tương tác nút bấm inline."""
    data = callback_query.get("data", "")
    from_user = callback_query.get("from", {})
    chat_id = from_user.get("id")

    if not is_admin(chat_id):
        return {"reply": "⛔ Anh không có quyền Admin.", "alert": True}

    if data == "dismiss":
        return {"reply": "Đã đóng thao tác.", "edit": True}

    if data.startswith("report:"):
        period = data.split(":", 1)[1]
        rep = query_quick_report(period)
        lines = [
            f"📊 *BÁO CÁO DOANH THU {rep['title'].upper()}*",
            f"• Số đơn hàng: *{rep['summary']['total_orders']}* đơn",
            f"• Tổng doanh thu: *{format_vnd(rep['summary']['total_revenue'])}*",
            f"• Thực thu: *{format_vnd(rep['summary']['total_paid'])}*",
            f"• Công nợ phát sinh: *{format_vnd(rep['summary']['total_debt'])}*",
            "-----------------------------"
        ]
        if rep["payments"]:
            lines.append("💳 *Chi tiết dòng tiền:*")
            for p in rep["payments"]:
                lines.append(f"• {p['method_name']}: {format_vnd(p['amount'])}")
        return {"reply": "\n".join(lines), "edit": True}

    if data.startswith("confirm_cancel:"):
        order_code = data.split(":", 1)[1]
        res = execute_cancel_order(order_code)
        icon = "✅" if res["success"] else "❌"
        return {"reply": f"{icon} {res['message']}", "edit": True}

    if data.startswith("paychange:"):
        parts = data.split(":")
        order_code = parts[1]
        acc_id = int(parts[2])
        res = execute_change_payment(order_code, acc_id)
        icon = "✅" if res["success"] else "❌"
        return {"reply": f"{icon} {res['message']}", "edit": True}

    return {"reply": "Thao tác hoàn tất.", "edit": True}

def _polling_worker():
    logger.info("Telegram Bot Polling Worker started")
    offset = 0
    while not _stop_event.is_set():
        token = get_telegram_setting("telegram_bot_token")
        enabled = get_telegram_setting("telegram_bot_enabled") == "1"
        if not token or not enabled:
            _stop_event.wait(5.0)
            continue

        try:
            url = f"https://api.telegram.org/bot{token}/getUpdates"
            params = {"offset": offset, "timeout": 15}
            with httpx.Client(timeout=25.0) as client:
                resp = client.get(url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("ok"):
                        updates = data.get("result", [])
                        for u in updates:
                            update_id = u["update_id"]
                            offset = update_id + 1

                            if "message" in u:
                                msg = u["message"]
                                chat_id = msg.get("chat", {}).get("id")
                                res = handle_message(msg)
                                if res.get("reply") and chat_id:
                                    payload = {
                                        "chat_id": chat_id,
                                        "text": res["reply"],
                                        "parse_mode": "Markdown"
                                    }
                                    if "inline_keyboard" in res:
                                        payload["reply_markup"] = {"inline_keyboard": res["inline_keyboard"]}
                                    send_telegram_api(token, "sendMessage", payload)

                            elif "callback_query" in u:
                                cb = u["callback_query"]
                                cb_id = cb.get("id")
                                cb_msg = cb.get("message", {})
                                chat_id = cb_msg.get("chat", {}).get("id")
                                msg_id = cb_msg.get("message_id")
                                res = handle_callback_query(cb)

                                send_telegram_api(token, "answerCallbackQuery", {
                                    "callback_query_id": cb_id,
                                    "text": res.get("reply", "") if res.get("alert") else "",
                                    "show_alert": bool(res.get("alert"))
                                })

                                if res.get("edit") and chat_id and msg_id:
                                    edit_payload = {
                                        "chat_id": chat_id,
                                        "message_id": msg_id,
                                        "text": res.get("reply", ""),
                                        "parse_mode": "Markdown"
                                    }
                                    send_telegram_api(token, "editMessageText", edit_payload)
                elif resp.status_code in (401, 404):
                    logger.warning(f"Telegram Bot Token invalid: HTTP {resp.status_code}")
                    _stop_event.wait(10.0)
                else:
                    _stop_event.wait(3.0)
        except Exception as e:
            logger.debug(f"Telegram polling loop exception: {e}")
            _stop_event.wait(3.0)

def start_telegram_bot_service():
    global _polling_thread
    if _polling_thread and _polling_thread.is_alive():
        return
    _stop_event.clear()
    _polling_thread = threading.Thread(target=_polling_worker, daemon=True, name="TelegramBotPoll")
    _polling_thread.start()
    logger.info("Telegram Bot service background thread launched")

def stop_telegram_bot_service():
    global _polling_thread
    _stop_event.set()
    _polling_thread = None

def restart_telegram_bot_service():
    stop_telegram_bot_service()
    time.sleep(0.3)
    start_telegram_bot_service()


import json
from fastapi import APIRouter, HTTPException, Depends
from database import get_db
from schemas import CompanySettingsUpdate, TemplateSettingsUpdate, PrintBoldConfigsUpdate, RolePermissionUpdate, ModuleToggleUpdate, StaffPermissionUpdate, PetCatalogUpdate
from logger_config import get_module_logger
from dependencies import require_role

logger = get_module_logger("settings")

router = APIRouter(prefix="/api/settings", tags=["Settings"])

# Cac quyen quan ly duoc (owner luon full, khong hien trong danh sach nay)
PERM_KEYS = ["pos.sell", "pos.edit_delete_order", "cashbook.manage", "purchases.manage", "purchases.request",
             "partners.manage", "price_lists.manage", "inventory.manage", "inventory.view_cost", "oem.manage",
             "reports.view", "shifts.approve", "shifts.bypass", "settings.access", "spa.pick_date",
             "payroll.manage"]
MANAGEABLE_ROLES = ["cashier", "accountant", "warehouse", "staff"]
MODULE_KEYS = ["module_oem", "module_pet_services", "module_price_lists", "module_hotel", "module_marketplace", "block_negative_stock"]

@router.get("/permissions")
def get_permissions(user=Depends(require_role("owner"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT role, perm_key, allowed FROM role_permissions")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {"perm_keys": PERM_KEYS, "roles": MANAGEABLE_ROLES, "matrix": rows}

@router.post("/permissions")
def update_permission(req: RolePermissionUpdate, user=Depends(require_role("owner"))):
    if req.role not in MANAGEABLE_ROLES or req.perm_key not in PERM_KEYS:
        raise HTTPException(status_code=400, detail="Role hoặc quyền không hợp lệ")
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO role_permissions (role, perm_key, allowed) VALUES (?, ?, ?) ON CONFLICT(role, perm_key) DO UPDATE SET allowed=?",
                (req.role, req.perm_key, int(req.allowed), int(req.allowed)))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@router.get("/staff-permissions/{staff_id}")
def get_staff_permissions(staff_id: int, user=Depends(require_role("owner"))):
    """Quyen rieng cua 1 nhan vien: NULL = dung theo role, khac NULL = da override."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT role, username, password_hash FROM staff WHERE id=?", (staff_id,))
    staff = cur.fetchone()
    if not staff:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên")
    has_account = bool(staff["username"] and staff["password_hash"])
    cur.execute("SELECT perm_key, allowed FROM role_permissions WHERE role=?", (staff["role"],))
    role_defaults = {r["perm_key"]: bool(r["allowed"]) for r in cur.fetchall()}
    cur.execute("SELECT perm_key, allowed FROM staff_permissions WHERE staff_id=?", (staff_id,))
    overrides = {r["perm_key"]: bool(r["allowed"]) for r in cur.fetchall()}
    conn.close()
    result = []
    for key in PERM_KEYS:
        result.append({
            "perm_key": key,
            "role_default": role_defaults.get(key, False),
            "override": overrides.get(key, None),  # None = chua override, dung role_default
        })
    return {"staff_id": staff_id, "role": staff["role"], "has_account": has_account, "perm_keys": PERM_KEYS, "permissions": result}

@router.post("/staff-permissions")
def update_staff_permission(req: StaffPermissionUpdate, user=Depends(require_role("owner"))):
    if req.perm_key not in PERM_KEYS:
        raise HTTPException(status_code=400, detail="Quyền không hợp lệ")
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT role FROM staff WHERE id=?", (req.staff_id,))
    staff = cur.fetchone()
    if not staff:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên")
    if staff["role"] == "owner":
        conn.close()
        raise HTTPException(status_code=400, detail="Owner luôn có full quyền, không thể chỉnh")
    if req.allowed is None:
        # Xoa override -> quay lai dung quyen mac dinh cua role
        cur.execute("DELETE FROM staff_permissions WHERE staff_id=? AND perm_key=?", (req.staff_id, req.perm_key))
    else:
        cur.execute("INSERT INTO staff_permissions (staff_id, perm_key, allowed) VALUES (?, ?, ?) ON CONFLICT(staff_id, perm_key) DO UPDATE SET allowed=?",
                    (req.staff_id, req.perm_key, int(req.allowed), int(req.allowed)))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@router.get("/activity-log")
def get_activity_log(
    staff_id: int = None,
    days: int = 90,
    search: str = None,
    action_type: str = None,
    limit: int = 500,
    user=Depends(require_role("owner"))
):
    """Log hoat dong 90 ngay gan nhat, co bo loc nhan vien, tu khoa, nghiep vu va khoang ngay."""
    conn = get_db()
    cur = conn.cursor()
    safe_days = max(1, min(days or 90, 365))
    sql = f"SELECT id, staff_id, staff_name, role, action, method, path, ip, created_at FROM activity_log WHERE created_at >= datetime('now', '-{safe_days} days')"
    params = []
    if staff_id:
        sql += " AND staff_id = ?"
        params.append(staff_id)
    if search and search.strip():
        search_kw = f"%{search.strip()}%"
        sql += " AND (staff_name LIKE ? OR action LIKE ? OR path LIKE ? OR ip LIKE ?)"
        params.extend([search_kw, search_kw, search_kw, search_kw])
    if action_type and action_type.strip():
        act_kw = f"%{action_type.strip()}%"
        sql += " AND (action LIKE ? OR path LIKE ?)"
        params.extend([act_kw, act_kw])
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    cur.execute(sql, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {"logs": rows}

@router.get("/modules")
def get_modules():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT key, value FROM settings WHERE key IN ({})".format(",".join("?" * len(MODULE_KEYS))), MODULE_KEYS)
    modules = {r["key"]: r["value"] == "1" for r in cur.fetchall()}
    conn.close()
    for k in MODULE_KEYS:
        modules.setdefault(k, False if k == "block_negative_stock" else True)
    return modules

@router.post("/modules")
def update_module(req: ModuleToggleUpdate, user=Depends(require_role("owner"))):
    if req.key not in MODULE_KEYS:
        raise HTTPException(status_code=400, detail="Module không hợp lệ")
    conn = get_db()
    cur = conn.cursor()
    val = "1" if req.enabled else "0"
    cur.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=?", (req.key, val, val))
    conn.commit()
    conn.close()
    return {"status": "ok"}

# Không bao giờ trả qua API đọc chung; có endpoint riêng (mask / owner-only)
SECRET_SETTING_KEYS = {"gemini_api_key", "telegram_bot_token"}

@router.get("")
def get_settings():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT key, value FROM settings")
    settings = {r["key"]: r["value"] for r in cur.fetchall() if r["key"] not in SECRET_SETTING_KEYS}
    conn.close()
    return settings

def _compress_base64_image(data_url: str, max_chars: int = 45000) -> str:
    if not data_url or len(data_url) <= max_chars or not data_url.startswith("data:image/"):
        return data_url or ""
    try:
        import base64
        import io
        from PIL import Image
        header, b64_part = data_url.split(",", 1)
        raw_bytes = base64.b64decode(b64_part)
        img = Image.open(io.BytesIO(raw_bytes))
        img.thumbnail((280, 280))
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=85)
        out_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/webp;base64,{out_b64}"
    except Exception:
        return data_url


@router.post("/company")
def update_company_settings(req: CompanySettingsUpdate, user=Depends(require_role("owner"))):
    conn = get_db()
    cur = conn.cursor()
    updates = [
        ('app_name', req.app_name or "⚡ POS Offline"),
        ('shop_name', req.shop_name),
        ('shop_address', req.shop_address),
        ('shop_phone', req.shop_phone),
        ('shop_footer', req.shop_footer),
        ('shop_bank_code', req.shop_bank_code),
        ('shop_bank_account', req.shop_bank_account),
        ('shop_bank_owner', req.shop_bank_owner),
        ('shop_qr_mode', req.shop_qr_mode),
        ('shop_qr_image', _compress_base64_image(req.shop_qr_image or "")),
        ('shop_logo', _compress_base64_image(req.shop_logo or "")),
        ('google_drive_webhook_url', req.google_drive_webhook_url or "")
    ]
    for _opt_key in (
        'block_negative_stock',
        'code_prefix_order', 'code_mode_order', 'code_digits_order',
        'code_prefix_spa', 'code_mode_spa', 'code_digits_spa',
        'code_prefix_return', 'code_mode_return', 'code_digits_return',
        'code_prefix_purchase', 'code_mode_purchase', 'code_digits_purchase',
        'code_prefix_receipt', 'code_prefix_payment', 'code_mode_cashbook', 'code_digits_cashbook',
    ):
        _val = getattr(req, _opt_key, None)
        if _val is not None:
            updates.append((_opt_key, str(_val).strip()))
    try:
        cur.executemany(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            updates,
        )
        conn.commit()
    except Exception as e:
        conn.close()
        err_str = str(e)
        if "free tier daily row write limit" in err_str:
            raise HTTPException(
                status_code=429,
                detail="Tài khoản Cloudflare Free đã chạm trần 100.000 dòng ghi trong hôm nay (do lúc nãy vừa nạp 118.022 dòng dữ liệu). Hạn mức sẽ tự động mở lại lúc 07:00 sáng mai, hoặc mở ngay lập tức nếu nâng cấp gói Cloudflare $5/tháng.",
            )
        raise HTTPException(status_code=500, detail=f"Lỗi lưu cấu hình: {err_str}")
    conn.close()
    try:
        from server import invalidate_branding_cache
        compressed_logo = dict(updates).get("shop_logo", "")
        invalidate_branding_cache(
            app_name=req.app_name or "⚡ POS Offline",
            shop_logo=compressed_logo,
        )
    except Exception:
        pass
    return {"status": "ok"}

@router.post("/template")
def update_template_settings(req: TemplateSettingsUpdate, user=Depends(require_role("owner"))):
    import json
    conn = get_db()
    cur = conn.cursor()
    try:
        incoming_data = json.loads(req.print_blocks_config)
        cur.execute("SELECT value FROM settings WHERE key = 'print_blocks_config'")
        row = cur.fetchone()
        if row and row[0]:
            existing_data = json.loads(row[0])
            if isinstance(existing_data, dict) and isinstance(incoming_data, dict):
                existing_presets = existing_data.get("presets", {})
                incoming_presets = incoming_data.get("presets", {})
                if isinstance(existing_presets, dict) and isinstance(incoming_presets, dict):
                    # Giữ lại các preset khác của các máy khác, ghi đè những preset máy này đang lưu
                    merged_presets = {**existing_presets, **incoming_presets}
                    incoming_data["presets"] = merged_presets
                    req.print_blocks_config = json.dumps(incoming_data, ensure_ascii=False)
    except Exception as e:
        logger.warning(f"Merge print presets warning: {e}")

    cur.execute("INSERT INTO settings (key, value) VALUES ('print_blocks_config', ?) ON CONFLICT(key) DO UPDATE SET value = ?", (req.print_blocks_config, req.print_blocks_config))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@router.post("/print-bold-configs")
def update_print_bold_configs(req: PrintBoldConfigsUpdate, user=Depends(require_role("owner"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO settings (key, value) VALUES ('print_bold_configs', ?) ON CONFLICT(key) DO UPDATE SET value = ?", (req.print_bold_configs, req.print_bold_configs))
    conn.commit()
    conn.close()
    return {"status": "ok"}


import os
import shutil
import datetime
from typing import Optional
from pydantic import BaseModel

class ResetDataRequest(BaseModel):
    mode: str # 'transactions_and_customers', 'factory_reset', hoặc 'clear_catalog_only'
    confirm_text: str

@router.post("/reset-data")
def reset_database_data(req: ResetDataRequest, user=Depends(require_role("owner"))):
    valid_confirm = "XOA HANG HOA" if req.mode == "clear_catalog_only" else "XOA HET DU LIEU"
    if req.confirm_text.strip().upper() != valid_confirm:
        raise HTTPException(status_code=400, detail=f"Chuỗi xác nhận không chính xác! Vui lòng nhập đúng: {valid_confirm}")

    if req.mode not in ('transactions_and_customers', 'factory_reset', 'clear_catalog_only'):
        raise HTTPException(status_code=400, detail="Chế độ xóa dữ liệu không hợp lệ")

    from database import get_db, get_db_path
    from backup_service import safe_sqlite_copy
    db_path = get_db_path()

    # 1. Tu dong tao backup an toan truoc khi xoa (chi ap dung khi chay file SQLite cuc bo)
    is_cloud_db = bool(os.environ.get("DATABASE_URL") or os.environ.get("CF_D1_WORKER_URL") or os.environ.get("CF_D1_DATABASE_ID") or os.environ.get("VERCEL"))
    backup_filename = "cloud_d1_time_travel" if is_cloud_db else ""
    if not is_cloud_db:
        try:
            backup_dir = os.path.join(os.path.dirname(db_path), "backups")
            os.makedirs(backup_dir, exist_ok=True)
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_filename = f"pos_backup_pre_reset_{req.mode}_{timestamp}.db"
            backup_filepath = os.path.join(backup_dir, backup_filename)
            if os.path.exists(db_path):
                safe_sqlite_copy(db_path, backup_filepath)
                logger.info(f"Đã tạo bản sao lưu an toàn tại: {backup_filepath}")
            else:
                logger.warning(f"DB file không tồn tại tại {db_path}, bỏ qua sao lưu file")
        except Exception as e:
            logger.error(f"Lỗi khi sao lưu trước khi xóa: {e}")
            raise HTTPException(status_code=500, detail=f"Không thể tạo bản sao lưu an toàn trước khi xóa: {e}")

    conn = get_db()
    cur = conn.cursor()
    try:
        if req.mode == 'clear_catalog_only':
            # Chế độ 3: Chỉ dọn sạch danh mục Hàng Hóa để nạp lại từ đầu
            cur.execute("DELETE FROM item_units WHERE item_type = 'product'")
            cur.execute("DELETE FROM supplier_items WHERE item_type = 'product'")
            cur.execute("DELETE FROM product_inventory")
            cur.execute("DELETE FROM product_bom")
            cur.execute("DELETE FROM inventory_logs WHERE product_id IS NOT NULL")
            cur.execute("DELETE FROM products")
            try:
                cur.execute("DELETE FROM sqlite_sequence WHERE name IN ('products', 'product_inventory', 'item_units')")
            except Exception:
                pass
            conn.commit()
            conn.close()
            return {
                "status": "ok",
                "message": "Đã dọn sạch toàn bộ danh mục hàng hóa an toàn! Bạn có thể import file Excel mới ngay bây giờ."
            }

        elif req.mode == 'transactions_and_customers':
            # Che do 1: Xoa hoa don, khach hang, so quy, nhap hang, dich vu thu cung.
            # GIU LAI: Hang hoa (products, ingredients), bang gia (price_lists), cau hinh (settings), kho (warehouses)
            tables_to_clear = [
                'order_payments', 'order_return_items', 'order_returns',
                'order_items', 'orders',
                'pet_service_tickets', 'hotel_bookings', 'pets',  # hotel_bookings.pet_id NO ACTION -> xoa truoc pets
                'spa_wallet_transactions',
                'cashbook',
                'purchase_items', 'purchases',
                'oem_order_items', 'oem_orders',
                'stock_audit_items', 'stock_audits',
                'warehouse_transfer_items', 'warehouse_transfers',
                'inventory_logs',
                'production_materials_consumed', 'production_items', 'productions'
            ]
            # expense_requests.cashbook_id tro vao cashbook (NO ACTION) -> go lien ket truoc khi xoa so quy
            cur.execute("UPDATE expense_requests SET cashbook_id = NULL WHERE cashbook_id IS NOT NULL")
            for t in tables_to_clear:
                cur.execute(f"DELETE FROM {t}")

            # Xoa contacts la Khach hang (type = 'customer' hoac 'khach_hang'), giu lai Nha Cung Cap
            cur.execute("DELETE FROM contacts WHERE LOWER(type) IN ('customer', 'khach_hang')")

            # Reset so ton kho ve 0
            cur.execute("UPDATE inventory SET quantity = 0")
            cur.execute("UPDATE product_inventory SET quantity = 0")

            msg = "Đã làm sạch toàn bộ Hóa đơn, Khách hàng, Sổ quỹ, Đơn nhập và Thẻ kho (Đã giữ lại Danh mục Hàng hóa, NCC & Cài đặt)!"
            logger.info("Hoàn tất reset dữ liệu giao dịch và khách hàng.")

        elif req.mode == 'factory_reset':
            # Che do 2: Xoa toan bo du lieu, dua ve trang thai moi tinh (Factory Reset)
            # Giu lai: settings, staff (tai khoan admin), danh muc kho mac dinh
            all_data_tables = [
                'order_payments', 'order_return_items', 'order_returns',
                'order_items', 'orders',
                'pet_service_tickets', 'hotel_bookings', 'pets', 'pet_service_pricing',
                'spa_wallet_transactions',
                'cashbook',
                'purchase_items', 'purchases', 'supplier_items',
                'oem_order_items', 'oem_orders',
                'stock_audit_items', 'stock_audits',
                'warehouse_transfer_items', 'warehouse_transfers',
                'inventory_logs', 'inventory', 'product_inventory',
                'production_materials_consumed', 'production_items', 'productions',
                'combo_items', 'combos',
                'product_price_list', 'price_lists', 'customer_segments', 'price_history',
                'product_bom', 'bom',
                'products', 'ingredients',
                'contacts'
            ]
            cur.execute("UPDATE expense_requests SET cashbook_id = NULL WHERE cashbook_id IS NOT NULL")
            for t in all_data_tables:
                cur.execute(f"DELETE FROM {t}")

            msg = "Đã khôi phục cài đặt gốc thành công (Xóa toàn bộ dữ liệu, đã sao lưu bản snapshot an toàn)!"
            logger.info("Hoàn tất Factory Reset.")

        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Lỗi khi thực hiện xóa dữ liệu: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi database khi xóa: {e}")
    finally:
        conn.close()

    return {"status": "ok", "message": msg, "backup_file": backup_filename}

@router.post("/clear-demo-seed")
def clear_demo_seed_data(user=Depends(require_role("owner"))):
    """Xóa sạch 90 bản ghi dữ liệu mẫu Demo (30 POS + 30 Spa + 30 Hotel) và hoàn trả công nợ khách hàng."""
    from database import get_db, get_db_path
    import json
    conn = get_db()
    cur = conn.cursor()
    manifest_path = os.path.join(os.path.dirname(get_db_path()), "demo_seed_manifest.json")
    try:
        # Hoàn trả phần công nợ Demo đã cộng thêm vào khách hàng (nếu có trong manifest)
        if os.path.exists(manifest_path):
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
                for cid_str, delta_debt in (manifest.get("customer_debt_deltas") or {}).items():
                    cur.execute("UPDATE contacts SET debt = MAX(0, COALESCE(debt, 0) - ?) WHERE id = ?", (float(delta_debt), int(cid_str)))
            except Exception as e:
                logger.warning(f"Không thể đọc manifest hoàn nợ demo: {e}")

        # Xóa bút toán liên quan tới đơn POS Demo
        cur.execute("DELETE FROM order_payments WHERE order_id IN (SELECT id FROM orders WHERE code LIKE 'HD-DEMO-%')")
        cur.execute("DELETE FROM order_return_items WHERE return_id IN (SELECT id FROM order_returns WHERE code LIKE 'RET-DEMO-%')")
        cur.execute("DELETE FROM order_returns WHERE code LIKE 'RET-DEMO-%'")
        cur.execute("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE code LIKE 'HD-DEMO-%')")
        cur.execute("DELETE FROM spa_wallet_transactions WHERE order_id IN (SELECT id FROM orders WHERE code LIKE 'HD-DEMO-%') OR note LIKE '%[DEMO-SEED]%'")
        cur.execute("DELETE FROM orders WHERE code LIKE 'HD-DEMO-%'")
        cur.execute("DELETE FROM archived_codes WHERE code LIKE 'HD-DEMO-%' OR code LIKE 'RET-DEMO-%'")

        # Xóa vé Spa Demo
        cur.execute("DELETE FROM pet_service_tickets WHERE code LIKE 'SPA-DEMO-%'")

        # Giải phóng các phòng đang bị giữ bởi booking Hotel Demo rồi xóa booking Hotel Demo
        cur.execute("""
            UPDATE hotel_rooms
            SET status = 'available'
            WHERE id IN (SELECT room_id FROM hotel_bookings WHERE code LIKE 'HT-DEMO-%')
        """)
        cur.execute("DELETE FROM hotel_bookings WHERE code LIKE 'HT-DEMO-%'")

        # Xóa phiếu thu/chi Sổ quỹ Demo
        cur.execute("DELETE FROM cashbook WHERE code LIKE 'PT-DEMO-%' OR code LIKE 'PC-DEMO-%' OR note LIKE '%[DEMO-SEED]%'")

        conn.commit()
        if os.path.exists(manifest_path):
            try:
                os.remove(manifest_path)
            except Exception:
                pass
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Lỗi khi xóa dữ liệu mẫu Demo: {e}")
    conn.close()
    return {
        "status": "ok",
        "message": "Đã xóa sạch toàn bộ 90 phiếu dữ liệu mẫu Demo (30 POS, 30 Spa, 30 Khách Sạn) và khôi phục nguyên trạng!"
    }

@router.post("/backup-drive-now")
def trigger_google_drive_backup(user=Depends(require_role("owner"))):
    """Kich hoat sao luu tuc thi len Google Drive qua Webhook"""
    from backup_service import backup_to_google_drive_webhook
    ok, message = backup_to_google_drive_webhook()
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"status": "ok", "message": message}

# ── Telegram Bot Management APIs ──
class TelegramConfigReq(BaseModel):
    bot_token: str
    is_enabled: bool = True

class TelegramApproveReq(BaseModel):
    chat_id: int
    approved_by: Optional[str] = "Web POS"

class TelegramRejectReq(BaseModel):
    chat_id: int

@router.get("/telegram")
def get_telegram_settings_data(user=Depends(require_role("owner"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = 'telegram_bot_token'")
    token_row = cur.fetchone()
    bot_token = token_row["value"] if token_row else ""

    cur.execute("SELECT value FROM settings WHERE key = 'telegram_bot_enabled'")
    enabled_row = cur.fetchone()
    is_enabled = (enabled_row["value"] == "1") if enabled_row else False

    cur.execute("SELECT * FROM telegram_admins WHERE is_active = 1 ORDER BY approved_at DESC")
    admins = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT * FROM telegram_admin_requests WHERE status = 'pending' ORDER BY created_at DESC")
    requests = [dict(r) for r in cur.fetchall()]

    conn.close()
    return {
        "bot_token": bot_token,
        "is_enabled": is_enabled,
        "admins": admins,
        "requests": requests
    }

@router.post("/telegram/config")
def update_telegram_config(req: TelegramConfigReq, user=Depends(require_role("owner"))):
    from services.telegram_bot import set_telegram_setting, restart_telegram_bot_service
    set_telegram_setting("telegram_bot_token", req.bot_token.strip())
    set_telegram_setting("telegram_bot_enabled", "1" if req.is_enabled else "0")
    restart_telegram_bot_service()
    return {"status": "ok", "message": "Đã lưu cấu hình Telegram Bot"}

@router.post("/telegram/approve")
def approve_telegram_admin(req: TelegramApproveReq, user=Depends(require_role("owner"))):
    from services.telegram_bot import approve_admin_request
    ok = approve_admin_request(req.chat_id, approved_by=req.approved_by or user.get("username", "Web POS"))
    if not ok:
        raise HTTPException(status_code=400, detail="Không tìm thấy yêu cầu hoặc duyệt thất bại")
    return {"status": "ok", "message": f"Đã duyệt Admin cho Chat ID {req.chat_id}"}

@router.post("/telegram/reject")
def reject_telegram_admin(req: TelegramRejectReq, user=Depends(require_role("owner"))):
    from services.telegram_bot import reject_admin_request
    ok = reject_admin_request(req.chat_id)
    return {"status": "ok", "message": f"Đã xóa/từ chối quyền Admin của Chat ID {req.chat_id}"}


# ── Danh Mục Màu Lông & Giống Loài Thú Cưng (Configurable Pet Catalog) ──
DEFAULT_PET_COLORS = [
    "Trắng", "Đen", "Nâu", "Socola", "Kem", "Vàng", "Vàng mơ", "Xám",
    "Silver", "Phantom", "Bò sữa", "Bò nâu", "Bò xám", "Trắng - Xám",
    "Vàng - Đen", "Vàng - Xám", "Bicolor (Nhị thể)", "Tricolor (Tam thể)",
    "Tabbi (Mướp)", "Sọc dưa"
]

DEFAULT_PET_BREEDS = [
    "Poodle", "Phốc Sóc", "Corgi", "Samoyed", "Alaska", "Husky",
    "Golden", "Labrador", "Bichon", "Shiba", "Akita", "Bull Pháp",
    "Pug", "Bull Anh", "Lạp xưởng", "Bắc Kinh", "Chó Nhật", "Chó Cảnh Khác",
    "Mèo ALN", "Mèo ALD", "Mèo Cảnh Khác"
]

@router.get("/pet-catalog")
def get_pet_catalog():
    """Lấy danh mục màu lông và giống loài thú cưng đã cấu hình, tự động bổ sung nếu bảng pets có dữ liệu riêng."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT key, value FROM settings WHERE key IN ('pet_colors_catalog', 'pet_breeds_catalog')")
    rows = {r["key"]: r["value"] for r in cur.fetchall()}

    colors = []
    if rows.get("pet_colors_catalog"):
        try:
            colors = json.loads(rows["pet_colors_catalog"])
        except Exception:
            colors = []
    if not colors or not isinstance(colors, list):
        colors = list(DEFAULT_PET_COLORS)

    breeds = []
    if rows.get("pet_breeds_catalog"):
        try:
            breeds = json.loads(rows["pet_breeds_catalog"])
        except Exception:
            breeds = []
    if not breeds or not isinstance(breeds, list):
        breeds = list(DEFAULT_PET_BREEDS)

    # Self-healing / no data loss: merge thêm các màu/giống đã từng lưu trong bảng pets
    try:
        cur.execute("SELECT DISTINCT color FROM pets WHERE color IS NOT NULL AND TRIM(color) != ''")
        for r in cur.fetchall():
            c = r["color"].strip()
            if c and c not in colors:
                colors.append(c)

        cur.execute("SELECT DISTINCT breed FROM pets WHERE breed IS NOT NULL AND TRIM(breed) != ''")
        for r in cur.fetchall():
            b = r["breed"].strip()
            if b and b not in breeds:
                breeds.append(b)
    except Exception as e:
        logger.warning(f"Error merging distinct colors/breeds from pets: {e}")

    conn.close()
    return {
        "colors": colors,
        "breeds": breeds
    }

@router.post("/pet-catalog")
def update_pet_catalog(req: PetCatalogUpdate, user=Depends(require_role("owner"))):
    """Cập nhật danh mục màu lông và giống loài tùy chỉnh của cửa hàng."""
    clean_colors = [c.strip() for c in req.colors if c and c.strip()]
    clean_breeds = [b.strip() for b in req.breeds if b and b.strip()]
    unique_colors = list(dict.fromkeys(clean_colors))
    unique_breeds = list(dict.fromkeys(clean_breeds))

    conn = get_db()
    cur = conn.cursor()
    val_colors = json.dumps(unique_colors, ensure_ascii=False)
    val_breeds = json.dumps(unique_breeds, ensure_ascii=False)

    cur.execute("INSERT INTO settings (key, value) VALUES ('pet_colors_catalog', ?) ON CONFLICT(key) DO UPDATE SET value = ?", (val_colors, val_colors))
    cur.execute("INSERT INTO settings (key, value) VALUES ('pet_breeds_catalog', ?) ON CONFLICT(key) DO UPDATE SET value = ?", (val_breeds, val_breeds))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Đã lưu danh mục thú cưng thành công"}

@router.post("/pet-catalog/restore-defaults")
def restore_pet_catalog_defaults(user=Depends(require_role("owner"))):
    """Khôi phục danh mục màu và giống thú cưng về mặc định."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM settings WHERE key IN ('pet_colors_catalog', 'pet_breeds_catalog')")
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Đã khôi phục danh mục màu và giống thú cưng về mặc định"}








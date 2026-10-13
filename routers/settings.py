from fastapi import APIRouter, HTTPException, Depends
import json
from database import get_db
from schemas import CompanySettingsUpdate, TemplateSettingsUpdate, PrintBoldConfigsUpdate, RolePermissionUpdate, ModuleToggleUpdate, StaffPermissionUpdate
from logger_config import get_module_logger
from dependencies import require_role

logger = get_module_logger("settings")

router = APIRouter(prefix="/api/settings", tags=["Settings"])

# Cac quyen quan ly duoc (owner luon full, khong hien trong danh sach nay)
PERM_KEYS = ["pos.sell", "pos.edit_delete_order", "cashbook.manage", "purchases.manage",
             "partners.manage", "price_lists.manage", "inventory.manage", "inventory.view_cost", "oem.manage",
             "reports.view", "shifts.approve", "shifts.bypass", "settings.access"]
MANAGEABLE_ROLES = ["cashier", "accountant", "warehouse", "staff"]
MODULE_KEYS = ["module_oem", "module_pet_services", "module_price_lists", "module_hotel", "module_marketplace"]

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
    cur.execute("SELECT role FROM staff WHERE id=?", (staff_id,))
    staff = cur.fetchone()
    if not staff:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên")
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
    return {"staff_id": staff_id, "role": staff["role"], "perm_keys": PERM_KEYS, "permissions": result}

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
        modules.setdefault(k, True)
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

@router.get("")
def get_settings():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT key, value FROM settings")
    settings = {r["key"]: r["value"] for r in cur.fetchall()}
    conn.close()
    return settings

@router.post("/company")
def update_company_settings(req: CompanySettingsUpdate):
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
        ('shop_qr_image', req.shop_qr_image or ""),
        ('shop_logo', req.shop_logo or ""),
        ('google_drive_webhook_url', req.google_drive_webhook_url or "")
    ]
    for key, val in updates:
        cur.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?", (key, val, val))
    conn.commit()
    conn.close()
    try:
        from server import invalidate_branding_cache
        invalidate_branding_cache()
    except Exception:
        pass
    return {"status": "ok"}

@router.post("/template")
def update_template_settings(req: TemplateSettingsUpdate):
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
def update_print_bold_configs(req: PrintBoldConfigsUpdate):
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
    db_path = get_db_path()

    # 1. Tu dong tao backup an toan truoc khi xoa
    try:
        backup_dir = os.path.join(os.path.dirname(db_path), "backups")
        os.makedirs(backup_dir, exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"pos_backup_pre_reset_{req.mode}_{timestamp}.db"
        backup_filepath = os.path.join(backup_dir, backup_filename)
        shutil.copy2(db_path, backup_filepath)
        logger.info(f"Đã tạo bản sao lưu an toàn tại: {backup_filepath}")
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
                'order_items', 'orders',
                'pet_service_tickets', 'pets',
                'cashbook',
                'purchase_items', 'purchases',
                'oem_order_items', 'oem_orders',
                'stock_audit_items', 'stock_audits',
                'warehouse_transfer_items', 'warehouse_transfers',
                'inventory_logs',
                'production_materials_consumed', 'production_items', 'productions'
            ]
            for t in tables_to_clear:
                cur.execute(f"DELETE FROM {t}")

            # Xoa contacts la Khach hang (type = 'CUSTOMER' hoac 'KHACH_HANG'), giu lai Nha Cung Cap
            cur.execute("DELETE FROM contacts WHERE type IN ('CUSTOMER', 'KHACH_HANG')")

            # Reset so ton kho ve 0
            cur.execute("UPDATE inventory SET quantity = 0")
            cur.execute("UPDATE product_inventory SET quantity = 0")

            msg = "Đã làm sạch toàn bộ Hóa đơn, Khách hàng, Sổ quỹ, Đơn nhập và Thẻ kho (Đã giữ lại Danh mục Hàng hóa, NCC & Cài đặt)!"
            logger.info("Hoàn tất reset dữ liệu giao dịch và khách hàng.")

        elif req.mode == 'factory_reset':
            # Che do 2: Xoa toan bo du lieu, dua ve trang thai moi tinh (Factory Reset)
            # Giu lai: settings, staff (tai khoan admin), danh muc kho mac dinh
            all_data_tables = [
                'order_items', 'orders',
                'pet_service_tickets', 'pets', 'pet_service_pricing',
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

@router.post("/backup-drive-now")
def trigger_google_drive_backup():
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


# ==============================================================================
# TRÌNH THIẾT KẾ MẪU IN TOÀN NĂNG (UNIVERSAL WYSIWYG PRINT DESIGNER)
# ==============================================================================

class UniversalPrintTemplateSaveReq(BaseModel):
    content_html: str
    paper_size: Optional[str] = "K80"
    orientation: Optional[str] = "portrait"

DOCUMENT_PRINT_METADATA = {
    "pos_retail": {
        "title": "Hóa Đơn Bán Lẻ",
        "default_paper": "K80",
        "default_orientation": "portrait",
        "tokens": [
            {"key": "ten_cua_hang", "label": "Tên cửa hàng", "group": "Cửa hàng"},
            {"key": "dia_chi", "label": "Địa chỉ cửa hàng", "group": "Cửa hàng"},
            {"key": "so_dien_thoai", "label": "Hotline cửa hàng", "group": "Cửa hàng"},
            {"key": "website", "label": "Website", "group": "Cửa hàng"},
            {"key": "ma_hoa_don", "label": "Mã hóa đơn", "group": "Hóa đơn"},
            {"key": "ngay_gio", "label": "Ngày giờ bán", "group": "Hóa đơn"},
            {"key": "thu_ngan", "label": "Thu ngân", "group": "Hóa đơn"},
            {"key": "ten_khach", "label": "Tên khách hàng", "group": "Khách hàng"},
            {"key": "sdt_khach", "label": "SĐT khách hàng", "group": "Khách hàng"},
            {"key": "dia_chi_khach", "label": "Địa chỉ khách", "group": "Khách hàng"},
            {"key": "tong_tien", "label": "Tổng tiền hàng", "group": "Thanh toán"},
            {"key": "giam_gia", "label": "Giảm giá / CK", "group": "Thanh toán"},
            {"key": "phai_tra", "label": "Khách phải trả", "group": "Thanh toán"},
            {"key": "khach_tra", "label": "Tiền khách đưa", "group": "Thanh toán"},
            {"key": "con_no", "label": "Tiền thừa / Còn nợ", "group": "Thanh toán"},
            {"key": "hinh_thuc_tt", "label": "Phương thức TT", "group": "Thanh toán"},
            {"key": "vietqr_code", "label": "Mã QR chuyển khoản", "group": "Thanh toán"},
            {"key": "ghi_chu", "label": "Ghi chú đơn", "group": "Hóa đơn"},
            {"key": "loi_cam_on", "label": "Lời cảm ơn chân trang", "group": "Cửa hàng"}
        ]
    },
    "pos_b2b": {
        "title": "Hóa Đơn Sỉ / Đại Lý A4",
        "default_paper": "A4",
        "default_orientation": "portrait",
        "tokens": [
            {"key": "ten_cua_hang", "label": "Tên công ty bán", "group": "Cửa hàng"},
            {"key": "dia_chi", "label": "Địa chỉ kho bán", "group": "Cửa hàng"},
            {"key": "so_dien_thoai", "label": "Hotline", "group": "Cửa hàng"},
            {"key": "ma_hoa_don", "label": "Số hóa đơn B2B", "group": "Hóa đơn"},
            {"key": "ngay_gio", "label": "Ngày xuất bán", "group": "Hóa đơn"},
            {"key": "ten_khach", "label": "Đại lý / Công ty mua", "group": "Khách hàng"},
            {"key": "sdt_khach", "label": "SĐT đại lý", "group": "Khách hàng"},
            {"key": "dia_chi_khach", "label": "Địa chỉ giao hàng", "group": "Khách hàng"},
            {"key": "tong_tien", "label": "Tổng tiền hàng", "group": "Thanh toán"},
            {"key": "giam_gia", "label": "Chiết khấu đại lý", "group": "Thanh toán"},
            {"key": "phai_tra", "label": "Tổng thanh toán", "group": "Thanh toán"},
            {"key": "khach_tra", "label": "Đã thanh toán", "group": "Thanh toán"},
            {"key": "con_no", "label": "Dư nợ đơn hàng", "group": "Thanh toán"},
            {"key": "vietqr_code", "label": "Mã VietQR thanh toán", "group": "Thanh toán"},
            {"key": "ghi_chu", "label": "Ghi chú hợp đồng/giao vận", "group": "Hóa đơn"}
        ]
    },
    "oem_order": {
        "title": "Hợp Đồng & Phụ Lục OEM",
        "default_paper": "A4",
        "default_orientation": "portrait",
        "tokens": [
            {"key": "ten_cua_hang", "label": "Bên A (Chủ thương hiệu)", "group": "Bên A"},
            {"key": "dia_chi", "label": "Địa chỉ Bên A", "group": "Bên A"},
            {"key": "so_dien_thoai", "label": "Hotline Bên A", "group": "Bên A"},
            {"key": "ma_don_oem", "label": "Mã hợp đồng / Phụ lục", "group": "OEM"},
            {"key": "ngay_lap", "label": "Ngày lập đơn", "group": "OEM"},
            {"key": "ngay_hen_giao", "label": "Hạn giao thành phẩm", "group": "OEM"},
            {"key": "xuong_gia_cong", "label": "Tên xưởng OEM (Bên B)", "group": "Bên B"},
            {"key": "sdt_xuong", "label": "SĐT Xưởng", "group": "Bên B"},
            {"key": "kho_xuong", "label": "Kho xưởng chỉ định", "group": "OEM"},
            {"key": "tong_tien_raw", "label": "Tiền gia công chưa thuế", "group": "Tài chính"},
            {"key": "discount_percent", "label": "Chiết khấu %", "group": "Tài chính"},
            {"key": "tien_chiet_khau", "label": "Tiền chiết khấu", "group": "Tài chính"},
            {"key": "vat_percent", "label": "Thuế VAT %", "group": "Tài chính"},
            {"key": "tien_vat", "label": "Tiền thuế VAT", "group": "Tài chính"},
            {"key": "tong_thanh_toan", "label": "Tổng thanh toán cuối", "group": "Tài chính"},
            {"key": "tien_coc", "label": "Đã thanh toán đợt 1 (Cọc)", "group": "Tài chính"},
            {"key": "con_lai", "label": "Còn lại khi nhận hàng", "group": "Tài chính"},
            {"key": "ghi_chu", "label": "Ghi chú & Quy cách đóng gói", "group": "OEM"}
        ]
    },
    "purchase_order": {
        "title": "Phiếu Nhập Hàng Nhà Cung Cấp",
        "default_paper": "A4",
        "default_orientation": "portrait",
        "tokens": [
            {"key": "ten_cua_hang", "label": "Tên kho nhận", "group": "Kho nhận"},
            {"key": "ma_phieu_nhap", "label": "Mã phiếu nhập PO", "group": "Nhập hàng"},
            {"key": "ngay_nhap", "label": "Ngày nhập kho", "group": "Nhập hàng"},
            {"key": "nha_cung_cap", "label": "Tên Nhà cung cấp", "group": "Nhà cung cấp"},
            {"key": "sdt_ncc", "label": "SĐT Nhà cung cấp", "group": "Nhà cung cấp"},
            {"key": "nguoi_nhap", "label": "Thủ kho / Người lập", "group": "Nhập hàng"},
            {"key": "tong_tien_nhap", "label": "Tổng tiền hàng nhập", "group": "Thanh toán"},
            {"key": "da_tra_ncc", "label": "Tiền đã trả NCC", "group": "Thanh toán"},
            {"key": "con_no_ncc", "label": "Công nợ còn lại", "group": "Thanh toán"},
            {"key": "ghi_chu", "label": "Ghi chú phiếu nhập", "group": "Nhập hàng"}
        ]
    },
    "cashbook_voucher": {
        "title": "Phiếu Thu / Chi Sổ Quỹ",
        "default_paper": "K80",
        "default_orientation": "portrait",
        "tokens": [
            {"key": "ten_cua_hang", "label": "Tên đơn vị", "group": "Đơn vị"},
            {"key": "ma_phieu", "label": "Số chứng từ", "group": "Chứng từ"},
            {"key": "ngay_gio", "label": "Ngày giờ lập", "group": "Chứng từ"},
            {"key": "loai_phieu", "label": "Phiếu Thu hoặc Phiếu Chi", "group": "Chứng từ"},
            {"key": "hang_muc", "label": "Hạng mục thu/chi", "group": "Chứng từ"},
            {"key": "nguoi_giao_dich", "label": "Người nộp / nhận tiền", "group": "Đối tác"},
            {"key": "so_tien", "label": "Số tiền (bằng số)", "group": "Tài chính"},
            {"key": "so_tien_chu", "label": "Số tiền (bằng chữ)", "group": "Tài chính"},
            {"key": "ly_do", "label": "Lý do nộp/chi", "group": "Chứng từ"},
            {"key": "nguon_quy", "label": "Nguồn quỹ thanh toán", "group": "Tài chính"}
        ]
    },
    "spa_intake": {
        "title": "Phiếu Tiếp Nhận Thú Cưng Spa",
        "default_paper": "K80",
        "default_orientation": "portrait",
        "tokens": [
            {"key": "ten_cua_hang", "label": "Tên Spa thú cưng", "group": "Spa"},
            {"key": "ma_phieu_spa", "label": "Mã phiếu tiếp nhận", "group": "Spa"},
            {"key": "ngay_gio", "label": "Thời gian nhận bé", "group": "Spa"},
            {"key": "ten_khach", "label": "Tên chủ nuôi", "group": "Khách hàng"},
            {"key": "sdt_khach", "label": "SĐT chủ nuôi", "group": "Khách hàng"},
            {"key": "ten_pet", "label": "Tên bé cưng", "group": "Thú cưng"},
            {"key": "giong_loai", "label": "Giống loài & Cân nặng", "group": "Thú cưng"},
            {"key": "tinh_trang_pet", "label": "Tình trạng khi nhận", "group": "Thú cưng"},
            {"key": "ky_thuat_vien", "label": "Kỹ thuật viên thực hiện", "group": "Spa"},
            {"key": "tong_chi_phi", "label": "Chi phí dự kiến", "group": "Thanh toán"},
            {"key": "so_du_vi", "label": "Số dư ví thành viên", "group": "Thanh toán"},
            {"key": "ghi_chu_dan_do", "label": "Dặn dò đặc biệt", "group": "Thú cưng"}
        ]
    }
}

DEFAULT_DOCUMENT_TEMPLATES = {
    "pos_retail": """<div style="font-family: Arial, sans-serif; width: 100%; max-width: 80mm; margin: 0 auto; padding: 4px; font-size: 12px; line-height: 1.4; color: #000;">
    <div style="text-align: center; margin-bottom: 8px;">
        <h2 style="margin: 0; font-size: 16px; font-weight: bold;">{{ten_cua_hang}}</h2>
        <p style="margin: 2px 0; font-size: 11px;">Đ/C: {{dia_chi}}</p>
        <p style="margin: 2px 0; font-size: 11px;">Hotline: {{so_dien_thoai}}</p>
        <h3 style="margin: 8px 0 2px 0; font-size: 14px; text-transform: uppercase; font-weight: 800;">HÓA ĐƠN BÁN HÀNG</h3>
        <p style="margin: 0; font-size: 11px;">Mã ĐH: {{ma_hoa_don}} · Ngày: {{ngay_gio}}</p>
    </div>
    
    <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; margin-bottom: 6px; font-size: 11px;">
        <div>Thu ngân: {{thu_ngan}}</div>
        <div>Khách hàng: {{ten_khach}} - {{sdt_khach}}</div>
    </div>

    <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px;">
        <thead>
            <tr style="border-bottom: 1px dashed #000;">
                <th style="text-align: left; padding: 3px 0;">Tên món</th>
                <th style="text-align: center; width: 28px;">SL</th>
                <th style="text-align: right; width: 60px;">Đ.Giá</th>
                <th style="text-align: right; width: 68px;">T.Tiền</th>
            </tr>
        </thead>
        <tbody>
            {{#danh_sach_hang}}
            <tr>
                <td style="padding: 3px 0;" colspan="4"><strong>{{ten_hang}}</strong></td>
            </tr>
            <tr style="border-bottom: 0.5px dotted #ddd;">
                <td></td>
                <td style="text-align: center;">{{so_luong}}</td>
                <td style="text-align: right;">{{don_gia}}</td>
                <td style="text-align: right;">{{thanh_tien}}</td>
            </tr>
            {{/danh_sach_hang}}
        </tbody>
    </table>

    <div style="border-top: 1px dashed #000; padding-top: 4px; font-size: 11px;">
        <div style="display: flex; justify-content: space-between;"><span>Tổng tiền hàng:</span><span>{{tong_tien}}</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Chiết khấu:</span><span>{{giam_gia}}</span></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; margin: 3px 0;"><span>KHÁCH PHẢI TRẢ:</span><span>{{phai_tra}}</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Tiền khách đưa:</span><span>{{khach_tra}}</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Còn nợ:</span><span>{{con_no}}</span></div>
    </div>

    <div style="text-align: center; margin-top: 12px; border-top: 1px dashed #000; padding-top: 6px; font-size: 11px;">
        <p style="margin: 0; font-style: italic;">{{loi_cam_on}}</p>
    </div>
</div>""",
    "oem_order": """<div style="font-family: 'Times New Roman', Times, serif; width: 100%; max-width: 210mm; margin: 0 auto; padding: 15mm; font-size: 13px; line-height: 1.5; color: #000;">
    <div style="text-align: center; margin-bottom: 12px;">
        <h3 style="margin: 0; font-size: 14px; text-transform: uppercase;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h3>
        <p style="margin: 2px 0; font-weight: bold; text-decoration: underline;">Độc lập - Tự do - Hạnh phúc</p>
    </div>

    <div style="text-align: center; margin: 15px 0 12px 0;">
        <h2 style="margin: 0; font-size: 18px; font-weight: bold; text-transform: uppercase;">PHỤ LỤC HỢP ĐỒNG ĐẶT HÀNG GIA CÔNG OEM</h2>
        <p style="margin: 3px 0; font-style: italic;">Số: {{ma_don_oem}} · Ngày lập: {{ngay_lap}}</p>
    </div>

    <div style="margin-bottom: 10px;">
        <p style="margin: 3px 0;"><strong>BÊN A (Bên Đặt Gia Công):</strong> {{ten_cua_hang}}</p>
        <p style="margin: 3px 0;">Địa chỉ: {{dia_chi}} · Hotline: {{so_dien_thoai}}</p>
        <p style="margin: 3px 0;"><strong>BÊN B (Xưởng Nhận Gia Công):</strong> {{xuong_gia_cong}}</p>
        <p style="margin: 3px 0;">SĐT Xưởng: {{sdt_xuong}} · Kho nhận: {{kho_xuong}}</p>
        <p style="margin: 3px 0;">Hạn giao thành phẩm: <strong>{{ngay_hen_giao}}</strong></p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin: 12px 0;" border="1">
        <thead>
            <tr style="background-color: #f2f2f2; font-weight: bold; text-align: center;">
                <th style="padding: 6px; width: 40px;">TT</th>
                <th style="padding: 6px; width: 80px;">Mã GC</th>
                <th style="padding: 6px;">Tên Sản Phẩm Gia Công</th>
                <th style="padding: 6px; width: 80px;">Số Lượng</th>
                <th style="padding: 6px; width: 100px;">Đơn Giá (VNĐ)</th>
                <th style="padding: 6px; width: 110px;">Thành Tiền (VNĐ)</th>
            </tr>
        </thead>
        <tbody>
            {{#danh_sach_hang}}
            <tr>
                <td style="padding: 5px; text-align: center;">{{stt}}</td>
                <td style="padding: 5px; text-align: center;"><strong>{{ma_gc}}</strong></td>
                <td style="padding: 5px;">{{ten_hang}}</td>
                <td style="padding: 5px; text-align: right; font-weight: bold;">{{so_luong}}</td>
                <td style="padding: 5px; text-align: right;">{{don_gia}}</td>
                <td style="padding: 5px; text-align: right; font-weight: bold;">{{thanh_tien}}</td>
            </tr>
            {{/danh_sach_hang}}
        </tbody>
    </table>

    <div style="margin-left: auto; width: 340px; margin-top: 10px;">
        <div style="display: flex; justify-content: space-between; padding: 2px 0;"><span>Thành tiền trước thuế:</span><strong>{{tong_tien_raw}} đ</strong></div>
        <div style="display: flex; justify-content: space-between; padding: 2px 0;"><span>Chiết khấu ({{discount_percent}}%):</span><span>-{{tien_chiet_khau}} đ</span></div>
        <div style="display: flex; justify-content: space-between; padding: 2px 0;"><span>Thuế VAT ({{vat_percent}}%):</span><span>+{{tien_vat}} đ</span></div>
        <div style="display: flex; justify-content: space-between; padding: 4px 0; border-top: 1px solid #000; font-size: 14px;"><span>TỔNG THANH TOÁN:</span><strong>{{tong_thanh_toan}} đ</strong></div>
        <div style="display: flex; justify-content: space-between; padding: 2px 0; color: #006600;"><span>Đã thanh toán đợt 1 (Cọc 50%):</span><strong>{{tien_coc}} đ</strong></div>
        <div style="display: flex; justify-content: space-between; padding: 2px 0; color: #cc0000;"><span>Thanh toán còn lại khi nhận:</span><strong>{{con_lai}} đ</strong></div>
    </div>

    <div style="display: flex; justify-content: space-between; margin-top: 35px; text-align: center;">
        <div><strong>ĐẠI DIỆN BÊN A</strong><br><br><br><br><em>(Ký, ghi rõ họ tên)</em></div>
        <div><strong>THỦ KHO NHẬN</strong><br><br><br><br><em>(Ký, ghi rõ họ tên)</em></div>
        <div><strong>ĐẠI DIỆN BÊN B (XƯỞNG)</strong><br><br><br><br><em>(Ký, ghi rõ họ tên)</em></div>
    </div>
</div>"""
}

@router.get("/print-templates/{doc_type}")
def get_universal_print_template(doc_type: str):
    """Lấy mẫu in HTML và danh sách tokens theo nghiệp vụ"""
    meta = DOCUMENT_PRINT_METADATA.get(doc_type, DOCUMENT_PRINT_METADATA["pos_retail"])
    conn = get_db()
    cur = conn.cursor()
    
    # 1. Đọc template tùy biến từ bảng settings nếu có
    cur.execute("SELECT value FROM settings WHERE key = ?", (f"print_template_{doc_type}",))
    row = cur.fetchone()
    content_html = row[0] if (row and row[0]) else DEFAULT_DOCUMENT_TEMPLATES.get(doc_type, DEFAULT_DOCUMENT_TEMPLATES["pos_retail"])
    
    # 2. Đọc cấu hình khổ giấy & orientation
    cur.execute("SELECT value FROM settings WHERE key = ?", (f"print_config_{doc_type}",))
    cfg_row = cur.fetchone()
    paper_size = meta["default_paper"]
    orientation = meta["default_orientation"]
    if cfg_row and cfg_row[0]:
        try:
            cfg = json.loads(cfg_row[0])
            paper_size = cfg.get("paper_size", paper_size)
            orientation = cfg.get("orientation", orientation)
        except Exception:
            pass
            
    conn.close()
    return {
        "doc_type": doc_type,
        "title": meta["title"],
        "paper_size": paper_size,
        "orientation": orientation,
        "content_html": content_html,
        "tokens": meta["tokens"]
    }

@router.post("/print-templates/{doc_type}")
def save_universal_print_template(doc_type: str, req: UniversalPrintTemplateSaveReq):
    """Lưu mẫu in HTML và khổ giấy tùy biến"""
    conn = get_db()
    cur = conn.cursor()
    
    # Lưu nội dung HTML
    cur.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
        (f"print_template_{doc_type}", req.content_html, req.content_html)
    )
    
    # Lưu cấu hình khổ giấy
    cfg_json = json.dumps({"paper_size": req.paper_size, "orientation": req.orientation}, ensure_ascii=False)
    cur.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
        (f"print_config_{doc_type}", cfg_json, cfg_json)
    )
    
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Đã lưu mẫu in thành công"}

@router.get("/print-templates/{doc_type}/sample-data")
def get_universal_print_sample_data(doc_type: str):
    """Cung cấp dữ liệu mẫu thực tế của từng nghiệp vụ để Live Preview"""
    if doc_type == "oem_order":
        return {
            "ten_cua_hang": "MASTERCARE FOR PET VIETNAM",
            "dia_chi": "12 Trần Phú, P. Lộc Thọ, Nha Trang",
            "so_dien_thoai": "0905 123 456",
            "ma_don_oem": "OEM-20261013-001",
            "ngay_lap": "13/10/2026",
            "ngay_hen_giao": "18/10/2026",
            "xuong_gia_cong": "Lucky Star (Xưởng Mỹ Phẩm & Dung Dịch)",
            "sdt_xuong": "0912 345 678",
            "kho_xuong": "Kho Xưởng Lucky Star Long An",
            "tong_tien_raw": "91.440.000",
            "discount_percent": "5.0",
            "tien_chiet_khau": "4.572.000",
            "vat_percent": "8.0",
            "tien_vat": "7.315.200",
            "tong_thanh_toan": "98.755.200",
            "tien_coc": "49.377.600",
            "con_lai": "44.805.600",
            "ghi_chu": "Sản xuất theo tiêu chuẩn phụ lục 07. Giao hàng đúng hạn.",
            "danh_sach_hang": [
                {"stt": 1, "ma_gc": "GC244", "ten_hang": "Nước Lau Sàn Thú Cưng - Hương Chanh Sả 1L", "so_luong": "1.500", "don_gia": "18.288", "thanh_tien": "27.432.000"},
                {"stt": 2, "ma_gc": "GC245", "ten_hang": "Nước Lau Sàn Thú Cưng - Hương Quế Cam 1L", "so_luong": "1.000", "don_gia": "18.288", "thanh_tien": "18.288.000"},
                {"stt": 3, "ma_gc": "GC246", "ten_hang": "Nước Lau Sàn Thú Cưng - Hương Cà Phê 1L", "so_luong": "1.000", "don_gia": "18.288", "thanh_tien": "18.288.000"},
                {"stt": 4, "ma_gc": "GC247", "ten_hang": "Nước Lau Sàn Thú Cưng - Hương Bạc Hà 1L", "so_luong": "1.500", "don_gia": "18.288", "thanh_tien": "27.432.000"}
            ]
        }
    elif doc_type == "cashbook_voucher":
        return {
            "ten_cua_hang": "MASTERCARE PET",
            "ma_phieu": "PT-20261013-001",
            "ngay_gio": "13/10/2026 15:30",
            "loai_phieu": "PHIẾU THU TIỀN",
            "hang_muc": "Thu tiền bán hàng đại lý",
            "nguoi_giao_dich": "Đại lý Phước Long",
            "so_tien": "5.000.000 đ",
            "so_tien_chu": "Năm triệu đồng chẵn",
            "ly_do": "Thanh toán công nợ đơn hàng sỉ",
            "nguon_quy": "Quỹ Tiền Mặt Công Ty"
        }
    else: # pos_retail, pos_b2b, etc.
        return {
            "ten_cua_hang": "MASTERCARE PET NHA TRANG",
            "dia_chi": "12 Trần Phú, P. Lộc Thọ, Nha Trang",
            "so_dien_thoai": "0905 123 456",
            "ma_hoa_don": "HD261013142530",
            "ngay_gio": "13/10/2026 14:25",
            "thu_ngan": "Ngọc Anh",
            "ten_khach": "Anh Phú (Bến Tre)",
            "sdt_khach": "0938 222 111",
            "tong_tien": "361.000 đ",
            "giam_gia": "20.000 đ",
            "phai_tra": "341.000 đ",
            "khach_tra": "350.000 đ",
            "con_no": "0 đ (Tiền thừa: 9.000 đ)",
            "hinh_thuc_tt": "Chuyển khoản (VietQR MBBank)",
            "loi_cam_on": "Cảm ơn quý khách! Hẹn gặp lại bé cưng.",
            "danh_sach_hang": [
                {"stt": 1, "ten_hang": "Pate Whiskas cá ngừ 85g", "so_luong": "12", "don_gia": "18.000", "thanh_tien": "216.000"},
                {"stt": 2, "ten_hang": "Sữa tắm dưỡng lông Bio 450ml", "so_luong": "1", "don_gia": "145.000", "thanh_tien": "145.000"}
            ]
        }








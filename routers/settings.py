from fastapi import APIRouter, HTTPException, Depends
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
MODULE_KEYS = ["module_oem", "module_pet_services", "module_price_lists", "module_hotel"]

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
    conn = get_db()
    cur = conn.cursor()
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






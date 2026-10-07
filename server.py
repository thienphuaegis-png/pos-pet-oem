import os
import sys
import secrets
import logging
from fastapi import FastAPI, Response, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

# Bảo mật: tự sinh POS_JWT_SECRET vào .env nếu chưa có, load trước khi import router nào dùng SECRET
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if not os.path.exists(_env_path):
    try:
        with open(_env_path, "w") as f:
            f.write(f"POS_JWT_SECRET={secrets.token_hex(32)}\n")
    except OSError:
        pass
from dotenv import load_dotenv
load_dotenv(_env_path)
if not os.environ.get("POS_JWT_SECRET"):
    os.environ["POS_JWT_SECRET"] = secrets.token_hex(32)

# Thiết lập ghi log ra file pos_app.log và console
stdout_stream = sys.stdout if sys.stdout is not None else open(os.devnull, "w", encoding="utf-8")
handlers = [logging.StreamHandler(stdout_stream)]
if not os.environ.get("VERCEL"):
    try:
        log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, "pos_app.log")
        handlers.append(logging.FileHandler(log_file, encoding="utf-8"))
    except OSError:
        pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s]: %(message)s",
    handlers=handlers
)
logger = logging.getLogger("pos_server")

# Ánh xạ URL prefix sang tên module để dispatch log riêng
PATH_MODULE_MAP = [
    ("/api/products", "products"),
    ("/api/categories", "categories"),
    ("/api/orders", "pos"),
    ("/api/staff", "pos"),
    ("/api/combos", "combos"),
    ("/api/inventory", "inventory"),
    ("/api/ingredients", "inventory"),
    ("/api/warehouses", "inventory"),
    ("/api/bom", "bom"),
    ("/api/contacts", "partners"),
    ("/api/purchases", "purchases"),
    ("/api/production", "production"),
    ("/api/cashbook", "cashbook"),
    ("/api/reports", "cashbook"),
    ("/api/settings", "settings"),
    ("/api/promotions", "promotions"),
    ("/api/pricing", "promotions"),
    ("/api/topup", "pos"),
]

def resolve_module_name(path: str) -> str:
    for prefix, mod_name in PATH_MODULE_MAP:
        if path.startswith(prefix):
            return mod_name
    return "pos_server"

from logger_config import get_module_logger

from database import init_db

# Import các Router nghiệp vụ
from routers.settings import router as settings_router
from routers.categories import router as categories_router, spa_cat_router
from routers.products import router as products_router
from routers.pos import router as pos_router
from routers.inventory import router as inventory_router
from routers.bom import router as bom_router
from routers.partners import router as partners_router, pets_router, service_router
from routers.purchases import router as purchases_router
from routers.production import router as production_router
from routers.auth import router as auth_router
from routers.shifts import router as shifts_router
from routers.cashbook import router as cashbook_router
from routers.combos import router as combos_router
from routers.price_lists import router as price_lists_router
from routers.price_lists import router_segments
from routers.promotions import router as promotions_router
from routers.oem import router as oem_router
from routers.topup import router as topup_router
from routers.hotel import router as hotel_router
from routers.ai_assistant import router as ai_assistant_router

app = FastAPI(title="POS KiotViet Offline")

# Middleware ghi log tất cả request và bắt lỗi ngoại lệ
@app.middleware("http")
async def log_requests(request: Request, call_next):
    mod_name = resolve_module_name(request.url.path)
    mod_logger = get_module_logger(mod_name)
    try:
        response = await call_next(request)
        if response.status_code >= 400 and request.url.path != "/favicon.ico":
            mod_logger.warning(f"{request.method} {request.url.path} - Status: {response.status_code}")
        return response
    except Exception as exc:
        mod_logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}", exc_info=True)
        raise exc

# Middleware ghi activity_log: moi request ghi du lieu (POST/PUT/DELETE) thanh cong -> luu lai ai lam gi
@app.middleware("http")
async def activity_log_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.method in ("POST", "PUT", "DELETE") and response.status_code < 400:
        try:
            from activity_logger import log_activity_from_request
            log_activity_from_request(request, response)
        except Exception:
            logger.error("Ghi activity_log that bai", exc_info=True)
    return response

# Khởi tạo database
init_db()

# Khởi động backup tự động (local rotating + cloud Google Drive, mỗi giờ)
if not os.environ.get("VERCEL"):
    from backup_service import start_backup_scheduler
    start_backup_scheduler()
    try:
        from services.telegram_bot import start_telegram_bot_service
        start_telegram_bot_service()
    except Exception as e:
        logger.error(f"Khởi động Telegram Bot Service thất bại: {e}")

# Mount static files
def find_resource_path(relative_path: str) -> str:
    """Tìm đường dẫn tài nguyên (templates, static) tương thích cả khi chạy source Python lẫn khi đóng gói PyInstaller .exe"""
    candidates = []
    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable)
        # Ưu tiên thư mục tài nguyên bên ngoài do git pull cập nhật
        candidates.append(os.path.join(exe_dir, relative_path))
        candidates.append(os.path.join(exe_dir, "_internal", relative_path))
        if hasattr(sys, '_MEIPASS'):
            candidates.append(os.path.join(sys._MEIPASS, relative_path))
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates.append(os.path.join(script_dir, relative_path))
    candidates.append(os.path.join(os.getcwd(), relative_path))

    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]

def get_base_dir():
    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable)
        # Ưu tiên thư mục templates thật bên ngoài (do git pull cập nhật)
        if os.path.exists(os.path.join(exe_dir, 'templates')):
            return exe_dir
        if os.path.exists(os.path.join(exe_dir, '_internal', 'templates')):
            return os.path.join(exe_dir, '_internal')
        if hasattr(sys, '_MEIPASS') and os.path.exists(os.path.join(sys._MEIPASS, 'templates')):
            return sys._MEIPASS
        return exe_dir
    return os.path.dirname(os.path.abspath(__file__))

base_dir = get_base_dir()
static_dir = find_resource_path("static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

_branding_cache = None

def invalidate_branding_cache():
    global _branding_cache
    _branding_cache = None

def get_branding_settings():
    global _branding_cache
    if _branding_cache is not None:
        return _branding_cache
    try:
        from database import get_db
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT key, value FROM settings WHERE key IN ('app_name', 'shop_logo')")
        rows = dict(cur.fetchall())
        conn.close()
        _branding_cache = {
            "app_name": rows.get("app_name") or "⚡ POS Offline",
            "shop_logo": rows.get("shop_logo") or ""
        }
    except Exception:
        _branding_cache = {"app_name": "⚡ POS Offline", "shop_logo": ""}
    return _branding_cache

def get_template_path():
    return find_resource_path(os.path.join("templates", "index.html"))

def get_pos_template_path():
    return find_resource_path(os.path.join("templates", "pos.html"))

def get_pos_mobile_template_path():
    return find_resource_path(os.path.join("templates", "pos_mobile.html"))

APP_VERSION = "3.0"  # đồng bộ với PROJECT_STATE.md

@app.get("/api/ping", include_in_schema=False)
def ping():
    """Máy con quét LAN gọi endpoint này để nhận diện đúng máy chủ POS.

    Cố ý KHÔNG yêu cầu auth: máy con phải dò được server trước khi có ai
    đăng nhập. An toàn vì chỉ trả tên app + version + hostname, tuyệt đối
    không có dữ liệu kinh doanh (test_ping_endpoint.py canh điều này).
    """
    import socket
    return {"app": "pos-offline-petcare", "version": APP_VERSION,
            "hostname": socket.gethostname()}

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)

@app.get("/", response_class=HTMLResponse)
def index():
    path = get_template_path()
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            html = f.read()
        branding = get_branding_settings()
        app_name = branding.get("app_name") or "⚡ POS Offline"
        shop_logo = branding.get("shop_logo") or ""

        import re
        # Inject app_name vào title và login-store-name
        html = re.sub(r'<title>.*?</title>', f'<title>{app_name}</title>', html, count=1)
        html = re.sub(
            r'(<div\s+id="login-store-name"[^>]*>)(.*?)(</div>)',
            rf'\g<1>{app_name}\g<3>',
            html,
            count=1
        )

        if shop_logo:
            # Ẩn icon mặc định và hiện logo
            html = re.sub(
                r'(<span\s+id="login-store-icon"[^>]*style=")([^"]*)(")',
                r'\g<1>display:none;\g<2>\g<3>',
                html,
                count=1
            )
            html = re.sub(
                r'(<img\s+id="login-store-logo"[^>]*src=")([^"]*)("[^>]*style=")([^"]*)(")',
                rf'\g<1>{shop_logo}\g<3>display:block;max-height:64px;max-width:200px;object-fit:contain\g<5>',
                html,
                count=1
            )
        return html
    return "<h1>UI template not found</h1>"

@app.get("/pos", response_class=HTMLResponse)
def pos_page():
    path = get_pos_template_path()
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>POS template not found</h1>"

@app.get("/pos/m", response_class=HTMLResponse)
def pos_mobile_page():
    path = get_pos_mobile_template_path()
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>POS Mobile template not found</h1>"

# Đăng ký toàn bộ các sub-routers
app.include_router(auth_router)
app.include_router(shifts_router)
app.include_router(combos_router)
app.include_router(settings_router)
app.include_router(categories_router)
app.include_router(spa_cat_router)
app.include_router(products_router)
app.include_router(pos_router)
app.include_router(inventory_router)
app.include_router(bom_router)
app.include_router(partners_router)
app.include_router(pets_router)
app.include_router(service_router)
app.include_router(purchases_router)
app.include_router(production_router)
app.include_router(cashbook_router)
app.include_router(price_lists_router)
app.include_router(router_segments)
app.include_router(promotions_router)
app.include_router(oem_router)
app.include_router(topup_router)
app.include_router(hotel_router)
app.include_router(ai_assistant_router)
 

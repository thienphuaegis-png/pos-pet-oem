import os
import sys
import logging
from fastapi import FastAPI, Response, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

# Thiết lập ghi log ra file pos_app.log và console
log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "pos_app.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(log_file, encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("pos_server")

from database import init_db

# Import các Router nghiệp vụ
from routers.settings import router as settings_router
from routers.products import router as products_router
from routers.pos import router as pos_router
from routers.inventory import router as inventory_router
from routers.bom import router as bom_router
from routers.partners import router as partners_router
from routers.purchases import router as purchases_router
from routers.production import router as production_router
from routers.cashbook import router as cashbook_router

app = FastAPI(title="POS KiotViet Offline")

# Middleware ghi log tất cả request và bắt lỗi ngoại lệ
@app.middleware("http")
async def log_requests(request: Request, call_next):
    try:
        response = await call_next(request)
        if response.status_code >= 400 and request.url.path != "/favicon.ico":
            logger.warning(f"{request.method} {request.url.path} - Status: {response.status_code}")
        return response
    except Exception as exc:
        logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}", exc_info=True)
        raise exc

# Khởi tạo database
init_db()

# Mount static files
def get_base_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

base_dir = get_base_dir()
static_dir = os.path.join(base_dir, "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

def get_template_path():
    return os.path.join(base_dir, "templates", "index.html")

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)

@app.get("/", response_class=HTMLResponse)
def index():
    path = get_template_path()
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>UI template not found</h1>"

# Đăng ký toàn bộ các sub-routers
app.include_router(settings_router)
app.include_router(products_router)
app.include_router(pos_router)
app.include_router(inventory_router)
app.include_router(bom_router)
app.include_router(partners_router)
app.include_router(purchases_router)
app.include_router(production_router)
app.include_router(cashbook_router)

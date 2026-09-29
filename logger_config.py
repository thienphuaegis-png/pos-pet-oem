import os
import sys
import logging
from logging.handlers import RotatingFileHandler

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
try:
    if not os.environ.get("VERCEL"):
        os.makedirs(LOG_DIR, exist_ok=True)
except OSError:
    pass

_LOG_FORMAT = "%(asctime)s [%(levelname)s] [%(name)s]: %(message)s"
_formatter = logging.Formatter(_LOG_FORMAT)

def get_module_logger(module_name: str) -> logging.Logger:
    """
    Tạo hoặc lấy logger riêng cho từng module nghiệp vụ.
    Mỗi module sẽ ghi log vào file logs/{module_name}.log riêng biệt (nếu ghi được đĩa)
    đồng thời ghi vào pos_app.log tổng hợp hoặc console.
    """
    logger = logging.getLogger(module_name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    logger.propagate = True  # Để root logger ghi vào pos_app.log và console

    if not os.environ.get("VERCEL"):
        try:
            module_log_path = os.path.join(LOG_DIR, f"{module_name}.log")
            handler = RotatingFileHandler(
                module_log_path,
                maxBytes=5 * 1024 * 1024,
                backupCount=3,
                encoding="utf-8"
            )
            handler.setFormatter(_formatter)
            logger.addHandler(handler)
        except OSError:
            pass

    return logger

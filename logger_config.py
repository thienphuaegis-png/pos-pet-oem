import os
import logging
from logging.handlers import RotatingFileHandler

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

_LOG_FORMAT = "%(asctime)s [%(levelname)s] [%(name)s]: %(message)s"
_formatter = logging.Formatter(_LOG_FORMAT)

def get_module_logger(module_name: str) -> logging.Logger:
    """
    Tạo hoặc lấy logger riêng cho từng module nghiệp vụ.
    Mỗi module sẽ ghi log vào file logs/{module_name}.log riêng biệt
    đồng thời ghi vào pos_app.log tổng hợp.
    """
    logger = logging.getLogger(module_name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    logger.propagate = True  # Để root logger ghi vào pos_app.log và console

    # Handler riêng cho file log của module
    module_log_path = os.path.join(LOG_DIR, f"{module_name}.log")
    handler = RotatingFileHandler(
        module_log_path,
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8"
    )
    handler.setFormatter(_formatter)
    logger.addHandler(handler)

    return logger

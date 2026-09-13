import uvicorn
import webbrowser
import threading
import time
import os
import sys

def open_browser():
    time.sleep(1.2)
    webbrowser.open("http://127.0.0.1:8989")

if __name__ == "__main__":
    # Bat thread mo trinh duyet tu dong
    threading.Thread(target=open_browser, daemon=True).start()
    
    print("="*50)
    print("  HE THONG POS OFFLINE DANG CHAY TAI: http://127.0.0.1:8989")
    print("  Khong dong cua so nay trong khi su dung.")
    print("="*50)

    from server import app
    uvicorn.run(app, host="127.0.0.1", port=8989, log_level="error")

import os
import uvicorn

port = int(os.environ.get("POS_PORT", "8998"))
TAILSCALE_URL = "http://pos-server:8998"

if __name__ == "__main__":
    from server import app
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")

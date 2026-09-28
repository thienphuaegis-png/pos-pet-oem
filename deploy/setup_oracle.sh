#!/usr/bin/env bash
# ============================================================
# POS PET OEM - SCRIPT TỰ ĐỘNG CÀI ĐẶT TRÊN ORACLE CLOUD UBUNTU
# Chạy với quyền root: sudo bash setup_oracle.sh
# ============================================================
set -euo pipefail

echo "=================================================="
echo "  CAI DAT POS PET OEM TREN ORACLE CLOUD UBUNTU"
echo "=================================================="

# 1. Update & Cai package can thiet
echo "[1/6] Cap nhat he thong va cai Python 3, Git, Nginx..."
apt-get update -y
apt-get install -y python3 python3-venv python3-pip git curl nginx certbot python3-certbot-nginx

# 2. Tao user rieng pos chay service (khong dung root)
if ! id -u pos >/dev/null 2>&1; then
    useradd -m -s /bin/bash pos
fi

# 3. Thu muc du an
INSTALL_DIR="/home/pos/pos-pet-oem"
echo "[2/6] Thiet lap thu muc $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
chown -R pos:pos /home/pos

# 4. Mo Firewall Ubuntu (Oracle Cloud yeu cau mo iptables)
echo "[3/6] Mo firewall cong 80, 443 va 8999..."
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT || true
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT || true
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8999 -j ACCEPT || true
netfilter-persistent save 2>/dev/null || true

# 5. Tao Systemd Service de POS tu chay 24/7 va tu bat lai khi reboot
echo "[4/6] Tao systemd service pos-pet-oem..."
cat << 'EOF' > /etc/systemd/system/pos-pet-oem.service
[Unit]
Description=POS Pet Care OEM FastAPI Server
After=network.target

[Service]
User=pos
Group=pos
WorkingDirectory=/home/pos/pos-pet-oem
Environment="PATH=/home/pos/pos-pet-oem/.venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/home/pos/pos-pet-oem/.venv/bin/python main.py
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

# 6. Cau hinh Nginx Reverse Proxy
echo "[5/6] Cau hinh Nginx Reverse Proxy..."
cat << 'EOF' > /etc/nginx/sites-available/pos
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8999;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/pos /etc/nginx/sites-enabled/pos
nginx -t && systemctl restart nginx

echo "=================================================="
echo "  CHUAN BI MOI TRUONG HOAN TAT!"
echo "  Buoc tiep theo: Clone code tu GitHub va bat dau chay."
echo "=================================================="

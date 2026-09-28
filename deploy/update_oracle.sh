#!/usr/bin/env bash
# ============================================================
# POS PET OEM - SCRIPT CẬP NHẬT TRÊN ORACLE CLOUD
# Chạy dưới quyền user pos: bash update_oracle.sh
# ============================================================
set -euo pipefail

cd /home/pos/pos-pet-oem

echo "=================================================="
echo "  CAP NHAT POS PET OEM (ORACLE CLOUD)"
echo "=================================================="

# 1. Sao luu DB an toan
if [ -f "data/pos.db" ]; then
    mkdir -p data/backups
    STAMP=$(date +%Y%m%d_%H%M%S)
    cp "data/pos.db" "data/backups/pos_truoc_capnhat_${STAMP}.db"
    echo "✅ Da sao luu DB: data/backups/pos_truoc_capnhat_${STAMP}.db"
fi

# 2. Keo code moi tu GitHub
echo "🚀 Dang keo code moi..."
git pull --ff-only

# 3. Cap nhat thu vien neu co
echo "📦 Kiem tra thu vien..."
.venv/bin/pip install -r requirements.txt -q

# 4. Khoi dong lai service
echo "🔄 Khoi dong lai may chu POS..."
sudo systemctl restart pos-pet-oem

echo "=================================================="
echo "  CAP NHAT THANH CONG! He thong dang hoat dong."
echo "=================================================="

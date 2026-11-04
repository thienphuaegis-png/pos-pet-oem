#!/usr/bin/env bash
# ==============================================================================
# POS MASTERCARE — BO DIEU KHIEN 2 MAY CHU CHO LINUX (DESKTOP & VPS SSH)
# Ho tro: Ubuntu / Debian / Linux Mint / CentOS / AlmaLinux / WSL2
#   - Cong 8998: Chi nhanh 1 (MCare - DB: data/pos.db)
#   - Cong 8997: Chi nhanh 2 (PetNT - DB: data/pos_instance2.db)
# Cach dung:
#   chmod +x pos_server.sh
#   ./pos_server.sh install   # Cai .venv + systemd tu chay ngam 2 cong khi reboot
#   ./pos_server.sh funnel    # Cai & bat 2 cong Tailscale Funnel (443 & 8443) + Vercel
#   ./pos_server.sh status    # Xem bang Clean TUI (hoac mo Web Panel tren Desktop)
#   ./pos_server.sh restart   # Khoi dong lai 2 may chu
#   ./pos_server.sh update    # Sao luu DB + git pull + nang cap schema + restart
#   ./pos_server.sh stop      # Tam dung 2 may chu
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8

step_ok()   { printf "  [OK]   %s\n" "$1"; }
step_info() { printf "  [..]   %s\n" "$1"; }
step_warn() { printf "  [!!]   %s\n" "$1"; }
step_err()  { printf "  [ERR]  %s\n" "$1" >&2; }

find_sys_python() {
    for candidate in python3.12 python3.11 python3.10 python3; do
        if command -v "$candidate" >/dev/null 2>&1; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

ensure_venv() {
    if [ ! -x "$ROOT_DIR/.venv/bin/python" ]; then
        SYS_PY="$(find_sys_python || true)"
        if [ -z "$SYS_PY" ]; then
            step_info "Chua co Python 3, dang cai dat qua trinh quan ly goi..."
            if command -v apt-get >/dev/null 2>&1; then
                sudo apt-get update -qq && sudo apt-get install -y python3 python3-venv python3-pip curl git
            elif command -v dnf >/dev/null 2>&1; then
                sudo dnf install -y python3 python3-pip curl git
            fi
            SYS_PY="$(find_sys_python)"
        fi
        step_info "Tao moi truong ao .venv bang $SYS_PY..."
        "$SYS_PY" -m venv "$ROOT_DIR/.venv" || {
            if command -v apt-get >/dev/null 2>&1; then
                sudo apt-get update -qq && sudo apt-get install -y python3-venv
                "$SYS_PY" -m venv "$ROOT_DIR/.venv"
            fi
        }
    fi
    step_info "Dong bo thu vien Python (requirements.txt)..."
    "$ROOT_DIR/.venv/bin/python" -m pip install --quiet --upgrade pip
    "$ROOT_DIR/.venv/bin/python" -m pip install --quiet -r "$ROOT_DIR/requirements.txt"
    step_ok "Moi truong Python (.venv) da san sang."
}

migrate_both_dbs() {
    mkdir -p "$ROOT_DIR/data" "$ROOT_DIR/logs"
    step_info "Kiem tra & nang cap schema cho data/pos.db va data/pos_instance2.db..."
    POS_DB_PATH="$ROOT_DIR/data/pos.db" "$ROOT_DIR/.venv/bin/python" -c "import database; database.init_db()"
    POS_DB_PATH="$ROOT_DIR/data/pos_instance2.db" "$ROOT_DIR/.venv/bin/python" -c "import database; database.init_db()"
    step_ok "2 file co so du lieu tach biet hoan toan."
}

has_systemd() {
    [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1
}

install_systemd_units() {
    local run_user="${SUDO_USER:-$USER}"
    if ! has_systemd; then
        step_warn "May Linux nay khong dung systemd (Docker/WSL). Chuyen sang che do chay ngam nohup."
        start_nohup_servers
        return 0
    fi

    step_info "Dang ky dich vu chay ngam systemd cho cong 8998 va 8997..."
    sudo tee /etc/systemd/system/pos-petcare-8998.service >/dev/null <<EOF
[Unit]
Description=POS Mastercare Branch 1 (MCare - Port 8998)
After=network.target

[Service]
Type=simple
User=${run_user}
WorkingDirectory=${ROOT_DIR}
Environment="POS_PORT=8998"
Environment="POS_PRODUCTION=1"
Environment="POS_DB_PATH=${ROOT_DIR}/data/pos.db"
Environment="PYTHONUTF8=1"
ExecStart=${ROOT_DIR}/.venv/bin/python ${ROOT_DIR}/main.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

    sudo tee /etc/systemd/system/pos-petcare-8997.service >/dev/null <<EOF
[Unit]
Description=POS Mastercare Branch 2 (PetNT - Port 8997)
After=network.target

[Service]
Type=simple
User=${run_user}
WorkingDirectory=${ROOT_DIR}
Environment="POS_PORT=8997"
Environment="POS_PRODUCTION=1"
Environment="POS_SIBLING_MODE=1"
Environment="POS_DB_PATH=${ROOT_DIR}/data/pos_instance2.db"
Environment="PYTHONUTF8=1"
ExecStart=${ROOT_DIR}/.venv/bin/python ${ROOT_DIR}/main.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable --now pos-petcare-8998.service pos-petcare-8997.service
    step_ok "Da bat va ghim tu khoi dong cung Linux (systemd)."
}

start_nohup_servers() {
    mkdir -p "$ROOT_DIR/logs"
    stop_nohup_servers
    POS_PORT=8998 POS_PRODUCTION=1 POS_DB_PATH="$ROOT_DIR/data/pos.db" \
        nohup "$ROOT_DIR/.venv/bin/python" "$ROOT_DIR/main.py" >>"$ROOT_DIR/logs/server_8998.log" 2>&1 &
    POS_PORT=8997 POS_PRODUCTION=1 POS_SIBLING_MODE=1 POS_DB_PATH="$ROOT_DIR/data/pos_instance2.db" \
        nohup "$ROOT_DIR/.venv/bin/python" "$ROOT_DIR/main.py" >>"$ROOT_DIR/logs/server_8997.log" 2>&1 &
    sleep 2
}

stop_nohup_servers() {
    pkill -f "$ROOT_DIR/main.py" >/dev/null 2>&1 || true
}

cmd_start() {
    if has_systemd && [ -f /etc/systemd/system/pos-petcare-8998.service ]; then
        sudo systemctl start pos-petcare-8998.service pos-petcare-8997.service
    else
        start_nohup_servers
    fi
    cmd_status --no-browser
}

cmd_stop() {
    if has_systemd && [ -f /etc/systemd/system/pos-petcare-8998.service ]; then
        sudo systemctl stop pos-petcare-8998.service pos-petcare-8997.service
    fi
    stop_nohup_servers
    step_ok "Da dung ca 2 may chu POS (8998 & 8997)."
}

cmd_restart() {
    if has_systemd && [ -f /etc/systemd/system/pos-petcare-8998.service ]; then
        sudo systemctl restart pos-petcare-8998.service pos-petcare-8997.service
    else
        start_nohup_servers
    fi
    sleep 1
    cmd_status --no-browser
}

cmd_funnel() {
    ensure_venv
    if ! command -v tailscale >/dev/null 2>&1; then
        step_info "Chua co Tailscale tren Linux, dang cai tu dong tu tailscale.com..."
        curl -fsSL https://tailscale.com/install.sh | sh
    fi
    "$ROOT_DIR/.venv/bin/python" "$ROOT_DIR/scripts/setup_tailscale_dual.py" --open-panel
}

cmd_update() {
    ensure_venv
    mkdir -p "$ROOT_DIR/data/backups"
    STAMP="$(date +%Y%m%d_%H%M%S)"
    step_info "Tam dung may chu de sao luu an toan..."
    cmd_stop
    for db in pos.db pos_instance2.db; do
        if [ -f "$ROOT_DIR/data/$db" ]; then
            "$ROOT_DIR/.venv/bin/python" -c "import sqlite3; s=sqlite3.connect('data/$db'); d=sqlite3.connect('data/backups/pre_update_${STAMP}_${db}'); s.backup(d); d.close(); s.close()"
            step_ok "Da sao luu data/$db -> data/backups/pre_update_${STAMP}_${db}"
        fi
    done
    step_info "Keo ban cap nhat moi nhat tu GitHub..."
    git pull --ff-only origin main
    ensure_venv
    migrate_both_dbs
    cmd_start
}

cmd_status() {
    local extra_flag="${1:-}"
    if [ ! -x "$ROOT_DIR/.venv/bin/python" ]; then
        step_warn "Chua cai dat .venv. Chay: ./pos_server.sh install"
        exit 1
    fi
    "$ROOT_DIR/.venv/bin/python" "$ROOT_DIR/scripts/setup_tailscale_dual.py" --status-only $extra_flag
}

ACTION="${1:-}"
if [ -z "$ACTION" ]; then
    if [ -x "$ROOT_DIR/.venv/bin/python" ]; then
        ACTION="status"
    else
        ACTION="install"
    fi
fi

case "$ACTION" in
    install)
        ensure_venv
        migrate_both_dbs
        install_systemd_units
        sleep 1
        cmd_status
        ;;
    start)   cmd_start ;;
    stop)    cmd_stop ;;
    restart) cmd_restart ;;
    funnel)  cmd_funnel ;;
    update)  cmd_update ;;
    status)  shift || true; cmd_status "${1:-}" ;;
    *)
        echo "Cach dung: ./pos_server.sh {install|start|stop|restart|status|funnel|update}"
        exit 1
        ;;
esac

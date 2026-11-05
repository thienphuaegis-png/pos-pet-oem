"""Deploy tự động 2 domain Vercel (mcarepet.vercel.app & petnt.vercel.app):
- Phát trực tiếp toàn bộ /static/* từ Edge CDN Vercel (giảm tải 100% JS/CSS/font khỏi Tailscale Funnel)
- Proxy động (/ & /api/*) từ vùng hkg1 (Hong Kong) về máy chủ cửa hàng (8998 / 8997).
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE_DIR = os.path.join(BASE_DIR, "deploy", "vercel_bridge")
STATIC_DIR = os.path.join(BASE_DIR, "static")
AUTH_FILE = os.path.join(BASE_DIR, ".cf_auth.json")


def main():
    sync_env = "--sync-env" in sys.argv
    auth = {}
    if os.path.exists(AUTH_FILE):
        with open(AUTH_FILE, "r", encoding="utf-8") as f:
            auth = json.load(f)

    acc = auth.get("account_id", "")
    tok = auth.get("api_token", "")
    if sync_env and (not acc or not tok):
        print("[!!] Thiếu .cf_auth.json để đồng bộ biến môi trường Cloudflare D1!")
        return

    projects = [
        {
            "proj": "mcare-pos",
            "domain": "mcarepet.vercel.app",
            "db_id": "a18a2510-6fda-4aaf-93ab-c8a62fff752e",
            "store_name": "MCare POS (Chi nhánh Sài Gòn - Cổng 8998)",
        },
        {
            "proj": "petnt",
            "domain": "petnt.vercel.app",
            "db_id": "e2d15172-a16c-49a3-8484-c03f0e770198",
            "store_name": "PetNT POS (Chi nhánh Nha Trang - Cổng 8997)",
        },
    ]

    for p in projects:
        proj = p["proj"]
        domain = p["domain"]
        db_id = p["db_id"]
        store = p["store_name"]

        print("=" * 72)
        print(f"[..] Đang đóng gói & deploy Vercel Bridge + Static CDN [{proj}] -> https://{domain}")
        print("=" * 72)

        stage_dir = os.path.join(tempfile.gettempdir(), f"pos_bridge_{proj}")
        if os.path.exists(stage_dir):
            shutil.rmtree(stage_dir)

        shutil.copytree(
            BRIDGE_DIR,
            stage_dir,
            ignore=shutil.ignore_patterns(".vercel", ".env*", "nul", "NUL", "*.bak*"),
        )
        if os.path.exists(STATIC_DIR):
            shutil.copytree(
                STATIC_DIR,
                os.path.join(stage_dir, "public", "static"),
                ignore=shutil.ignore_patterns("mockups", "*.bak*", "nul", "NUL", "__pycache__"),
            )

        subprocess.run(f"npx vercel link --project {proj} --yes", shell=True, cwd=stage_dir, check=True)

        if sync_env:
            env_vars = {
                "CF_ACCOUNT_ID": acc,
                "CF_API_TOKEN": tok,
                "CF_D1_DATABASE_ID": db_id,
                "STORE_NAME": store,
            }
            for k, v in env_vars.items():
                cmd = f'npx vercel env add {k} --environment production,preview,development --value "{v}" --force --yes --project {proj}'
                subprocess.run(cmd, shell=True, cwd=stage_dir, check=True)

        subprocess.run(
            "npx vercel deploy --prod --yes",
            shell=True,
            cwd=stage_dir,
            check=True,
        )
        subprocess.run(f"npx vercel domains add {domain} {proj}", shell=True, cwd=stage_dir)
        print(f"[OK] Đã deploy thành công: https://{domain}\n")


if __name__ == "__main__":
    main()

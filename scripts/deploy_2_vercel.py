"""Deploy tự động 2 domain Vercel (mcarepet.vercel.app & petnt.vercel.app) làm Proxy thuần về 2 cổng 8998 & 8997."""
import json
import os
import subprocess

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE_DIR = os.path.join(BASE_DIR, "deploy", "vercel_bridge")
AUTH_FILE = os.path.join(BASE_DIR, ".cf_auth.json")


def main():
    if not os.path.exists(AUTH_FILE):
        print("❌ Không tìm thấy file .cf_auth.json để lấy thông tin Cloudflare D1!")
        return

    with open(AUTH_FILE, "r", encoding="utf-8") as f:
        auth = json.load(f)

    acc = auth.get("account_id")
    tok = auth.get("api_token")
    if not acc or not tok:
        print("❌ File .cf_auth.json thiếu account_id hoặc api_token!")
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
        print(f"🚀 Đang cấu hình và deploy Vercel Bridge [{proj}] -> https://{domain}...")
        print("=" * 72)

        # 1. Link project
        subprocess.run(f"npx vercel link --project {proj} --yes", shell=True, cwd=BRIDGE_DIR, check=True)

        # 2. Cài đặt biến môi trường
        env_vars = {
            "CF_ACCOUNT_ID": acc,
            "CF_API_TOKEN": tok,
            "CF_D1_DATABASE_ID": db_id,
            "STORE_NAME": store,
        }
        for k, v in env_vars.items():
            cmd = f'npx vercel env add {k} --environment production,preview,development --value "{v}" --force --yes --project {proj}'
            subprocess.run(cmd, shell=True, cwd=BRIDGE_DIR, check=True)

        # 3. Deploy Production
        subprocess.run(
            "npx vercel deploy --prod --yes --no-wait",
            shell=True,
            cwd=BRIDGE_DIR,
            check=True,
        )

        # 4. Gán domain
        subprocess.run(f"npx vercel domains add {domain} {proj}", shell=True, cwd=BRIDGE_DIR)
        print(f"✅ Đã deploy thành công Vercel Proxy: https://{domain} -> {store}\n")


if __name__ == "__main__":
    main()

"""Deploy tự động cả 2 domain Vercel (mcarepet.vercel.app & petnt.vercel.app) từ cùng 1 thư mục dự án."""
import os
import shutil
import subprocess
import tempfile

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

IGNORE_DIRS = {
    ".git", ".venv", ".ai", ".archify", ".ua", ".superpowers", ".hermes",
    ".pytest_cache", ".ruff_cache", "__pycache__", "data", "logs",
    "deploy", "tests", "docs", "sketches", "scripts", "tools", "cf_d1_worker", ".vercel"
}
IGNORE_EXTS = {".pyc", ".exe", ".zip", ".spec", ".bat", ".vbs", ".log"}
IGNORE_FILES = {".env", ".env.local", ".cf_auth.json", "PROJECT_MAP.html", "PROJECT_DATAFLOW.html", "PROJECT_STATE.md"}


def _ignore(dirpath, names):
    ignored = set()
    for n in names:
        if n in IGNORE_DIRS or n in IGNORE_FILES:
            ignored.add(n)
        elif any(n.endswith(ext) for ext in IGNORE_EXTS):
            ignored.add(n)
    return ignored


def main():
    stage = os.path.join(tempfile.gettempdir(), "pos_vercel_dual_stage")
    if os.path.exists(stage):
        shutil.rmtree(stage)
    shutil.copytree(BASE_DIR, stage, ignore=_ignore)
    print(f"📦 Đã chuẩn bị bộ mã nguồn sạch tại: {stage}")

    projects = [
        ("mcare-pos", "https://mcarepet.vercel.app (Chi nhánh Sài Gòn - Cổng 8998)"),
        ("petnt", "https://petnt.vercel.app (Chi nhánh Nha Trang - Cổng 8997)"),
    ]
    for proj, label in projects:
        print(f"\n🚀 Đang cập nhật Vercel Project [{proj}] -> {label}...")
        subprocess.run(f"npx vercel link --project {proj} --yes", shell=True, cwd=stage, check=True)
        subprocess.run("npx vercel --prod --yes", shell=True, cwd=stage, check=True)
        print(f"✅ Đã cập nhật thành công: {label}")


if __name__ == "__main__":
    main()

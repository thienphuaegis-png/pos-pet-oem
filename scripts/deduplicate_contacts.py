"""
Script kiểm tra và hợp nhất đối tác (contacts: NCC & Khách hàng) bị trùng tên trong SQLite.
Tự động dồn công nợ, điểm, số dư ví về bản ghi chính và dọn dẹp các bản ghi phụ.
"""
import sys
import os

# Đảm bảo import được module từ thư mục gốc
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from database import get_db, merge_duplicate_contacts

def main():
    print("=" * 60)
    print("QUÉT VÀ HỢP NHẤT ĐỐI TÁC TRÙNG LẶP (NCC & KHÁCH HÀNG)")
    print("=" * 60)
    
    conn = get_db()
    res = merge_duplicate_contacts(conn)
    conn.close()

    print(f"- Số nhóm đối tác trùng tên đã xử lý: {res['merged_groups']}")
    print(f"- Số bản ghi phụ đã được gộp & xóa: {res['deleted_duplicates']}")
    print("=" * 60)
    print("HOÀN TẤT THÀNH CÔNG!")

if __name__ == "__main__":
    main()

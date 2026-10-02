import openpyxl

wb_orig = openpyxl.load_workbook(r'C:\Users\thien\AppData\Local\hermes\attachments\Danh_Sach_Hang_Hoa_20261002_174006.xlsx')
ws_orig = wb_orig.active
rows_orig = list(ws_orig.iter_rows(values_only=True))

wb_new = openpyxl.Workbook()
ws_new = wb_new.active
ws_new.title = 'Danh_Sach_Hang_Hoa'

# Header
ws_new.append(rows_orig[0])

# Sao chép các mặt hàng hiện có
current_codes = set()
for r in rows_orig[1:]:
    if r[1]:
        current_codes.add(str(r[1]).strip().upper())
        ws_new.append(r)

stt_next = len(rows_orig)

# Thêm 2 mã sữa tắm Poodle và Corgi riêng biệt
new_items = [
    (stt_next, '6STPOO250', 'Sữa tắm cho chó Poodle Gemini 250ml', 'Chăm sóc & Vệ sinh', 'Hàng hóa', 'Chai', 126000, 0, 'Tất cả kho', 'Gemini OEM'),
    (stt_next + 1, '6STCL250', 'Sữa tắm cho chó Corgi Gemini 250ml', 'Chăm sóc & Vệ sinh', 'Hàng hóa', 'Chai', 126000, 0, 'Tất cả kho', 'Gemini OEM'),
]

for item in new_items:
    ws_new.append(item)

out_file = r'D:\Projects_Hermes\pos-offline-petcare2\Danh_Sach_Hang_Hoa_Chuan_Moi_Nhat.xlsx'
wb_new.save(out_file)
print(f'Đã tạo file hàng hóa chuẩn mới nhất gồm {stt_next + 1} món tại: {out_file}')

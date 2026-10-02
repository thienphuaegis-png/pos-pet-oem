import openpyxl, urllib.request, csv, io

# 1. Đọc tất cả sản phẩm trong đơn hàng
url_items = 'https://docs.google.com/spreadsheets/d/13ubSIDRK444r6xcikbZgL9hSr9PU13QSAULEROAI6M0/export?format=csv&gid=1671534082'
req = urllib.request.Request(url_items, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp:
    items = list(csv.reader(io.StringIO(resp.read().decode('utf-8'))))[1:]

order_stats = {}
for r in items:
    code = r[2].strip()
    qty = float(r[3].strip() or 0)
    price = float(r[4].strip() or 0)
    if code not in order_stats:
        order_stats[code] = {'count': 0, 'total_qty': 0, 'prices': set()}
    order_stats[code]['count'] += 1
    order_stats[code]['total_qty'] += qty
    order_stats[code]['prices'].add(price)

# 2. Đọc file hàng hóa chuẩn hiện có
wb = openpyxl.load_workbook(r'C:\Users\thien\AppData\Local\hermes\attachments\Danh_Sach_Hang_Hoa_20261002_105506.xlsx')
ws = wb.active
catalog = {}
for r in list(ws.iter_rows(values_only=True))[1:]:
    if r[1]:
        catalog[str(r[1]).strip().upper()] = {
            'code': str(r[1]).strip(),
            'name': str(r[2]).strip(),
            'cat': str(r[3] or 'Khác').strip(),
            'unit': str(r[5] or 'cái').strip(),
            'price': float(r[6] or 0)
        }

# 3. Tạo bảng Excel đối soát
wb_out = openpyxl.Workbook()
ws_out = wb_out.active
ws_out.title = 'Doi_Soat_San_Pham_Don_Hang'

headers = [
    'STT', 
    'Mã trong đơn hàng', 
    'Số lần bán (dòng)', 
    'Tổng SL đã bán', 
    'Các mức giá bán trong đơn', 
    'Tình trạng khớp', 
    'Mã tương đương trong kho', 
    'Tên hàng tương đương trong kho', 
    'Giá niêm yết trong kho', 
    'Đề xuất xử lý'
]
ws_out.append(headers)

# Bảng map gợi ý cho 32 mã chưa khớp
known_maps = {
    '4TTB500': ('TTB', 'Thịt bò tươi 500g', 'Gộp về mã TTB hoặc đổi mã trong kho thành 4TTB500'),
    '4TTCA500': ('TTCA', 'Thịt cá tươi 500g', 'Gộp về mã TTCA hoặc đổi mã trong kho thành 4TTCA500'),
    '4TTG500': ('TTG', 'Thịt gà tươi 500g', 'Gộp về mã TTG hoặc đổi mã trong kho thành 4TTG500'),
    '4TTH500': ('TTH', 'Thịt heo tươi 500g', 'Gộp về mã TTH hoặc đổi mã trong kho thành 4TTH500'),
    '4TTV500': ('TTV', 'Thịt vịt tươi 500g', 'Gộp về mã TTV hoặc đổi mã trong kho thành 4TTV500'),
    '4TTĐB500': ('TTDB', 'Thịt tươi vị đặc biệt 500g', 'Gộp về mã TTDB trong kho'),
    '4TTCU500': ('4TTCU500', 'Thịt chim cút tươi 500g', 'Khớp chính xác'),
    '6NLSBH': ('NLSBH', 'Nước Lau Sàn hương Bạc Hà 1lít', 'Trùng với NLSBH (thừa số 6 ở đầu)'),
    '6NLSCP': ('NLSCP', 'Nước Lau Sàn hương Cà Phê 1lít', 'Trùng với NLSCP (thừa số 6 ở đầu)'),
    '6NLSCS': ('NLSCS', 'Nước Lau Sàn hương Chanh Sả 1lít', 'Trùng với NLSCS (thừa số 6 ở đầu)'),
    '6NLSQC': ('NLCQC', 'Nước Lau Sàn hương Quế Cam 1lít', 'Trùng với NLCQC (lệch chữ QC / CQC)'),
    '6NRTAD': ('NRTAD', 'Nước Rửa Tay hương Anh Đào 400ml', 'Trùng với NRTAD (thừa số 6 ở đầu)'),
    '6NRTLD': ('NRTLD', 'Nước Rửa Tay hương Lựu Đỏ 400ml', 'Trùng với NRTLD (thừa số 6 ở đầu)'),
    '6NRTHT': ('6NRTHT100', 'Nước rửa tai cho chó mèo hương táo 100ml', 'Trùng với 6NRTHT100 (thiếu 100 ở đuôi)'),
    '6VSTHT': ('6NRTHT100', 'Nước rửa tai cho chó mèo hương táo 100ml', 'Vệ sinh tai táo -> chính là Nước rửa tai táo'),
    '6VST100': ('6NRTHT100', 'Nước rửa tai cho chó mèo 100ml', 'Vệ sinh tai 100ml'),
    '6XKMHCS250': ('XKMCS250', 'Xịt khử mùi cho chó mèo Hương Chanh sả chai 250ml', 'Trùng với XKMCS250 (thừa chữ H)'),
    '6XKMHCS100': ('XKMCS100', 'Xịt khử mùi cho chó mèo Hương Chanh sả chai 100ml', 'Trùng với XKMCS100 (thừa chữ H)'),
    '6XKMHCQ250': ('XKMCQ250', 'Xịt khử mùi cho chó mèo Hương Cam Quế chai 250ml', 'Trùng với XKMCQ250 (thừa chữ H)'),
    '6XKMHCQ100': ('XKMCQ100', 'Xịt khử mùi cho chó mèo Hương Cam Quế chai 100ml', 'Trùng với XKMCQ100 (thừa chữ H)'),
    '6XKMHCP250': ('XKMCP250', 'Xịt khử mùi cho chó mèo Hương Cà Phê chai 250ml', 'Trùng với XKMCP250 (thừa chữ H)'),
    '6XKMHCP100': ('XKMCP100', 'Xịt khử mùi cho chó mèo Hương Cà Phê chai 100ml', 'Trùng với XKMCP100 (thừa chữ H)'),
    '6XKMHBH250': ('XKMBH250', 'Xịt khử mùi cho chó mèo Hương Bạc Hà chai 250ml', 'Trùng với XKMBH250 (thừa chữ H)'),
    '6XKMHBH100': ('XKMBH100', 'Xịt khử mùi cho chó mèo Hương Bạc Hà chai 100ml', 'Trùng với XKMBH100 (thừa chữ H)'),
    '6STM50': ('6STCN50', 'Sữa tắm cho chó Gemini (chai nâu) 50ml', 'Trùng sữa tắm nâu 50ml'),
    '6STM250': ('6STCN250', 'Sữa tắm cho chó Gemini (chai nâu) 250ml', 'Trùng sữa tắm nâu 250ml'),
    'STLEO500': ('STLEO500', 'Sữa Tắm Spa Leo 500ml', 'Khớp chính xác'),
    '9XOPM': ('OPM', 'Xương Orgo vị phô mai', 'Trùng với mã OPM trong kho'),
    'SHIP': ('SHIP', 'Phí vận chuyển giao hàng', 'Phí ship dịch vụ - cần tạo mã dịch vụ'),
    'SP000001': ('SP000001', 'Phí phụ thu / dịch vụ', 'Dịch vụ phụ thu - cần tạo mã dịch vụ')
}

all_codes = sorted(list(order_stats.keys()))
stt = 1
for c in all_codes:
    st = order_stats[c]
    c_up = c.upper()
    prices_str = ', '.join(f'{p:,.0f}đ' for p in sorted(list(st['prices'])))
    
    if c_up in catalog:
        cat_item = catalog[c_up]
        status = 'Khớp 100%'
        sugg_code = cat_item['code']
        sugg_name = cat_item['name']
        sugg_price = f"{cat_item['price']:,.0f}đ"
        proposal = 'Giữ nguyên, import tự động khớp ngay'
    elif c in known_maps:
        km_code, km_name, km_prop = known_maps[c]
        cat_match = catalog.get(km_code.upper(), {})
        status = 'Trùng nhưng lệch mã'
        sugg_code = km_code
        sugg_name = km_name
        sugg_price = f"{cat_match.get('price', 0):,.0f}đ" if cat_match else 'Chưa có giá'
        proposal = km_prop
    else:
        status = 'Phát sinh mới (Chưa có trong kho)'
        sugg_code = c
        sugg_name = f'Sản phẩm {c}'
        sugg_price = '---'
        proposal = 'Cần đặt tên và giá niêm yết trước khi thêm'

    ws_out.append([
        stt,
        c,
        st['count'],
        st['total_qty'],
        prices_str,
        status,
        sugg_code,
        sugg_name,
        sugg_price,
        proposal
    ])
    stt += 1

out_path = r'D:\Projects_Hermes\pos-offline-petcare2\Bang_Doi_Soat_77_San_Pham_Don_Hang.xlsx'
wb_out.save(out_path)
print(f'Đã tạo bảng đối soát chi tiết tại: {out_path}')

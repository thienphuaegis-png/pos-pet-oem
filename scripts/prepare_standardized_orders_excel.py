import openpyxl, urllib.request, csv, io

# 1. Đọc hóa đơn (Invoices)
url_inv = 'https://docs.google.com/spreadsheets/d/13ubSIDRK444r6xcikbZgL9hSr9PU13QSAULEROAI6M0/export?format=csv&gid=645349746'
req = urllib.request.Request(url_inv, headers={'User-Agent': 'Mozilla/5.0'})
invs = list(csv.reader(io.StringIO(urllib.request.urlopen(req).read().decode('utf-8'))))[1:]

# 2. Đọc chi tiết đơn (Items)
url_items = 'https://docs.google.com/spreadsheets/d/13ubSIDRK444r6xcikbZgL9hSr9PU13QSAULEROAI6M0/export?format=csv&gid=1671534082'
req = urllib.request.Request(url_items, headers={'User-Agent': 'Mozilla/5.0'})
items = list(csv.reader(io.StringIO(urllib.request.urlopen(req).read().decode('utf-8'))))[1:]

# Bảng quy đổi chuẩn hóa mã hàng cũ -> mã hàng kho mới của anh
code_mapping = {
    # Nhóm thịt tươi: 4TTG500 -> TTG...
    '4TTB500': 'TTB',
    '4TTCA500': 'TTCA',
    '4TTG500': 'TTG',
    '4TTH500': 'TTH',
    '4TTV500': 'TTV',
    '4TTĐB500': 'TTDB',
    '4TTCU500': '4TTCU500',
    
    # Nhóm lau sàn & rửa tay
    '6NLSBH': 'NLSBH',
    '6NLSCP': 'NLSCP',
    '6NLSCS': 'NLSCS',
    '6NLSQC': 'NLCQC',
    '6NRTAD': 'NRTAD',
    '6NRTLD': 'NRTLD',
    
    # Nhóm rửa tai & vệ sinh tai
    '6NRTHT': '6NRTHT100',
    '6VSTHT': '6NRTHT100',
    '6VST100': '6NRTHT100',
    
    # Nhóm xịt khử mùi
    '6XKMHCS250': 'XKMCS250',
    '6XKMHCS100': 'XKMCS100',
    '6XKMHCQ250': 'XKMCQ250',
    '6XKMHCQ100': 'XKMCQ100',
    '6XKMHCP250': 'XKMCP250',
    '6XKMHCP100': 'XKMCP100',
    '6XKMHBH250': 'XKMBH250',
    '6XKMHBH100': 'XKMBH100',
    
    # Nhóm sữa tắm Gemini: Chăm sóc lông và chuyên sâu về 6STCN250
    '6STM50': '6STCN50',
    '6STM250': '6STCN250',
    '6STCS250': '6STCN250',
    '6STHUS250': '6STCN250',
    
    # Poodle & Corgi giữ riêng mã chuẩn
    '6STPOO250': '6STPOO250',
    '6STCL250': '6STCL250',
    
    '9XOPM': 'OPM',
    'SP000001': 'DICHVU01' # Phí dịch vụ phụ thu
}

# Xử lý đơn hàng HD000034 (tách SHIP thành shipping_fee)
wb = openpyxl.Workbook()

# Sheet Invoices
ws1 = wb.active
ws1.title = 'Invoices'
ws1.append(['Mã đơn', 'Mã khách hàng', 'Tổng tiền', 'Chiết khấu', 'Phí giao hàng', 'Khách cần trả', 'Khách đã trả', 'Còn nợ', 'Ghi chú', 'Trạng thái', 'Ngày tạo'])

def parse_money(v, total=0.0):
    s = str(v or '').strip().replace(',', '')
    if not s:
        return 0.0
    if s.endswith('%'):
        pct = float(s[:-1])
        return round(total * pct / 100.0)
    return float(s)

for r in invs:
    code = r[0].strip()
    cust_code = r[1].strip()
    total = parse_money(r[2])
    disc = parse_money(r[3], total)
    final = parse_money(r[5])
    paid = parse_money(r[6])
    debt = parse_money(r[7])
    ship = 70000.0 if code == 'HD000034' else 0.0
    status = r[9].strip()
    c_at = r[11].strip()
    note = f"Import lịch sử Google Sheets | TT: {r[8].strip()}"
    ws1.append([code, cust_code, total, disc, ship, final, paid, debt, note, status, c_at])

# Sheet Items
ws2 = wb.create_sheet('Order_Details')
ws2.append(['ID', 'Mã đơn', 'Mã hàng chuẩn', 'Số lượng', 'Đơn giá', 'Giảm giá', 'Thành tiền', 'Ngày tạo'])

cleaned_item_count = 0
for r in items:
    inv_id = r[1].strip()
    orig_pcode = r[2].strip()
    
    # Bỏ mã SHIP vì đã đưa vào shipping_fee của hóa đơn
    if orig_pcode == 'SHIP':
        continue
        
    mapped_pcode = code_mapping.get(orig_pcode, orig_pcode)
    qty = float(r[3].strip() or 0)
    price = float(r[4].strip() or 0)
    item_disc = float(r[5].strip() or 0)
    item_total = float(r[6].strip() or 0)
    c_at = r[7].strip()
    
    ws2.append([r[0].strip(), inv_id, mapped_pcode, qty, price, item_disc, item_total, c_at])
    cleaned_item_count += 1

out_path = r'D:\Projects_Hermes\pos-offline-petcare2\Danh_Sach_Hoa_Don_Lich_Su_Da_Chuan_Hoa.xlsx'
wb.save(out_path)
print(f'Đã tạo file hóa đơn chuẩn hóa: {out_path} ({cleaned_item_count} món)')

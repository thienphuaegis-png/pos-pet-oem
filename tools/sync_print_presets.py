import sqlite3
import json

presets_def = {
    'a4_b2b': {
        'name': 'Mẫu A4 Đại Lý B2B (Chuẩn 9 Cột & 3 Chữ Ký)',
        'category': 'pos',
        'paper_size': 'A4-landscape',
        'is_bold_all': False,
        'elements': [
            {'id': 'e1', 'catalog_key': 'logo', 'zone': 'header', 'type': 'logo', 'label': 'Logo Cửa Hàng', 'x': 40, 'y': 22, 'w': 120, 'h': 55, 'align': 'center'},
            {'id': 'e2', 'catalog_key': 'shop_name', 'zone': 'header', 'type': 'text', 'text': '{{ten_cua_hang}}', 'label': 'Tên Cửa Hàng', 'x': 180, 'y': 20, 'w': 520, 'fsz': 16, 'bold': True, 'align': 'left'},
            {'id': 'e3', 'catalog_key': 'shop_address', 'zone': 'header', 'type': 'text', 'text': 'Địa chỉ: {{dia_chi}}', 'label': 'Địa Chỉ', 'x': 180, 'y': 42, 'w': 520, 'fsz': 10, 'bold': False, 'align': 'left'},
            {'id': 'e4', 'catalog_key': 'shop_phone', 'zone': 'header', 'type': 'text', 'text': 'Hotline: {{so_dien_thoai}}', 'label': 'SĐT Shop', 'x': 180, 'y': 60, 'w': 300, 'fsz': 10, 'bold': False, 'align': 'left'},
            {'id': 'e5', 'catalog_key': 'title', 'zone': 'header', 'type': 'text', 'text': 'HÓA ĐƠN BÁN HÀNG ĐẠI LÝ', 'label': 'Tiêu Đề', 'x': 40, 'y': 92, 'w': 980, 'fsz': 18, 'bold': True, 'align': 'center'},
            {'id': 'e6', 'catalog_key': 'order_code', 'zone': 'header', 'type': 'text', 'text': 'Mã hóa đơn: {{ma_hoa_don}}', 'label': 'Mã Đơn', 'x': 40, 'y': 125, 'w': 260, 'fsz': 10, 'bold': False, 'align': 'left'},
            {'id': 'e7', 'catalog_key': 'datetime', 'zone': 'header', 'type': 'text', 'text': 'Ngày lập: {{ngay_gio}}', 'label': 'Thời Gian', 'x': 740, 'y': 125, 'w': 260, 'fsz': 10, 'bold': False, 'align': 'right'},
            {'id': 'e8', 'catalog_key': 'customer', 'zone': 'header', 'type': 'text', 'text': 'Đại lý / Khách hàng: {{ten_khach}} ({{sdt_khach}})', 'label': 'Khách Hàng', 'x': 40, 'y': 147, 'w': 550, 'fsz': 10, 'bold': False, 'align': 'left'},
            {'id': 'e8_addr', 'catalog_key': 'customer_address', 'zone': 'header', 'type': 'text', 'text': 'Địa chỉ: {{dia_chi_khach}}', 'label': 'Địa Chỉ Khách', 'x': 40, 'y': 163, 'w': 550, 'fsz': 9.5, 'bold': False, 'align': 'left'},
            {'id': 'e9', 'catalog_key': 'staff', 'zone': 'header', 'type': 'text', 'text': 'Nhân viên kinh doanh: {{thu_ngan}}', 'label': 'Thu Ngân', 'x': 740, 'y': 147, 'w': 260, 'fsz': 10, 'bold': False, 'align': 'right'},
            {'id': 'e10', 'catalog_key': 'table_b2b', 'zone': 'body', 'type': 'table_b2b', 'label': 'Bảng 9 Cột B2B/Đại Lý', 'x': 40, 'y': 180, 'w': 980, 'fsz': 10},
            {'id': 'e11', 'catalog_key': 'b2b_footer_boxes', 'zone': 'footer', 'type': 'b2b_footer_boxes', 'label': '3 Ô Chân Trang (Bank - QR - Tổng kết)', 'x': 40, 'y': 325, 'w': 980, 'h': 140},
            {'id': 'e12', 'catalog_key': 'signatures_3col', 'zone': 'footer', 'type': 'signatures_3col', 'label': '3 Cột Chữ Ký (Kế toán - Thủ kho - Người nhận)', 'x': 40, 'y': 480, 'w': 980, 'h': 90},
            {'id': 'e13', 'catalog_key': 'footer_msg', 'zone': 'footer', 'type': 'text', 'text': '{{loi_cam_on}}', 'label': 'Lời Cảm Ơn', 'x': 40, 'y': 585, 'w': 980, 'fsz': 10, 'italic': True, 'align': 'center'}
        ]
    },
    'spa_intake_k80': {
        'name': 'Mẫu Phiếu Tiếp Nhận Thú Cưng Spa (K80)',
        'category': 'spa',
        'paper_size': 'K80',
        'is_bold_all': True,
        'elements': [
            {'id': 'e1', 'catalog_key': 'shop_name', 'zone': 'header', 'type': 'text', 'text': '🐾 {{ten_cua_hang}}', 'label': 'Tên Cửa Hàng', 'x': 10, 'y': 10, 'w': 270, 'fsz': 14, 'bold': True, 'align': 'center'},
            {'id': 'e2', 'catalog_key': 'title', 'zone': 'header', 'type': 'text', 'text': 'PHIẾU TIẾP NHẬN THÚ CƯNG', 'label': 'Tiêu Đề', 'x': 10, 'y': 32, 'w': 270, 'fsz': 13, 'bold': True, 'align': 'center'},
            {'id': 'e3', 'catalog_key': 'order_code', 'zone': 'header', 'type': 'text', 'text': 'Mã: {{ma_hoa_don}} | Giờ: {{ngay_gio}}', 'label': 'Mã & Giờ Nhận', 'x': 10, 'y': 52, 'w': 270, 'fsz': 10, 'bold': False, 'align': 'center'},
            {'id': 'e4', 'catalog_key': 'customer', 'zone': 'header', 'type': 'text', 'text': 'Khách: {{ten_khach}} - {{sdt_khach}}', 'label': 'Khách Hàng', 'x': 10, 'y': 72, 'w': 270, 'fsz': 11, 'bold': True, 'align': 'left'},
            {'id': 'e5', 'catalog_key': 'pet_info', 'zone': 'header', 'type': 'text', 'text': 'Bé: {{ten_thu_cung}} ({{giong_loai}}) - {{can_nang}}kg', 'label': 'Thông Tin Thú Cưng', 'x': 10, 'y': 92, 'w': 270, 'fsz': 11, 'bold': True, 'align': 'left'},
            {'id': 'e6', 'catalog_key': 'intake_condition', 'zone': 'header', 'type': 'text', 'text': 'Tình trạng nhận: {{tinh_trang_tiep_nhan}}', 'label': 'Tình Trạng Tiếp Nhận', 'x': 10, 'y': 112, 'w': 270, 'fsz': 10, 'bold': False, 'align': 'left'},
            {'id': 'e7', 'catalog_key': 'table', 'zone': 'body', 'type': 'table', 'label': 'Dịch Vụ Yêu Cầu', 'x': 10, 'y': 135, 'w': 270, 'fsz': 10},
            {'id': 'e8', 'catalog_key': 'return_time', 'zone': 'footer', 'type': 'text', 'text': 'HẸN TRẢ: {{gio_hen_tra}}', 'label': 'Giờ Hẹn Trả Bé', 'x': 10, 'y': 200, 'w': 270, 'fsz': 12, 'bold': True, 'align': 'center'},
            {'id': 'e9', 'catalog_key': 'footer_msg', 'zone': 'footer', 'type': 'text', 'text': 'Quý khách vui lòng kiểm tra bé trước khi rời quầy!', 'label': 'Lời Cảm Ơn', 'x': 10, 'y': 225, 'w': 270, 'fsz': 9.5, 'italic': True, 'align': 'center'},
            {'id': 'e10', 'catalog_key': 'pet_signature', 'zone': 'footer', 'type': 'text', 'text': '(Chữ ký khách gửi bé)', 'label': 'Chữ Ký Gửi Bé', 'x': 10, 'y': 255, 'w': 270, 'fsz': 10, 'align': 'center'}
        ]
    },
    'spa_invoice_k80': {
        'name': 'Mẫu Phiếu Thanh Toán Dịch Vụ Spa (K80)',
        'category': 'spa',
        'paper_size': 'K80',
        'is_bold_all': True,
        'elements': [
            {'id': 'e1', 'catalog_key': 'shop_name', 'zone': 'header', 'type': 'text', 'text': '🐾 {{ten_cua_hang}}', 'label': 'Tên Cửa Hàng', 'x': 10, 'y': 10, 'w': 270, 'fsz': 14, 'bold': True, 'align': 'center'},
            {'id': 'e2', 'catalog_key': 'title', 'zone': 'header', 'type': 'text', 'text': 'HÓA ĐƠN DỊCH VỤ SPA', 'label': 'Tiêu Đề', 'x': 10, 'y': 32, 'w': 270, 'fsz': 14, 'bold': True, 'align': 'center'},
            {'id': 'e3', 'catalog_key': 'order_code', 'zone': 'header', 'type': 'text', 'text': 'Mã: {{ma_hoa_don}} - {{ngay_gio}}', 'label': 'Mã & Ngày', 'x': 10, 'y': 52, 'w': 270, 'fsz': 10, 'bold': False, 'align': 'center'},
            {'id': 'e4', 'catalog_key': 'customer', 'zone': 'header', 'type': 'text', 'text': 'Khách: {{ten_khach}} ({{sdt_khach}})', 'label': 'Khách Hàng', 'x': 10, 'y': 72, 'w': 270, 'fsz': 10.5, 'bold': True, 'align': 'left'},
            {'id': 'e5', 'catalog_key': 'pet_info', 'zone': 'header', 'type': 'text', 'text': 'Bé: {{ten_thu_cung}} - {{giong_loai}} ({{can_nang}}kg)', 'label': 'Thông Tin Thú Cưng', 'x': 10, 'y': 90, 'w': 270, 'fsz': 10, 'bold': False, 'align': 'left'},
            {'id': 'e6', 'catalog_key': 'table', 'zone': 'body', 'type': 'table', 'label': 'Bảng Dịch Vụ & Phụ Phí', 'x': 10, 'y': 115, 'w': 270, 'fsz': 10},
            {'id': 'e7', 'catalog_key': 'total', 'zone': 'footer', 'type': 'text', 'text': 'Tổng chi phí: {{tong_tien}}', 'label': 'Tổng Tiền', 'x': 10, 'y': 185, 'w': 270, 'fsz': 11, 'bold': False, 'align': 'right'},
            {'id': 'e8', 'catalog_key': 'discount', 'zone': 'footer', 'type': 'text', 'text': 'Giảm giá / Ưu đãi: -{{giam_gia}}', 'label': 'Giảm Giá', 'x': 10, 'y': 205, 'w': 270, 'fsz': 10.5, 'bold': False, 'align': 'right'},
            {'id': 'e9', 'catalog_key': 'final', 'zone': 'footer', 'type': 'text', 'text': 'KHÁCH PHẢI TRẢ: {{phai_tra}}', 'label': 'Phải Trả', 'x': 10, 'y': 228, 'w': 270, 'fsz': 13, 'bold': True, 'align': 'right'},
            {'id': 'e10', 'catalog_key': 'qr', 'zone': 'footer', 'type': 'qr', 'label': 'QR Chuyển Khoản', 'x': 75, 'y': 255, 'w': 130, 'h': 130},
            {'id': 'e11', 'catalog_key': 'footer_msg', 'zone': 'footer', 'type': 'text', 'text': '{{loi_cam_on}}', 'label': 'Lời Cảm Ơn', 'x': 10, 'y': 400, 'w': 270, 'fsz': 10, 'italic': True, 'align': 'center'}
        ]
    },
    'cashbook_thu_k80': {
        'name': 'Mẫu Phiếu Thu Tiền (Cuộn K80)',
        'category': 'cashbook',
        'paper_size': 'K80',
        'is_bold_all': True,
        'elements': [
            {'id': 'e1', 'catalog_key': 'shop_name', 'zone': 'header', 'type': 'text', 'text': '🐾 {{ten_cua_hang}}', 'label': 'Tên Cửa Hàng', 'x': 10, 'y': 10, 'w': 270, 'fsz': 14, 'bold': True, 'align': 'center'},
            {'id': 'e2', 'catalog_key': 'title', 'zone': 'header', 'type': 'text', 'text': 'PHIẾU THU TIỀN', 'label': 'Tiêu Đề', 'x': 10, 'y': 32, 'w': 270, 'fsz': 15, 'bold': True, 'align': 'center'},
            {'id': 'e3', 'catalog_key': 'order_code', 'zone': 'header', 'type': 'text', 'text': 'Mã: {{ma_phieu}} | Ngày: {{ngay_gio}}', 'label': 'Mã Phiếu Thu', 'x': 10, 'y': 54, 'w': 270, 'fsz': 10, 'align': 'center'},
            {'id': 'e4', 'catalog_key': 'customer', 'zone': 'header', 'type': 'text', 'text': 'Người nộp: {{ten_khach}} ({{sdt_khach}})', 'label': 'Người Nộp', 'x': 10, 'y': 78, 'w': 270, 'fsz': 11, 'bold': True, 'align': 'left'},
            {'id': 'e5', 'catalog_key': 'cashbook_category', 'zone': 'header', 'type': 'text', 'text': 'Hạng mục: {{hang_muc}}', 'label': 'Hạng Mục Thu/Chi', 'x': 10, 'y': 98, 'w': 270, 'fsz': 10, 'align': 'left'},
            {'id': 'e6', 'catalog_key': 'cashbook_fund', 'zone': 'header', 'type': 'text', 'text': 'Két / Quỹ: {{tai_khoan_quy}}', 'label': 'Quỹ / Tài Khoản', 'x': 10, 'y': 116, 'w': 270, 'fsz': 10, 'align': 'left'},
            {'id': 'e7', 'catalog_key': 'cashbook_amount', 'zone': 'body', 'type': 'text', 'text': 'SỐ TIỀN THỰC THU: {{so_tien}}', 'label': 'Số Tiền Thu/Chi', 'x': 10, 'y': 140, 'w': 270, 'fsz': 15, 'bold': True, 'align': 'center'},
            {'id': 'e8', 'catalog_key': 'cashbook_reason', 'zone': 'body', 'type': 'text', 'text': 'Diễn giải: {{dien_giai}}', 'label': 'Diễn Giải Thu/Chi', 'x': 10, 'y': 175, 'w': 270, 'fsz': 10.5, 'italic': True, 'align': 'left'},
            {'id': 'e9', 'catalog_key': 'signatures_cashbook', 'zone': 'footer', 'type': 'signatures_cashbook', 'label': '2 Chữ Ký Nộp/Nhận - Lập Phiếu', 'x': 10, 'y': 215, 'w': 270, 'h': 80}
        ]
    },
    'cashbook_thu_a4': {
        'name': 'Mẫu Phiếu Thu Tiền (Chuẩn A5/A4 Kế Toán)',
        'category': 'cashbook',
        'paper_size': 'A5-landscape',
        'is_bold_all': False,
        'elements': [
            {'id': 'e1', 'catalog_key': 'shop_name', 'zone': 'header', 'type': 'text', 'text': '{{ten_cua_hang}}\nĐịa chỉ: {{dia_chi}}\nHotline: {{so_dien_thoai}}', 'label': 'Đơn Vị', 'x': 30, 'y': 20, 'w': 400, 'fsz': 11, 'bold': False, 'align': 'left'},
            {'id': 'e2', 'catalog_key': 'order_code', 'zone': 'header', 'type': 'text', 'text': 'Mẫu số 01 - TT\n(Ban hành theo TT số 133/2016/TT-BTC)\nQuyển số: ........\nSố: {{ma_phieu}}\nNợ: ..... Có: .....', 'label': 'Mẫu Số & Quyển', 'x': 440, 'y': 20, 'w': 240, 'fsz': 10, 'align': 'right'},
            {'id': 'e3', 'catalog_key': 'title', 'zone': 'header', 'type': 'text', 'text': 'PHIẾU THU', 'label': 'Tiêu Đề', 'x': 150, 'y': 95, 'w': 380, 'fsz': 20, 'bold': True, 'align': 'center'},
            {'id': 'e4', 'catalog_key': 'datetime', 'zone': 'header', 'type': 'text', 'text': 'Ngày lập: {{ngay_gio}}', 'label': 'Ngày Tháng', 'x': 150, 'y': 125, 'w': 380, 'fsz': 11, 'italic': True, 'align': 'center'},
            {'id': 'e5', 'catalog_key': 'cashbook_reason', 'zone': 'body', 'type': 'text', 'text': '- Họ và tên người nộp tiền: {{ten_khach}} ({{sdt_khach}})\n- Lý do nộp: {{dien_giai}}\n- Hạng mục: {{hang_muc}}\n- Số tiền: {{so_tien}}\n- Nhập quỹ / Két: {{tai_khoan_quy}}', 'label': 'Nội Dung Thu Tiền', 'x': 30, 'y': 155, 'w': 650, 'fsz': 12, 'align': 'left'},
            {'id': 'e6', 'catalog_key': 'signatures_accounting_4col', 'zone': 'footer', 'type': 'signatures_accounting_4col', 'label': '4 Chữ Ký Kế Toán', 'x': 30, 'y': 290, 'w': 650, 'h': 90}
        ]
    },
    'cashbook_chi_k80': {
        'name': 'Mẫu Phiếu Chi Tiền (Cuộn K80)',
        'category': 'cashbook',
        'paper_size': 'K80',
        'is_bold_all': True,
        'elements': [
            {'id': 'e1', 'catalog_key': 'shop_name', 'zone': 'header', 'type': 'text', 'text': '🐾 {{ten_cua_hang}}', 'label': 'Tên Cửa Hàng', 'x': 10, 'y': 10, 'w': 270, 'fsz': 14, 'bold': True, 'align': 'center'},
            {'id': 'e2', 'catalog_key': 'title', 'zone': 'header', 'type': 'text', 'text': 'PHIẾU CHI TIỀN', 'label': 'Tiêu Đề', 'x': 10, 'y': 32, 'w': 270, 'fsz': 15, 'bold': True, 'align': 'center'},
            {'id': 'e3', 'catalog_key': 'order_code', 'zone': 'header', 'type': 'text', 'text': 'Mã: {{ma_phieu}} | Ngày: {{ngay_gio}}', 'label': 'Mã Phiếu Chi', 'x': 10, 'y': 54, 'w': 270, 'fsz': 10, 'align': 'center'},
            {'id': 'e4', 'catalog_key': 'customer', 'zone': 'header', 'type': 'text', 'text': 'Người nhận: {{ten_khach}} ({{sdt_khach}})', 'label': 'Người Nhận', 'x': 10, 'y': 78, 'w': 270, 'fsz': 11, 'bold': True, 'align': 'left'},
            {'id': 'e5', 'catalog_key': 'cashbook_category', 'zone': 'header', 'type': 'text', 'text': 'Hạng mục: {{hang_muc}}', 'label': 'Hạng Mục Thu/Chi', 'x': 10, 'y': 98, 'w': 270, 'fsz': 10, 'align': 'left'},
            {'id': 'e6', 'catalog_key': 'cashbook_fund', 'zone': 'header', 'type': 'text', 'text': 'Két / Quỹ: {{tai_khoan_quy}}', 'label': 'Quỹ / Tài Khoản', 'x': 10, 'y': 116, 'w': 270, 'fsz': 10, 'align': 'left'},
            {'id': 'e7', 'catalog_key': 'cashbook_amount', 'zone': 'body', 'type': 'text', 'text': 'SỐ TIỀN THỰC CHI: {{so_tien}}', 'label': 'Số Tiền Thu/Chi', 'x': 10, 'y': 140, 'w': 270, 'fsz': 15, 'bold': True, 'align': 'center'},
            {'id': 'e8', 'catalog_key': 'cashbook_reason', 'zone': 'body', 'type': 'text', 'text': 'Diễn giải: {{dien_giai}}', 'label': 'Diễn Giải Thu/Chi', 'x': 10, 'y': 175, 'w': 270, 'fsz': 10.5, 'italic': True, 'align': 'left'},
            {'id': 'e9', 'catalog_key': 'signatures_cashbook', 'zone': 'footer', 'type': 'signatures_cashbook', 'label': '2 Chữ Ký Nộp/Nhận - Lập Phiếu', 'x': 10, 'y': 215, 'w': 270, 'h': 80}
        ]
    },
    'cashbook_chi_a4': {
        'name': 'Mẫu Phiếu Chi Tiền (Chuẩn A5/A4 Kế Toán)',
        'category': 'cashbook',
        'paper_size': 'A5-landscape',
        'is_bold_all': False,
        'elements': [
            {'id': 'e1', 'catalog_key': 'shop_name', 'zone': 'header', 'type': 'text', 'text': '{{ten_cua_hang}}\nĐịa chỉ: {{dia_chi}}\nHotline: {{so_dien_thoai}}', 'label': 'Đơn Vị', 'x': 30, 'y': 20, 'w': 400, 'fsz': 11, 'bold': False, 'align': 'left'},
            {'id': 'e2', 'catalog_key': 'order_code', 'zone': 'header', 'type': 'text', 'text': 'Mẫu số 02 - TT\n(Ban hành theo TT số 133/2016/TT-BTC)\nQuyển số: ........\nSố: {{ma_phieu}}\nNợ: ..... Có: .....', 'label': 'Mẫu Số & Quyển', 'x': 440, 'y': 20, 'w': 240, 'fsz': 10, 'align': 'right'},
            {'id': 'e3', 'catalog_key': 'title', 'zone': 'header', 'type': 'text', 'text': 'PHIẾU CHI', 'label': 'Tiêu Đề', 'x': 150, 'y': 95, 'w': 380, 'fsz': 20, 'bold': True, 'align': 'center'},
            {'id': 'e4', 'catalog_key': 'datetime', 'zone': 'header', 'type': 'text', 'text': 'Ngày lập: {{ngay_gio}}', 'label': 'Ngày Tháng', 'x': 150, 'y': 125, 'w': 380, 'fsz': 11, 'italic': True, 'align': 'center'},
            {'id': 'e5', 'catalog_key': 'cashbook_reason', 'zone': 'body', 'type': 'text', 'text': '- Họ và tên người nhận tiền: {{ten_khach}} ({{sdt_khach}})\n- Lý do chi: {{dien_giai}}\n- Hạng mục: {{hang_muc}}\n- Số tiền: {{so_tien}}\n- Xuất quỹ / Két: {{tai_khoan_quy}}', 'label': 'Nội Dung Chi Tiền', 'x': 30, 'y': 155, 'w': 650, 'fsz': 12, 'align': 'left'},
            {'id': 'e6', 'catalog_key': 'signatures_accounting_4col', 'zone': 'footer', 'type': 'signatures_accounting_4col', 'label': '4 Chữ Ký Kế Toán', 'x': 30, 'y': 290, 'w': 650, 'h': 90}
        ]
    },
    'stock_audit_a4': {
        'name': 'Mẫu Phiếu Kiểm Kê Hàng Hóa (A4 Dọc)',
        'category': 'inventory',
        'paper_size': 'A4-portrait',
        'is_bold_all': False,
        'elements': [
            {'id': 'e1', 'catalog_key': 'shop_name', 'zone': 'header', 'type': 'text', 'text': '{{ten_cua_hang}}\nĐịa chỉ: {{dia_chi}}', 'label': 'Tên Doanh Nghiệp', 'x': 30, 'y': 20, 'w': 400, 'fsz': 11, 'bold': False, 'align': 'left'},
            {'id': 'e2', 'catalog_key': 'order_code', 'zone': 'header', 'type': 'text', 'text': 'Mã phiếu: {{ma_phieu}}\nNgày kiểm: {{ngay_gio}}', 'label': 'Mã & Ngày', 'x': 440, 'y': 20, 'w': 260, 'fsz': 10.5, 'align': 'right'},
            {'id': 'e3', 'catalog_key': 'title', 'zone': 'header', 'type': 'text', 'text': 'PHIẾU KIỂM KÊ KHO HÀNG', 'label': 'Tiêu Đề', 'x': 30, 'y': 80, 'w': 674, 'fsz': 18, 'bold': True, 'align': 'center'},
            {'id': 'e4', 'catalog_key': 'audit_warehouse', 'zone': 'header', 'type': 'text', 'text': 'Kho kiểm kê: {{kho_kiem_ke}} | Đợt kiểm: Định kỳ cuối tháng', 'label': 'Kho Kiểm Kê', 'x': 30, 'y': 115, 'w': 674, 'fsz': 11, 'italic': True, 'align': 'center'},
            {'id': 'e5', 'catalog_key': 'table_audit', 'zone': 'body', 'type': 'table_audit', 'label': 'Bảng 7 Cột Kiểm Kê Kho', 'x': 30, 'y': 145, 'w': 674, 'fsz': 10.5},
            {'id': 'e6', 'catalog_key': 'audit_summary', 'zone': 'footer', 'type': 'text', 'text': 'Tổng số mặt hàng đã kiểm: {{tong_mon_kiem}} món | Lệch thừa: {{lech_thua}} | Lệch thiếu: {{lech_thieu}}', 'label': 'Tổng Kết Kiểm Kê', 'x': 30, 'y': 240, 'w': 674, 'fsz': 11, 'bold': True, 'align': 'right'},
            {'id': 'e7', 'catalog_key': 'signatures_audit', 'zone': 'footer', 'type': 'signatures_audit', 'label': '3 Chữ Ký Ban Kiểm Kê', 'x': 30, 'y': 285, 'w': 674, 'h': 85}
        ]
    }
}

conn = sqlite3.connect('data/pos.db')
cur = conn.cursor()
cur.execute('SELECT value FROM settings WHERE key="print_blocks_config"')
row = cur.fetchone()
if row:
    data = json.loads(row[0])
    presets = data.get('presets', {})
    # Cập nhật và bổ sung category, is_bold_all cho tất cả preset định nghĩa
    for k, v in presets_def.items():
        if k in presets:
            presets[k]['category'] = v.get('category', 'pos')
            if 'is_bold_all' not in presets[k] or presets[k]['is_bold_all'] is None:
                presets[k]['is_bold_all'] = v.get('is_bold_all', False)
            if 'elements' in v:
                presets[k]['elements'] = v['elements']
            if 'name' in v:
                presets[k]['name'] = v['name']
            if 'paper_size' in v:
                presets[k]['paper_size'] = v['paper_size']
        else:
            presets[k] = v

    # Quét tất cả các preset khác (kể cả preset tùy chỉnh của người dùng và các preset standard)
    for k, p in presets.items():
        if 'category' not in p or not p['category']:
            if 'spa' in k:
                p['category'] = 'spa'
            elif 'cashbook' in k:
                p['category'] = 'cashbook'
            elif 'audit' in k:
                p['category'] = 'inventory'
            else:
                p['category'] = 'pos'
        if 'is_bold_all' not in p or p['is_bold_all'] is None:
            p['is_bold_all'] = (p.get('paper_size') in ['K80', 'K58'])

    data['presets'] = presets
    cur.execute('UPDATE settings SET value = ? WHERE key = "print_blocks_config"', (json.dumps(data, ensure_ascii=False),))
    conn.commit()
    print('Updated presets with full elements, category, and is_bold_all in pos.db successfully!')
conn.close()

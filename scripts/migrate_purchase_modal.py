import os
from bs4 import BeautifulSoup

html_path = 'templates/index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    text = f.read()

old_header = """                <div class="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border">
                    <div>
                        <h2 class="text-xl font-bold text-slate-800">📥 Quản Lý Nhập Hàng & Mua Hàng</h2>
                        <p class="text-xs text-gray-500">Tạo phiếu nhập nhiều mặt hàng (hàng hóa & nguyên liệu), tính VAT, phí vận chuyển, chiết khấu và theo dõi công nợ NCC</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="togglePurchaseView('create')" id="btn-purchase-new" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded shadow flex items-center gap-1">
                            ➕ Tạo Phiếu Nhập Mới
                        </button>
                        <button onclick="togglePurchaseView('list')" id="btn-purchase-history" class="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded shadow flex items-center gap-1">
                            📋 Lịch Sử Phiếu Nhập
                        </button>
                        <button onclick="togglePurchaseView('compare')" id="btn-purchase-compare" class="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded shadow flex items-center gap-1">
                            ⚖️ So Sánh Giá NCC
                        </button>
                        <button onclick="togglePurchaseView('price-history')" id="btn-purchase-price-hist" class="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded shadow flex items-center gap-1">
                            📈 Biến Động Giá Nhập
                        </button>
                    </div>
                </div>"""

new_header = """                <div class="flex flex-wrap justify-between items-center bg-white p-4 rounded-lg shadow-sm border gap-3">
                    <div>
                        <h2 class="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <span>📥 Quản Lý Đơn Đặt Hàng & Nhập Kho</span>
                            <span class="text-xs font-normal bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">Purchases</span>
                        </h2>
                        <p class="text-xs text-gray-500">Theo dõi đơn đặt hàng NCC, in phiếu kiểm đếm cầm tay cho thủ kho, điều chỉnh số lượng và nhận hàng thực tế</p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button onclick="openCreatePurchaseModal()" id="btn-purchase-new" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded shadow flex items-center gap-1.5">
                            <span>➕ Tạo Đơn Đặt Hàng Mới</span>
                        </button>
                        <button onclick="loadPurchasesList()" class="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded shadow flex items-center gap-1.5">
                            <span>🔄 Làm Mới</span>
                        </button>
                        <button onclick="togglePurchaseSubView('compare')" id="btn-purchase-compare" class="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded shadow flex items-center gap-1">
                            ⚖️ So Sánh Giá NCC
                        </button>
                        <button onclick="togglePurchaseSubView('price-history')" id="btn-purchase-price-hist" class="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded shadow flex items-center gap-1">
                            📈 Biến Động Giá
                        </button>
                    </div>
                </div>"""

assert old_header in text, "old_header not found in index.html"
text_new = text.replace(old_header, new_header, 1)

# Extract inside_form
v1_start_marker = '                <!-- VIEW 1: TẠO PHIẾU NHẬP MỚI -->\n                <div id="purchase-create-view" class="space-y-4">\n'
v1_end_marker = '\n                </div>\n\n                <!-- VIEW 2: DANH SÁCH LỊCH SỬ PHIẾU NHẬP HÀNG -->\n                <!-- VIEW 2: DANH SÁCH LỊCH SỬ PHIẾU NHẬP (QUY TRÌNH 2 BƯỚC) -->\n                <div id="purchase-list-view" class="hidden space-y-4">'

idx1 = text_new.find(v1_start_marker)
idx2 = text_new.find(v1_end_marker)
assert idx1 != -1 and idx2 != -1, "v1 markers not found"

inside_form = text_new[idx1 + len(v1_start_marker):idx2]

old_btn = '<button onclick="submitPurchase()" class="flex-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold shadow text-sm flex items-center justify-center gap-1.5">\n                                        <span>📋 LƯU ĐƠN NHẬP (CHỜ NHẬN HÀNG)</span>\n                                    </button>'
new_btn = '<button onclick="submitPurchase()" id="btn-submit-purchase" class="flex-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold shadow text-sm flex items-center justify-center gap-1.5">\n                                        <span id="btn-submit-purchase-text">📋 LƯU ĐƠN ĐẶT HÀNG (CHỜ NHẬN)</span>\n                                    </button>'

inside_form_updated = inside_form.replace(old_btn, new_btn, 1)
inside_form_updated = inside_form_updated.replace(
    '<button onclick="resetPurchaseForm()" class="flex-1 py-2.5 border rounded font-bold text-gray-600 hover:bg-gray-100">\n                                        Hủy / Làm Mới\n                                    </button>',
    '<button onclick="closePurchaseModal()" class="flex-1 py-2.5 border rounded font-bold text-gray-600 hover:bg-gray-100">\n                                        Đóng / Hủy\n                                    </button>',
    1
)

# Modal container
modal_purchase_html = f'''            <!-- MODAL: TẠO / SỬA ĐƠN ĐẶT HÀNG MUA HÀNG -->
            <div id="modal-purchase-order" class="fixed inset-0 bg-black/60 hidden flex items-center justify-center z-50 p-4">
                <div class="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col text-xs overflow-hidden">
                    <div class="flex justify-between items-center border-b p-4 bg-slate-800 text-white rounded-t-xl shrink-0">
                        <div>
                            <h3 class="font-bold text-sm text-white flex items-center gap-2" id="modal-purchase-title">
                                <span>➕ Tạo Đơn Đặt Hàng NCC Mới</span>
                            </h3>
                            <p class="text-[11px] text-slate-300">Đơn đặt hàng sẽ ở trạng thái Chờ Nhận Hàng (chưa cộng tồn kho). Bạn có thể sửa đổi số lượng bất cứ lúc nào trước khi chốt kho.</p>
                        </div>
                        <button onclick="closePurchaseModal()" class="text-gray-400 hover:text-white text-lg font-bold px-2">✕</button>
                    </div>
                    <div class="p-4 overflow-y-auto space-y-4 flex-1 bg-slate-50">
{inside_form_updated}
                    </div>
                </div>
            </div>'''

replacement_middle = '''                <!-- VIEW: DANH SÁCH ĐƠN ĐẶT HÀNG & LỊCH SỬ NHẬP KHO -->
                <div id="purchase-list-view" class="space-y-4">'''

text_new = text_new[:idx1] + replacement_middle + text_new[idx2 + len(v1_end_marker):]

rec_marker = '            <!-- MODAL: CHI TIẾT & NHẬN HÀNG PHIẾU NHẬP -->'
assert rec_marker in text_new, "rec_marker not found"

text_new = text_new.replace(rec_marker, modal_purchase_html + '\n\n' + rec_marker, 1)

soup = BeautifulSoup(text_new, 'html.parser')
tabs = ['tab-pos', 'tab-orders', 'tab-inventory', 'tab-pet-services', 'tab-purchases', 'tab-oem', 'tab-contacts', 'tab-cashbook', 'tab-cashflow-debts', 'tab-reports', 'tab-settings', 'tab-price-lists']

for tid in tabs:
    t = soup.find(id=tid)
    p = t.parent.get('id') if (t and t.parent) else None
    assert p == 'main-content-area', f"{tid} parent is {p}, expected main-content-area"

assert soup.find(id='modal-purchase-order') is not None
assert soup.find(id='purchase-list-view') is not None

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(text_new)

print("SUCCESS: Updated templates/index.html")

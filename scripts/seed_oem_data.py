import sqlite3
import datetime
from database import get_db

def seed_oem_full_states():
    conn = get_db()
    cur = conn.cursor()
    
    # Lấy danh sách NCC & sản phẩm
    cur.execute("SELECT id, name FROM contacts WHERE type = 'supplier'")
    suppliers = {r['id']: r['name'] for r in cur.fetchall()}
    supp_ids = list(suppliers.keys())
    
    cur.execute("SELECT id, code, name, cost_price FROM products")
    products = [(r['id'], r['code'], r['name'], r['cost_price']) for r in cur.fetchall()]
    
    print(f"Có {len(supp_ids)} nhà máy OEM và {len(products)} sản phẩm.")
    
    # Xóa sạch bảng OEM cũ để tạo bộ dữ liệu mẫu chuẩn chỉ
    cur.execute("DELETE FROM oem_order_items")
    cur.execute("DELETE FROM oem_orders")
    
    today = datetime.date.today()
    
    oem_configs = [
        {
            "desc": "Đơn 1: DRAFT (Bản nháp - Chưa đặt cọc - Quỹ Cty - Có VAT 8%)",
            "partner_id": supp_ids[0],
            "status": "DRAFT",
            "fund_source": "COMPANY",
            "vat_percent": 8.0,
            "discount_percent": 5.0,
            "deposit_amount": 0.0,
            "payment_status": "UNPAID",
            "expected_delivery_date": (today + datetime.timedelta(days=7)).strftime("%Y-%m-%d"),
            "note": "Đơn nháp lập thử để dự toán chi phí gia công thức ăn hạt cho cún",
            "items": [
                {"prod": products[0], "qty": 200, "price": 110000},
                {"prod": products[1], "qty": 150, "price": 60000}
            ]
        },
        {
            "desc": "Đơn 2: DEPOSITED (Đang gia công - Đã đặt cọc 50% qua Quỹ Cty - Có VAT 8%)",
            "partner_id": supp_ids[2],
            "status": "DEPOSITED",
            "fund_source": "COMPANY",
            "vat_percent": 8.0,
            "discount_percent": 0.0,
            "deposit_percent": 50,
            "payment_status": "PARTIAL",
            "expected_delivery_date": (today + datetime.timedelta(days=4)).strftime("%Y-%m-%d"),
            "note": "Hợp đồng may đệm tròn & khay cào móng - đã cọc 50% bằng ủy nhiệm chi ngân hàng Cty",
            "items": [
                {"prod": products[11], "qty": 50, "price": 200000},
                {"prod": products[17], "qty": 80, "price": 105000}
            ]
        },
        {
            "desc": "Đơn 3: DEPOSITED (Đang gia công - Đã cọc 30% bằng Quỹ Cá Nhân - Ko VAT)",
            "partner_id": supp_ids[4],
            "status": "DEPOSITED",
            "fund_source": "PERSONAL",
            "vat_percent": 0.0,
            "discount_percent": 2.0,
            "deposit_percent": 30,
            "payment_status": "PARTIAL",
            "expected_delivery_date": (today + datetime.timedelta(days=2)).strftime("%Y-%m-%d"),
            "note": "Gia công đóng chai sữa tắm spa 500ml - xưởng tư nhân không xuất VAT",
            "items": [
                {"prod": products[4], "qty": 100, "price": 80000},
                {"prod": products[5], "qty": 80, "price": 55000}
            ]
        },
        {
            "desc": "Đơn 4: RECEIVED (Đã giao hàng & Nhập kho - Còn nợ đợt 2 - Quỹ Cty)",
            "partner_id": supp_ids[1],
            "status": "RECEIVED",
            "fund_source": "COMPANY",
            "vat_percent": 8.0,
            "discount_percent": 0.0,
            "deposit_percent": 50,
            "payment_status": "PARTIAL",
            "expected_delivery_date": (today - datetime.timedelta(days=1)).strftime("%Y-%m-%d"),
            "note": "Đã nhận hàng tại kho chính - đối soát đủ số lượng, chờ làm thủ tục chi nốt đợt 2",
            "items": [
                {"prod": products[18], "qty": 120, "price": 90000},
                {"prod": products[19], "qty": 60, "price": 135000}
            ]
        },
        {
            "desc": "Đơn 5: RECEIVED (Đã giao hàng & Quyết toán xong 100% - Đã chi đủ - Quỹ Cty)",
            "partner_id": supp_ids[3],
            "status": "RECEIVED",
            "fund_source": "COMPANY",
            "vat_percent": 8.0,
            "discount_percent": 10.0,
            "deposit_percent": 100,
            "payment_status": "PAID",
            "expected_delivery_date": (today - datetime.timedelta(days=5)).strftime("%Y-%m-%d"),
            "note": "Đơn hàng áo nỉ gấu thu đông - đã thanh toán toàn bộ 100% công nợ",
            "items": [
                {"prod": products[16], "qty": 200, "price": 40000}
            ]
        },
        {
            "desc": "Đơn 6: DRAFT (Đơn nháp gia công phụ kiện dây dắt - Quỹ Cá Nhân)",
            "partner_id": supp_ids[5],
            "status": "DRAFT",
            "fund_source": "PERSONAL",
            "vat_percent": 0.0,
            "discount_percent": 0.0,
            "deposit_amount": 0.0,
            "payment_status": "UNPAID",
            "expected_delivery_date": (today + datetime.timedelta(days=10)).strftime("%Y-%m-%d"),
            "note": "Lên đơn dự kiến làm dây dắt trợ lực phản quang",
            "items": [
                {"prod": products[9], "qty": 100, "price": 65000},
                {"prod": products[10], "qty": 50, "price": 32000}
            ]
        }
    ]
    
    order_idx = 1
    for cfg in oem_configs:
        code = f"OEM-{today.strftime('%Y%m%d')}-{order_idx:03d}"
        order_idx += 1
        
        # Tính toán tiền tệ chuẩn xác
        total_raw = sum(it["qty"] * it["price"] for it in cfg["items"])
        discount_factor = 1.0 - (cfg["discount_percent"] / 100.0)
        vat_factor = 1.0 + (cfg["vat_percent"] / 100.0)
        total_final = round(total_raw * discount_factor * vat_factor)
        
        if "deposit_percent" in cfg:
            deposit_amount = round(total_final * (cfg["deposit_percent"] / 100.0))
        else:
            deposit_amount = cfg.get("deposit_amount", 0.0)
            
        remaining = max(0.0, total_final - deposit_amount)
        deposit_date = (today - datetime.timedelta(days=2)).strftime("%Y-%m-%d 10:00:00") if deposit_amount > 0 else None
        
        cur.execute("""
            INSERT INTO oem_orders (
                code, partner_id, oem_warehouse_id, dest_warehouse_id,
                status, expected_delivery_date, fund_source,
                vat_percent, discount_percent, deposit_amount, deposit_date,
                total_raw_amount, total_final_amount, remaining_payment,
                payment_status, note, created_at
            ) VALUES (?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            code, cfg["partner_id"], cfg["status"], cfg["expected_delivery_date"],
            cfg["fund_source"], cfg["vat_percent"], cfg["discount_percent"],
            deposit_amount, deposit_date, total_raw, total_final, remaining,
            cfg["payment_status"], cfg["note"],
            (today - datetime.timedelta(days=3)).strftime("%Y-%m-%d 09:00:00")
        ))
        order_id = cur.lastrowid
        
        # Chi tiết items
        for it in cfg["items"]:
            prod = it["prod"]
            net_cost = it["price"] * discount_factor * vat_factor
            received_qty = it["qty"] if cfg["status"] == "RECEIVED" else 0
            cur.execute("""
                INSERT INTO oem_order_items (
                    order_id, product_id, ordered_qty, unit_price,
                    final_unit_cost, full_cost_per_unit, received_qty
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (order_id, prod[0], it["qty"], it["price"], net_cost, net_cost, received_qty))
            
        # Nếu đã có phát sinh tiền cọc -> ghi log Sổ Quỹ Thu Chi để bảng dòng tiền & sổ quỹ hiển thị
        if deposit_amount > 0:
            cb_code = f"PC-OEM-{order_id:04d}"
            cur.execute("""
                INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, fund_source, created_at)
                VALUES (?, 'PAYMENT', 'Gia công OEM (Cọc Đợt 1)', ?, ?, 'OEM_ORDER', ?, ?, ?, ?)
            """, (
                cb_code, deposit_amount, cfg["partner_id"], order_id,
                f"Chi cọc hợp đồng gia công {code}", cfg["fund_source"],
                deposit_date or datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ))
            
        print(f"✅ Đã tạo {code}: [{cfg['status']}] - {cfg['desc']}")
        
    conn.commit()
    conn.close()
    print("\n🎉 HOÀN TẤT TẠO FULL DỮ LIỆU MẪU ĐƠN GIA CÔNG OEM!")

if __name__ == "__main__":
    seed_oem_full_states()

"""
Router for Pet Hotel (Khách Sạn Thú Cưng) Management
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, date
import math
import json
from database import get_db
from schemas import (
    HotelRoomCreate, HotelRoomUpdate,
    HotelBookingCheckin, HotelBookingCheckout,
    HotelBatchCheckinItem, HotelBatchCheckinRequest,
    HotelCareLogUpdate
)
from dependencies import get_current_user

router = APIRouter(prefix="/api/hotel", tags=["Hotel"])

def _generate_booking_code(cursor):
    today_prefix = datetime.now().strftime("%y%m%d")
    cursor.execute("SELECT code FROM hotel_bookings WHERE code LIKE ? ORDER BY id DESC LIMIT 1", (f"HT-{today_prefix}-%",))
    last_row = cursor.fetchone()
    if last_row and last_row["code"]:
        try:
            last_seq = int(last_row["code"].split("-")[-1])
            seq = last_seq + 1
        except Exception:
            seq = 1
    else:
        seq = 1
    code = f"HT-{today_prefix}-{seq:04d}"
    cursor.execute("SELECT id FROM hotel_bookings WHERE code = ?", (code,))
    while cursor.fetchone():
        seq += 1
        code = f"HT-{today_prefix}-{seq:04d}"
        cursor.execute("SELECT id FROM hotel_bookings WHERE code = ?", (code,))
    return code

@router.get("/rooms")
def list_hotel_rooms():
    """Lấy danh sách tất cả các buồng phòng kèm thông tin bé đang ở (nếu có)"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT r.*, 
                   b.id as active_booking_id,
                   b.code as booking_code,
                   b.contact_id,
                   b.pet_id,
                   b.check_in_time,
                   b.expected_checkout_time,
                   b.daily_rate,
                   b.feeding_notes,
                   b.items_brought,
                   b.daily_care_log,
                   c.name as contact_name,
                   c.phone as contact_phone,
                   p.name as pet_name,
                   p.breed as pet_breed,
                   p.species as pet_species,
                   p.weight as pet_weight
            FROM hotel_rooms r
            LEFT JOIN hotel_bookings b ON r.id = b.room_id AND b.status = 'active'
            LEFT JOIN contacts c ON b.contact_id = c.id
            LEFT JOIN pets p ON b.pet_id = p.id
            ORDER BY r.zone, r.code ASC
        """)
        rows = cursor.fetchall()
        
        results = []
        now = datetime.now()
        for r in rows:
            item = dict(r)
            if item.get("active_booking_id") and item.get("check_in_time"):
                try:
                    checkin_dt = datetime.fromisoformat(item["check_in_time"].replace("Z", ""))
                    diff_seconds = (now - checkin_dt).total_seconds()
                    # Tối thiểu 1 ngày, sau 24h tính thêm ngày tiếp theo
                    days = max(1, math.ceil(diff_seconds / 86400.0))
                    rate = float(item.get("daily_rate") or item["price_per_day"])
                    item["calculated_days"] = days
                    item["current_total_amount"] = days * rate
                except Exception:
                    item["calculated_days"] = 1
                    item["current_total_amount"] = float(item["price_per_day"])
            else:
                item["calculated_days"] = 0
                item["current_total_amount"] = 0
            results.append(item)
            
        return results

@router.get("/room-groups")
def list_room_groups():
    """Lấy danh sách các nhóm phòng hiện có để gợi ý droplist"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT room_group FROM hotel_rooms WHERE room_group IS NOT NULL AND room_group != '' ORDER BY room_group ASC")
        rows = cursor.fetchall()
        groups = [r["room_group"] for r in rows]
        if not groups:
            groups = ["Khu Mèo (Phòng Gỗ)", "Khu Chó Nhỏ (Inox)", "Khu VIP (Máy Lạnh)"]
        return groups

@router.post("/rooms")
def create_hotel_room(room: HotelRoomCreate):
    """Tạo thêm buồng phòng lưu trú mới"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM hotel_rooms WHERE code = ?", (room.code,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Mã phòng đã tồn tại")
            
        cursor.execute("""
            INSERT INTO hotel_rooms (code, name, zone, room_group, price_per_day, price_per_hour, capacity, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            room.code, room.name, room.zone, room.room_group or "Khu Tiêu Chuẩn",
            room.price_per_day, room.price_per_hour or 0, room.capacity or 1,
            room.description
        ))
        conn.commit()
        r_id = cursor.lastrowid
        cursor.execute("SELECT * FROM hotel_rooms WHERE id = ?", (r_id,))
        return dict(cursor.fetchone())

@router.put("/rooms/{room_id}")
def update_hotel_room(room_id: int, room: HotelRoomUpdate):
    """Cập nhật thông tin hoặc trạng thái buồng phòng"""
    with get_db() as conn:
        cursor = conn.cursor()
        fields = []
        values = []
        if room.code is not None:
            fields.append("code = ?")
            values.append(room.code)
        if room.name is not None:
            fields.append("name = ?")
            values.append(room.name)
        if room.zone is not None:
            fields.append("zone = ?")
            values.append(room.zone)
        if room.room_group is not None:
            fields.append("room_group = ?")
            values.append(room.room_group)
        if room.price_per_day is not None:
            fields.append("price_per_day = ?")
            values.append(room.price_per_day)
        if room.price_per_hour is not None:
            fields.append("price_per_hour = ?")
            values.append(room.price_per_hour)
        if room.capacity is not None:
            fields.append("capacity = ?")
            values.append(room.capacity)
        if room.status is not None:
            fields.append("status = ?")
            values.append(room.status)
        if room.description is not None:
            fields.append("description = ?")
            values.append(room.description)
            
        if not fields:
            return {"message": "Không có trường nào để cập nhật"}
            
        values.append(room_id)
        cursor.execute(f"UPDATE hotel_rooms SET {', '.join(fields)} WHERE id = ?", tuple(values))
        conn.commit()
        cursor.execute("SELECT * FROM hotel_rooms WHERE id = ?", (room_id,))
        return dict(cursor.fetchone())

@router.delete("/rooms/{room_id}")
def delete_hotel_room(room_id: int):
    """Xóa buồng phòng nếu đang ở trạng thái trống và không có lịch sử booking ràng buộc"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, status, code FROM hotel_rooms WHERE id = ?", (room_id,))
        room = cursor.fetchone()
        if not room:
            raise HTTPException(status_code=404, detail="Không tìm thấy buồng phòng")
        if room["status"] == "occupied":
            raise HTTPException(status_code=400, detail="Không thể xóa buồng phòng đang có bé lưu trú")
        cursor.execute("SELECT COUNT(*) as cnt FROM hotel_bookings WHERE room_id = ?", (room_id,))
        if cursor.fetchone()["cnt"] > 0:
            raise HTTPException(status_code=400, detail="Không thể xóa buồng phòng đã có dữ liệu lưu trú lịch sử")
        cursor.execute("DELETE FROM hotel_rooms WHERE id = ?", (room_id,))
        conn.commit()
        return {"success": True, "message": f"Đã xóa phòng {room['code']}"}

@router.post("/transfer-from-spa/{ticket_id}")
def transfer_from_spa(ticket_id: int, payload: dict):
    """Chuyển tiếp bé từ vé Spa sang lưu trú Hotel"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM pet_service_tickets WHERE id = ?", (ticket_id,))
        ticket = cursor.fetchone()
        if not ticket:
            raise HTTPException(status_code=404, detail="Không tìm thấy vé dịch vụ Spa")

        room_id = payload.get("room_id")
        if not room_id:
            raise HTTPException(status_code=400, detail="Vui lòng chọn buồng phòng lưu trú")

        cursor.execute("SELECT * FROM hotel_rooms WHERE id = ?", (room_id,))
        room = cursor.fetchone()
        if not room:
            raise HTTPException(status_code=404, detail="Không tìm thấy buồng phòng")
        if room["status"] == "occupied":
            raise HTTPException(status_code=400, detail=f"Phòng {room['code']} hiện đang có khách")

        today_prefix = datetime.now().strftime("%y%m%d")
        booking_code = _generate_booking_code(cursor)

        checkin_time = datetime.now().isoformat()
        expected_checkout = payload.get("expected_checkout_time") or datetime.now().isoformat()
        rate = float(room["price_per_day"])
        deposit = float(payload.get("deposit_amount", 0) or 0)
        pet_weight = float(ticket["weight_at_service"] or 0)
        feeding = payload.get("feeding_notes") or ""
        items = payload.get("items_brought") or ""
        health = f"Spa xong ({ticket['service_type'] or ''})"

        care_log = json.dumps([{
            "time": datetime.now().strftime("%d/%m %H:%M"),
            "event": f"Hoàn thành Spa ({ticket['service_type']}) và chuyển vào buồng phòng {room['code']}."
        }], ensure_ascii=False)

        cursor.execute("""
            INSERT INTO hotel_bookings (
                code, room_id, contact_id, pet_id, check_in_time,
                expected_checkout_time, daily_rate, pet_weight_at_checkin,
                health_condition, deposit_amount, feeding_notes, items_brought,
                daily_care_log, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        """, (
            booking_code, room_id, ticket["customer_id"], ticket["pet_id"],
            checkin_time, expected_checkout, rate, pet_weight,
            health, deposit, feeding, items, care_log
        ))
        booking_id = cursor.lastrowid

        # Gắn hotel_booking_id vào vé spa
        cursor.execute("UPDATE pet_service_tickets SET hotel_booking_id = ?, target_hotel_room_id = ? WHERE id = ?", (booking_id, room_id, ticket_id))

        # Cập nhật buồng phòng sang occupied
        cursor.execute("UPDATE hotel_rooms SET status = 'occupied' WHERE id = ?", (room_id,))

        conn.commit()
        return {
            "success": True,
            "booking_id": booking_id,
            "code": booking_code,
            "room_code": room["code"],
            "message": "Chuyển tiếp vào Khách Sạn thành công"
        }

@router.post("/book-spa-for-guest/{booking_id}")
def book_spa_for_guest(booking_id: int, payload: dict):
    """Đặt lịch làm dịch vụ Spa cho bé đang lưu trú Hotel"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT b.*, r.code as room_code, p.name as pet_name, p.breed as pet_breed, p.weight as pet_weight
            FROM hotel_bookings b
            JOIN hotel_rooms r ON b.room_id = r.id
            LEFT JOIN pets p ON b.pet_id = p.id
            WHERE b.id = ? AND b.status = 'active'
        """, (booking_id,))
        booking = cursor.fetchone()
        if not booking:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu lưu trú đang hoạt động")

        service_type = payload.get("service_type", "Dịch vụ Spa")
        price = float(payload.get("price", 0) or 0)
        note = payload.get("note", "")

        cursor.execute("""
            INSERT INTO pet_service_tickets (
                customer_id, pet_id, service_type, price, status,
                note, hotel_booking_id, target_hotel_room_id, weight_at_service
            ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
        """, (
            booking["contact_id"], booking["pet_id"],
            service_type, price, f"Lưu trú tại {booking['room_code']}: {note}",
            booking_id, booking["room_id"], booking["pet_weight_at_checkin"] or booking["pet_weight"] or 0
        ))
        ticket_id = cursor.lastrowid

        # Cập nhật daily_care_log của booking
        existing_log = []
        if booking["daily_care_log"]:
            try:
                existing_log = json.loads(booking["daily_care_log"])
            except Exception:
                pass
        existing_log.append({
            "time": datetime.now().strftime("%d/%m %H:%M"),
            "event": f"Đặt lịch Spa [{service_type}], chi phí: {price:,.0f} đ."
        })
        cursor.execute("UPDATE hotel_bookings SET daily_care_log = ? WHERE id = ?", (json.dumps(existing_log, ensure_ascii=False), booking_id))

        conn.commit()
        return {
            "success": True,
            "ticket_id": ticket_id,
            "message": "Đã tạo phiếu làm dịch vụ Spa cho bé"
        }

@router.get("/checkout-summary/{booking_id}")
def get_checkout_summary(booking_id: int):
    """Tính toán chi phí gộp: tiền phòng + các dịch vụ Spa đi kèm - tiền cọc"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT b.*, r.code as room_code, r.name as room_name, r.price_per_day,
                   c.name as contact_name, c.phone as contact_phone,
                   p.name as pet_name, p.breed as pet_breed
            FROM hotel_bookings b
            JOIN hotel_rooms r ON b.room_id = r.id
            JOIN contacts c ON b.contact_id = c.id
            LEFT JOIN pets p ON b.pet_id = p.id
            WHERE b.id = ?
        """, (booking_id,))
        booking = cursor.fetchone()
        if not booking:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu lưu trú")

        # Tính số ngày lưu trú
        checkin_dt = datetime.fromisoformat(booking["check_in_time"].replace("Z", ""))
        now_dt = datetime.now()
        total_seconds = (now_dt - checkin_dt).total_seconds()
        days = math.ceil(total_seconds / 86400) if total_seconds > 0 else 1
        if days < 1:
            days = 1

        daily_rate = float(booking["daily_rate"])
        room_total = days * daily_rate

        # Lấy tất cả vé Spa gắn với booking này
        cursor.execute("""
            SELECT id, code, service_type, price, status, staff_cutter, created_at
            FROM pet_service_tickets
            WHERE hotel_booking_id = ?
        """, (booking_id,))
        spa_tickets = [dict(r) for r in cursor.fetchall()]
        spa_total = sum(float(t["price"] or 0) for t in spa_tickets)

        deposit = float(booking["deposit_amount"] or 0)
        grand_total = max(0, room_total + spa_total - deposit)

        return {
            "booking_id": booking["id"],
            "code": booking["code"],
            "room_code": booking["room_code"],
            "room_name": booking["room_name"],
            "contact_name": booking["contact_name"],
            "contact_phone": booking["contact_phone"],
            "pet_name": booking["pet_name"] or "Bé cưng",
            "check_in_time": booking["check_in_time"],
            "calculated_days": days,
            "daily_rate": daily_rate,
            "room_total": room_total,
            "spa_tickets": spa_tickets,
            "spa_total": spa_total,
            "deposit_amount": deposit,
            "grand_total": grand_total
        }

@router.get("/bookings/active")
def list_active_bookings():
    """Lấy danh sách các phiếu đang lưu trú"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT b.*,
                   r.code as room_code,
                   r.name as room_name,
                   r.zone as room_zone,
                   c.name as contact_name,
                   c.phone as contact_phone,
                   p.name as pet_name,
                   p.breed as pet_breed,
                   p.weight as pet_weight
            FROM hotel_bookings b
            JOIN hotel_rooms r ON b.room_id = r.id
            JOIN contacts c ON b.contact_id = c.id
            JOIN pets p ON b.pet_id = p.id
            WHERE b.status = 'active'
            ORDER BY b.check_in_time DESC
        """)
        rows = cursor.fetchall()
        
        now = datetime.now()
        results = []
        for r in rows:
            item = dict(r)
            if item.get("check_in_time"):
                try:
                    checkin_dt = datetime.fromisoformat(item["check_in_time"].replace("Z", ""))
                    diff_seconds = (now - checkin_dt).total_seconds()
                    days = max(1, math.ceil(diff_seconds / 86400.0))
                    item["calculated_days"] = days
                    item["current_total_amount"] = days * float(item["daily_rate"])
                except Exception:
                    item["calculated_days"] = 1
                    item["current_total_amount"] = float(item["daily_rate"])
            results.append(item)
            
        return results

@router.get("/bookings/history")
def list_booking_history(limit: int = 50, search: str = ""):
    """Lấy lịch sử các phiếu lưu trú đã hoàn tất (cho tab Hóa Đơn và tra cứu)"""
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT b.*,
                   r.code as room_code,
                   r.name as room_name,
                   r.zone as room_zone,
                   c.name as contact_name,
                   c.phone as contact_phone,
                   p.name as pet_name,
                   p.breed as pet_breed,
                   o.code as order_code
            FROM hotel_bookings b
            JOIN hotel_rooms r ON b.room_id = r.id
            JOIN contacts c ON b.contact_id = c.id
            JOIN pets p ON b.pet_id = p.id
            LEFT JOIN orders o ON b.order_id = o.id
            WHERE b.status = 'completed'
        """
        params = []
        if search:
            query += " AND (b.code LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR p.name LIKE ?)"
            s = f"%{search}%"
            params.extend([s, s, s, s])
            
        query += " ORDER BY b.actual_checkout_time DESC LIMIT ?"
        params.append(limit)
        
        cursor.execute(query, tuple(params))
        return [dict(r) for r in cursor.fetchall()]

@router.post("/checkin")
def checkin_hotel_guest(data: HotelBookingCheckin):
    """Nhận bé vào lưu trú (Check-in)"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Kiểm tra buồng phòng
        cursor.execute("SELECT status, price_per_day FROM hotel_rooms WHERE id = ?", (data.room_id,))
        room = cursor.fetchone()
        if not room:
            raise HTTPException(status_code=404, detail="Không tìm thấy buồng phòng")
        if room["status"] == "occupied":
            raise HTTPException(status_code=400, detail="Buồng phòng này hiện đang có khách lưu trú")
            
        rate = data.daily_rate if data.daily_rate is not None else float(room["price_per_day"])
        check_in_time = data.check_in_time or datetime.now().isoformat()
        
        # Sinh mã phiếu HT-YYMMDD-XXXX
        today_prefix = datetime.now().strftime("%y%m%d")
        booking_code = _generate_booking_code(cursor)
        
        cursor.execute("""
            INSERT INTO hotel_bookings (
                code, room_id, contact_id, pet_id, check_in_time, 
                expected_checkout_time, daily_rate, feeding_notes, 
                items_brought, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        """, (
            booking_code, data.room_id, data.contact_id, data.pet_id,
            check_in_time, data.expected_checkout_time, rate,
            data.feeding_notes, data.items_brought
        ))
        booking_id = cursor.lastrowid
        
        # Cập nhật buồng phòng sang occupied
        cursor.execute("UPDATE hotel_rooms SET status = 'occupied' WHERE id = ?", (data.room_id,))
        
        conn.commit()
        return {
            "booking_id": booking_id,
            "code": booking_code,
            "message": "Check-in thành công"
        }

@router.post("/checkin-batch")
def checkin_hotel_batch(data: HotelBatchCheckinRequest):
    """Tiếp nhận một hoặc nhiều bé cùng lúc vào các buồng phòng (Check-in Batch)"""
    if not data.items:
        raise HTTPException(status_code=400, detail="Danh sách tiếp nhận không được để trống")

    with get_db() as conn:
        cursor = conn.cursor()

        # 1. Kiểm tra khách hàng tồn tại
        cursor.execute("SELECT id, name, phone FROM contacts WHERE id = ?", (data.contact_id,))
        contact = cursor.fetchone()
        if not contact:
            raise HTTPException(status_code=404, detail="Không tìm thấy thông tin khách hàng")

        # 2. Sinh mã đợt HTB-YYMMDD-XXXX
        today_prefix = datetime.now().strftime("%y%m%d")
        cursor.execute("SELECT COUNT(DISTINCT batch_code) as cnt FROM hotel_bookings WHERE batch_code LIKE ?", (f"HTB-{today_prefix}-%",))
        batch_seq = cursor.fetchone()["cnt"] + 1
        batch_code = f"HTB-{today_prefix}-{batch_seq:04d}"

        # 3. Lấy số thứ tự booking hôm nay
        cursor.execute("SELECT COUNT(*) as cnt FROM hotel_bookings WHERE code LIKE ?", (f"HT-{today_prefix}-%",))
        booking_seq_base = cursor.fetchone()["cnt"]

        created_bookings = []
        check_in_time = data.check_in_time or datetime.now().isoformat()
        expected_checkout = data.expected_checkout_time or datetime.now().isoformat()

        # Kiểm tra trùng lặp room_id trong batch
        room_ids = [item.room_id for item in data.items]
        if len(room_ids) != len(set(room_ids)):
            raise HTTPException(status_code=400, detail="Không được chọn trùng buồng phòng trong cùng một đợt tiếp nhận")

        for idx, item in enumerate(data.items):
            # Kiểm tra buồng phòng
            cursor.execute("SELECT id, code, name, status, price_per_day FROM hotel_rooms WHERE id = ?", (item.room_id,))
            room = cursor.fetchone()
            if not room:
                raise HTTPException(status_code=404, detail=f"Không tìm thấy buồng phòng id {item.room_id}")
            if room["status"] == "occupied":
                raise HTTPException(status_code=400, detail=f"Buồng phòng {room['code']} hiện đang có khách lưu trú")

            # Xử lý pet_id
            pet_id = item.pet_id
            pet_name = item.pet_name
            if not pet_id or pet_id <= 0:
                pet_name = item.pet_name or f"Bé {room['code']}"
                pet_breed = item.pet_breed or "Chó/Mèo cảnh"
                cursor.execute("""
                    INSERT INTO pets (customer_id, name, breed, species, weight)
                    VALUES (?, ?, ?, 'pet', ?)
                """, (data.contact_id, pet_name, pet_breed, item.pet_weight or 0))
                pet_id = cursor.lastrowid
            elif not pet_name:
                cursor.execute("SELECT name FROM pets WHERE id = ?", (pet_id,))
                p_row = cursor.fetchone()
                if p_row:
                    pet_name = p_row["name"]

            rate = item.daily_rate if item.daily_rate is not None else float(room["price_per_day"])
            booking_code = _generate_booking_code(cursor)
            
            deposit_for_row = data.deposit_amount if idx == 0 else 0

            cursor.execute("""
                INSERT INTO hotel_bookings (
                    code, batch_code, room_id, contact_id, pet_id,
                    check_in_time, expected_checkout_time, daily_rate,
                    pet_weight_at_checkin, health_condition, deposit_amount,
                    feeding_notes, items_brought, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
            """, (
                booking_code, batch_code, item.room_id, data.contact_id, pet_id,
                check_in_time, expected_checkout, rate,
                item.pet_weight or 0, item.health_condition, deposit_for_row,
                item.feeding_notes, item.items_brought
            ))
            b_id = cursor.lastrowid

            # Cập nhật buồng phòng sang occupied
            cursor.execute("UPDATE hotel_rooms SET status = 'occupied' WHERE id = ?", (item.room_id,))

            created_bookings.append({
                "booking_id": b_id,
                "code": booking_code,
                "batch_code": batch_code,
                "room_id": item.room_id,
                "room_code": room["code"],
                "room_name": room["name"],
                "pet_id": pet_id,
                "pet_name": pet_name,
                "pet_weight": item.pet_weight,
                "daily_rate": rate,
                "health_condition": item.health_condition,
                "feeding_notes": item.feeding_notes,
                "items_brought": item.items_brought
            })

        conn.commit()

        return {
            "success": True,
            "batch_code": batch_code,
            "count": len(created_bookings),
            "contact_name": contact["name"],
            "contact_phone": contact["phone"],
            "check_in_time": check_in_time,
            "expected_checkout_time": expected_checkout,
            "deposit_amount": data.deposit_amount or 0,
            "bookings": created_bookings
        }

@router.get("/bookings/batch/{batch_code}")
def get_hotel_batch(batch_code: str):
    """Lấy thông tin đợt tiếp nhận theo batch_code để in phiếu K80"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT b.*, 
                   r.code as room_code, r.name as room_name, r.zone as room_zone,
                   c.name as contact_name, c.phone as contact_phone,
                   p.name as pet_name, p.breed as pet_breed, p.species as pet_species
            FROM hotel_bookings b
            JOIN hotel_rooms r ON b.room_id = r.id
            JOIN contacts c ON b.contact_id = c.id
            LEFT JOIN pets p ON b.pet_id = p.id
            WHERE b.batch_code = ?
            ORDER BY b.id ASC
        """, (batch_code,))
        rows = cursor.fetchall()
        if not rows:
            raise HTTPException(status_code=404, detail="Không tìm thấy đợt tiếp nhận")
        return [dict(r) for r in rows]

@router.post("/checkout/{booking_id}")
def checkout_hotel_guest(booking_id: int, data: HotelBookingCheckout):
    """Trả phòng & kết thúc lưu trú (Check-out)"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT b.*, r.price_per_day, c.name as contact_name
            FROM hotel_bookings b
            JOIN hotel_rooms r ON b.room_id = r.id
            JOIN contacts c ON b.contact_id = c.id
            WHERE b.id = ? AND b.status = 'active'
        """, (booking_id,))
        booking = cursor.fetchone()
        if not booking:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu lưu trú đang hoạt động")
            
        checkout_time = data.actual_checkout_time or datetime.now().isoformat()
        
        # Tính toán ngày và số tiền
        if data.total_days is not None:
            days = data.total_days
        else:
            try:
                checkin_dt = datetime.fromisoformat(booking["check_in_time"].replace("Z", ""))
                checkout_dt = datetime.fromisoformat(checkout_time.replace("Z", ""))
                diff_seconds = (checkout_dt - checkin_dt).total_seconds()
                days = max(1, math.ceil(diff_seconds / 86400.0))
            except Exception:
                days = 1
                
        rate = float(booking["daily_rate"])
        total_amount = data.total_amount if data.total_amount is not None else (days * rate)
        
        # Cập nhật phiếu lưu trú thành completed
        cursor.execute("""
            UPDATE hotel_bookings
            SET status = 'completed',
                actual_checkout_time = ?,
                total_days = ?,
                total_amount = ?
            WHERE id = ?
        """, (checkout_time, days, total_amount, booking_id))
        
        # Giải phóng phòng về available
        cursor.execute("UPDATE hotel_rooms SET status = 'available' WHERE id = ?", (booking["room_id"],))
        
        conn.commit()
        return {
            "booking_id": booking_id,
            "total_days": days,
            "total_amount": total_amount,
            "message": "Check-out hoàn tất, phòng đã sẵn sàng đón bé mới"
        }

@router.patch("/bookings/{booking_id}/care-log")
def update_hotel_care_log(booking_id: int, data: HotelCareLogUpdate):
    """Cập nhật nhật ký chăm sóc / ăn uống hàng ngày"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE hotel_bookings
            SET daily_care_log = ?
            WHERE id = ?
        """, (data.daily_care_log, booking_id))
        conn.commit()
        return {"message": "Cập nhật nhật ký chăm sóc thành công"}

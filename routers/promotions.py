import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
from schemas import (
    PromotionCreate,
    PromotionUpdate,
    PromotionItemCreate,
    PromotionSpaItemCreate,
    PricingCalculateRequest,
    PricingSpaCalculateRequest,
)
from logger_config import get_module_logger
from dependencies import require_permission

logger = get_module_logger("promotions")

router = APIRouter(tags=["Promotions & Pricing"])

# ==================== HELPER: BEST OFFER PRICING ====================

def calculate_effective_price(product_id: int, customer_id: Optional[int] = None, base_price: Optional[float] = None, db=None) -> dict:
    """
    Tính giá tốt nhất (Best Offer):
    a) P_goc: Base sell_price
    b) P_hang: Giá theo phân khúc khách hàng (price_lists hoặc discount_percent)
    c) P_km: Giá khuyến mãi tốt nhất (promotion_items hợp lệ theo ngày & is_active)
    d) Best offer: min(P_goc, P_hang, P_km)
    """
    close_db = False
    if db is None:
        db = get_db()
        close_db = True

    try:
        cur = db.cursor()

        # 1. Base price
        if base_price is None:
            cur.execute("SELECT sell_price FROM products WHERE id = ?", (product_id,))
            p_row = cur.fetchone()
            if not p_row:
                base_price = 0.0
            else:
                base_price = float(p_row["sell_price"] or 0.0)
        else:
            base_price = float(base_price)

        p_goc = base_price
        p_hang = p_goc
        segment_price_list_id = None

        # 2. Customer segment pricing
        if customer_id:
            cur.execute("""
                SELECT c.segment_id, cs.discount_percent, cs.price_list_id
                FROM contacts c
                LEFT JOIN customer_segments cs ON c.segment_id = cs.id
                WHERE c.id = ?
            """, (customer_id,))
            c_row = cur.fetchone()
            if c_row and c_row["segment_id"]:
                seg_disc = float(c_row["discount_percent"] or 0.0)
                pl_id = c_row["price_list_id"]

                matched_price_list = False
                if pl_id:
                    cur.execute("""
                        SELECT price, discount_percent
                        FROM product_price_list
                        WHERE price_list_id = ? AND product_id = ?
                    """, (pl_id, product_id))
                    ppl_row = cur.fetchone()
                    if ppl_row:
                        matched_price_list = True
                        segment_price_list_id = pl_id
                        custom_price = ppl_row["price"]
                        custom_disc = float(ppl_row["discount_percent"] or 0.0)
                        if custom_price is not None and custom_price > 0:
                            p_hang = float(custom_price)
                        elif custom_disc > 0:
                            p_hang = max(0.0, p_goc * (1.0 - custom_disc / 100.0))

                if not matched_price_list and seg_disc > 0:
                    p_hang = max(0.0, p_goc * (1.0 - seg_disc / 100.0))

        # 3. Promotions pricing
        today_str = datetime.date.today().isoformat()
        cur.execute("""
            SELECT pi.discount_type, pi.discount_val, p.id as promo_id
            FROM promotion_items pi
            JOIN promotions p ON pi.promotion_id = p.id
            WHERE pi.product_id = ?
              AND COALESCE(p.is_active, 1) = 1
              AND (p.start_date IS NULL OR CAST(p.start_date AS TEXT) = '' OR p.start_date <= ?)
              AND (p.end_date IS NULL OR CAST(p.end_date AS TEXT) = '' OR p.end_date >= ?)
        """, (product_id, today_str, today_str))
        promos = cur.fetchall()

        best_p_km = p_goc
        best_promo_id = None

        for pr in promos:
            dtype = pr["discount_type"]
            dval = float(pr["discount_val"] or 0.0)
            if dtype == "pct":
                calc_p = max(0.0, p_goc * (1.0 - dval / 100.0))
            elif dtype == "fixed":
                calc_p = max(0.0, p_goc - dval)
            else:
                calc_p = p_goc

            if calc_p < best_p_km:
                best_p_km = calc_p
                best_promo_id = pr["promo_id"]

        # 4. Best Offer rule: min(P_goc, P_hang, P_km)
        final_price = p_goc
        applied_source = "original"
        applied_promo_id = None
        applied_price_list_id = None

        if p_hang < final_price:
            final_price = p_hang
            applied_source = "segment_price_list"
            applied_price_list_id = segment_price_list_id

        if best_p_km < final_price:
            final_price = best_p_km
            applied_source = "promotion"
            applied_promo_id = best_promo_id
            applied_price_list_id = None

        discount_applied = max(0.0, p_goc - final_price)

        return {
            "product_id": product_id,
            "base_price": p_goc,
            "final_price": round(final_price, 2),
            "discount_applied": round(discount_applied, 2),
            "applied_source": applied_source,
            "promo_id": applied_promo_id,
            "price_list_id": applied_price_list_id
        }
    finally:
        if close_db:
            db.close()


def calculate_effective_spa_price(service_name: str, weight: float, customer_id: Optional[int] = None, db=None) -> dict:
    """
    Tính giá tốt nhất (Best Offer) cho Dịch Vụ Spa:
    a) P_goc: Lấy từ pet_service_pricing theo service_name và dải cân nặng (min_weight <= weight < max_weight)
    b) P_hang: Giá theo phân khúc khách (price_list_spa_items theo service_name hoặc spa_category, hoặc % giảm phân khúc)
    c) P_km: Giá khuyến mãi tốt nhất (promotion_items với target_type IN ('spa_service', 'spa_category'))
    d) Best offer: min(P_goc, P_hang, P_km)
    """
    close_db = False
    if db is None:
        db = get_db()
        close_db = True

    try:
        cur = db.cursor()

        # 1. Base price từ pet_service_pricing (Khớp tên không phân biệt hoa thường và dải cân thông minh)
        cur.execute("""
            SELECT id, service_name, category, min_weight, max_weight, price
            FROM pet_service_pricing
            WHERE service_name = ? COLLATE NOCASE
              AND min_weight <= ?
              AND (max_weight >= ? OR max_weight IS NULL OR max_weight = 0)
            ORDER BY min_weight DESC
            LIMIT 1
        """, (service_name, weight, weight))
        sp_row = cur.fetchone()

        # Fallback 1: Nếu cân nặng vượt quá khung tối đa của gói này (ví dụ bé 12kg mà mức cao nhất là 10kg)
        if not sp_row:
            cur.execute("""
                SELECT id, service_name, category, min_weight, max_weight, price
                FROM pet_service_pricing
                WHERE service_name = ? COLLATE NOCASE
                ORDER BY max_weight DESC, min_weight DESC
                LIMIT 1
            """, (service_name,))
            sp_row = cur.fetchone()

        # Fallback 2: Nếu chưa tìm được, tìm mức gần nhất
        if not sp_row:
            cur.execute("""
                SELECT id, service_name, category, min_weight, max_weight, price
                FROM pet_service_pricing
                WHERE service_name = ? COLLATE NOCASE
                ORDER BY ABS(min_weight - ?) ASC
                LIMIT 1
            """, (service_name, weight))
            sp_row = cur.fetchone()

        if not sp_row:
            p_goc = 0.0
            category = ""
        else:
            p_goc = float(sp_row["price"] or 0.0)
            category = sp_row["category"] or ""

        p_hang = p_goc
        segment_price_list_id = None

        # 2. Customer segment / price list
        if customer_id:
            cur.execute("""
                SELECT c.segment_id, cs.discount_percent, cs.price_list_id
                FROM contacts c
                LEFT JOIN customer_segments cs ON c.segment_id = cs.id
                WHERE c.id = ?
            """, (customer_id,))
            c_row = cur.fetchone()
            if c_row and c_row["segment_id"]:
                seg_disc = float(c_row["discount_percent"] or 0.0)
                pl_id = c_row["price_list_id"]

                matched_price_list = False
                if pl_id:
                    # Check bảng price_list_spa_items khớp service_name hoặc category
                    cur.execute("""
                        SELECT discount_percent
                        FROM price_list_spa_items
                        WHERE price_list_id = ?
                          AND (
                              (target_type = 'service' AND service_name = ?) OR
                              (target_type = 'category' AND spa_category = ?)
                          )
                        ORDER BY (CASE WHEN target_type = 'service' THEN 1 ELSE 2 END) ASC
                        LIMIT 1
                    """, (pl_id, service_name, category))
                    pl_spa = cur.fetchone()
                    if pl_spa:
                        matched_price_list = True
                        segment_price_list_id = pl_id
                        d_pct = float(pl_spa["discount_percent"] or 0.0)
                        if d_pct > 0:
                            p_hang = max(0.0, p_goc * (1.0 - d_pct / 100.0))

                if not matched_price_list and seg_disc > 0:
                    p_hang = max(0.0, p_goc * (1.0 - seg_disc / 100.0))

        # 3. Promotions pricing
        today_str = datetime.date.today().isoformat()
        cur.execute("""
            SELECT pi.discount_type, pi.discount_val, p.id as promo_id
            FROM promotion_items pi
            JOIN promotions p ON pi.promotion_id = p.id
            WHERE (
                (pi.target_type = 'spa_service' AND pi.service_name = ?) OR
                (pi.target_type = 'spa_category' AND pi.spa_category = ?)
            )
              AND COALESCE(p.is_active, 1) = 1
              AND (p.start_date IS NULL OR CAST(p.start_date AS TEXT) = '' OR p.start_date <= ?)
              AND (p.end_date IS NULL OR CAST(p.end_date AS TEXT) = '' OR p.end_date >= ?)
        """, (service_name, category, today_str, today_str))
        promos = cur.fetchall()

        best_p_km = p_goc
        best_promo_id = None

        for pr in promos:
            dtype = pr["discount_type"]
            dval = float(pr["discount_val"] or 0.0)
            if dtype == "pct":
                calc_p = max(0.0, p_goc * (1.0 - dval / 100.0))
            elif dtype == "fixed":
                calc_p = max(0.0, p_goc - dval)
            else:
                calc_p = p_goc

            if calc_p < best_p_km:
                best_p_km = calc_p
                best_promo_id = pr["promo_id"]

        # 4. Best Offer rule: min(P_goc, P_hang, P_km)
        final_price = p_goc
        applied_source = "original"
        applied_promo_id = None
        applied_price_list_id = None

        if p_hang < final_price:
            final_price = p_hang
            applied_source = "segment_price_list"
            applied_price_list_id = segment_price_list_id

        if best_p_km < final_price:
            final_price = best_p_km
            applied_source = "promotion"
            applied_promo_id = best_promo_id
            applied_price_list_id = None

        discount_applied = max(0.0, p_goc - final_price)

        return {
            "service_name": service_name,
            "category": category,
            "weight": weight,
            "base_price": p_goc,
            "final_price": round(final_price, 2),
            "discount_applied": round(discount_applied, 2),
            "applied_source": applied_source,
            "promo_id": applied_promo_id,
            "price_list_id": applied_price_list_id
        }
    finally:
        if close_db:
            db.close()


# ==================== PRICING ENDPOINT ====================

@router.post("/api/pricing/calculate-spa")
def calculate_spa_pricing(req: PricingSpaCalculateRequest):
    return calculate_effective_spa_price(
        service_name=req.service_name,
        weight=req.weight,
        customer_id=req.customer_id
    )

@router.post("/api/pricing/calculate")
def calculate_pricing(req: PricingCalculateRequest):
    db = get_db()
    try:
        items_result = []
        for it in req.items:
            res = calculate_effective_price(
                product_id=it.product_id,
                customer_id=req.customer_id,
                db=db
            )
            res["quantity"] = it.quantity
            res["subtotal"] = round(res["final_price"] * it.quantity, 2)
            items_result.append(res)
        return {
            "customer_id": req.customer_id,
            "items": items_result,
            "total_amount": round(sum(x["subtotal"] for x in items_result), 2)
        }
    finally:
        db.close()


# ==================== CRUD PROMOTIONS ====================

@router.get("/api/promotions")
def list_promotions():
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        SELECT p.*,
               (SELECT COUNT(*) FROM promotion_items pi WHERE pi.promotion_id = p.id) as item_count
        FROM promotions p
        ORDER BY p.id DESC
    """)
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows

@router.get("/api/promotions/{promo_id}")
def get_promotion(promo_id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM promotions WHERE id = ?", (promo_id,))
    row = cur.fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy chương trình khuyến mãi")
    result = dict(row)
    cur.execute("""
        SELECT pi.*, 
               p.name as product_name, 
               p.code as product_code, 
               p.sell_price as base_price
        FROM promotion_items pi
        LEFT JOIN products p ON pi.product_id = p.id
        WHERE pi.promotion_id = ?
        ORDER BY pi.id ASC
    """, (promo_id,))
    items = []
    for r in cur.fetchall():
        d = dict(r)
        if d.get("target_type") == "spa_service":
            d["display_name"] = f"💆 [Spa] {d['service_name']}"
        elif d.get("target_type") == "spa_category":
            d["display_name"] = f"💆 [Nhóm Spa] {d['spa_category']}"
        else:
            d["display_name"] = d.get("product_name") or "Sản phẩm"
        items.append(d)
    result["items"] = items
    db.close()
    return result

@router.post("/api/promotions")
def create_promotion(req: PromotionCreate, user=Depends(require_permission("price_lists.manage"))):
    db = get_db()
    cur = db.cursor()
    code = req.code
    if not code:
        code = f"KM-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
    try:
        cur.execute("""
            INSERT INTO promotions (code, name, start_date, end_date, is_active)
            VALUES (?, ?, ?, ?, ?)
        """, (code, req.name, req.start_date, req.end_date, 1 if req.is_active is None else req.is_active))
        promo_id = cur.lastrowid
        db.commit()
    except Exception as e:
        db.close()
        raise HTTPException(status_code=400, detail=str(e))
    db.close()
    return {"status": "ok", "id": promo_id, "code": code}

@router.put("/api/promotions/{promo_id}")
def update_promotion(promo_id: int, req: PromotionUpdate, user=Depends(require_permission("price_lists.manage"))):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id FROM promotions WHERE id = ?", (promo_id,))
    if not cur.fetchone():
        db.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy chương trình khuyến mãi")

    fields = []
    vals = []
    if req.code is not None:
        fields.append("code = ?"); vals.append(req.code)
    if req.name is not None:
        fields.append("name = ?"); vals.append(req.name)
    if req.start_date is not None:
        fields.append("start_date = ?"); vals.append(req.start_date)
    if req.end_date is not None:
        fields.append("end_date = ?"); vals.append(req.end_date)
    if req.is_active is not None:
        fields.append("is_active = ?"); vals.append(req.is_active)

    if fields:
        vals.append(promo_id)
        try:
            cur.execute(f"UPDATE promotions SET {', '.join(fields)} WHERE id = ?", vals)
            db.commit()
        except Exception as e:
            db.close()
            raise HTTPException(status_code=400, detail=str(e))
    db.close()
    return {"status": "ok"}

@router.delete("/api/promotions/{promo_id}")
def delete_promotion(promo_id: int, user=Depends(require_permission("price_lists.manage"))):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id FROM promotions WHERE id = ?", (promo_id,))
    if not cur.fetchone():
        db.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy chương trình khuyến mãi")

    cur.execute("DELETE FROM promotion_items WHERE promotion_id = ?", (promo_id,))
    cur.execute("DELETE FROM promotions WHERE id = ?", (promo_id,))
    db.commit()
    db.close()
    return {"status": "ok"}


@router.post("/api/promotions/{promo_id}/items/spa")
def add_promotion_spa_item(promo_id: int, req: PromotionSpaItemCreate, user=Depends(require_permission("price_lists.manage"))):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id FROM promotions WHERE id = ?", (promo_id,))
    if not cur.fetchone():
        db.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy chương trình khuyến mãi")

    if req.target_type == "spa_service":
        if not req.service_name:
            db.close()
            raise HTTPException(status_code=400, detail="Vui lòng cung cấp service_name")
        # Xóa cấu hình cũ của cùng service trong KM này nếu có
        cur.execute("DELETE FROM promotion_items WHERE promotion_id = ? AND target_type = 'spa_service' AND service_name = ?", (promo_id, req.service_name))
        cur.execute("""
            INSERT INTO promotion_items (promotion_id, target_type, service_name, discount_type, discount_val)
            VALUES (?, 'spa_service', ?, ?, ?)
        """, (promo_id, req.service_name, req.discount_type, req.discount_val))
    elif req.target_type == "spa_category":
        if not req.spa_category:
            db.close()
            raise HTTPException(status_code=400, detail="Vui lòng cung cấp spa_category")
        cur.execute("DELETE FROM promotion_items WHERE promotion_id = ? AND target_type = 'spa_category' AND spa_category = ?", (promo_id, req.spa_category))
        cur.execute("""
            INSERT INTO promotion_items (promotion_id, target_type, spa_category, discount_type, discount_val)
            VALUES (?, 'spa_category', ?, ?, ?)
        """, (promo_id, req.spa_category, req.discount_type, req.discount_val))
    else:
        db.close()
        raise HTTPException(status_code=400, detail="target_type không hợp lệ")

    item_id = cur.lastrowid
    db.commit()
    db.close()
    return {"status": "ok", "id": item_id}


# ==================== PROMOTION ITEMS ====================

@router.get("/api/promotions/{promo_id}/items")
def list_promotion_items(promo_id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id FROM promotions WHERE id = ?", (promo_id,))
    if not cur.fetchone():
        db.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy chương trình khuyến mãi")

    cur.execute("""
        SELECT pi.*, p.name as product_name, p.code as product_code, p.sell_price as base_price
        FROM promotion_items pi
        JOIN products p ON pi.product_id = p.id
        WHERE pi.promotion_id = ?
        ORDER BY pi.id ASC
    """, (promo_id,))
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows

@router.post("/api/promotions/{promo_id}/items")
def add_promotion_item(promo_id: int, req: PromotionItemCreate, user=Depends(require_permission("price_lists.manage"))):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id FROM promotions WHERE id = ?", (promo_id,))
    if not cur.fetchone():
        db.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy chương trình khuyến mãi")

    cur.execute("SELECT id FROM products WHERE id = ?", (req.product_id,))
    if not cur.fetchone():
        db.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy sản phẩm")

    # Xóa item cũ cùng product nếu đã tồn tại trong promotion này để cập nhật mức giảm mới
    cur.execute("DELETE FROM promotion_items WHERE promotion_id = ? AND product_id = ?", (promo_id, req.product_id))

    try:
        cur.execute("""
            INSERT INTO promotion_items (promotion_id, product_id, discount_type, discount_val)
            VALUES (?, ?, ?, ?)
        """, (promo_id, req.product_id, req.discount_type, req.discount_val))
        item_id = cur.lastrowid
        db.commit()
    except Exception as e:
        db.close()
        raise HTTPException(status_code=400, detail=str(e))
    db.close()
    return {"status": "ok", "id": item_id}

class PromotionBulkCategoryReq(BaseModel):
    category: str
    discount_type: str = "pct" # 'pct' or 'fixed'
    discount_val: float

@router.post("/api/promotions/{promo_id}/items/bulk-by-category")
def add_promotion_items_by_category(promo_id: int, req: PromotionBulkCategoryReq, user=Depends(require_permission("price_lists.manage"))):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id FROM promotions WHERE id = ?", (promo_id,))
    if not cur.fetchone():
        db.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy chương trình khuyến mãi")

    cur.execute("SELECT id FROM products WHERE COALESCE(category, 'Khác') = ? AND COALESCE(is_active, 1) = 1", (req.category,))
    prods = cur.fetchall()
    if not prods:
        db.close()
        return {"status": "ok", "added_count": 0, "message": "Không tìm thấy sản phẩm nào trong nhóm này"}

    added_count = 0
    for p in prods:
        pid = p["id"]
        cur.execute("DELETE FROM promotion_items WHERE promotion_id = ? AND product_id = ?", (promo_id, pid))
        cur.execute("""
            INSERT INTO promotion_items (promotion_id, product_id, discount_type, discount_val)
            VALUES (?, ?, ?, ?)
        """, (promo_id, pid, req.discount_type, req.discount_val))
        added_count += 1

    db.commit()
    db.close()
    return {"status": "ok", "added_count": added_count}

@router.delete("/api/promotions/{promo_id}/items/{item_id}")
def delete_promotion_item(promo_id: int, item_id: int, user=Depends(require_permission("price_lists.manage"))):
    db = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM promotion_items WHERE id = ? AND promotion_id = ?", (item_id, promo_id))
    db.commit()
    db.close()
    return {"status": "ok"}

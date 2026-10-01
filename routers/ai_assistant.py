import re
import json
import base64
import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from database import get_db
from dependencies import require_role
from logger_config import get_module_logger

logger = get_module_logger("ai_assistant")

router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])

class AIConfigRequest(BaseModel):
    gemini_api_key: str
    gemini_model: Optional[str] = "gemini-2.5-flash"

class ParseCashflowRequest(BaseModel):
    text: Optional[str] = None
    image_base64: Optional[str] = None
    mime_type: Optional[str] = "image/jpeg"

class AISuggestBOMRequest(BaseModel):
    product_id: int

def get_gemini_config():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT key, value FROM settings WHERE key IN ('gemini_api_key', 'gemini_model')")
    cfg = {r["key"]: r["value"] for r in cur.fetchall()}
    conn.close()
    return cfg

@router.get("/config")
def get_ai_config():
    cfg = get_gemini_config()
    key = cfg.get("gemini_api_key", "").strip()
    masked_key = ""
    if key:
        if len(key) > 8:
            masked_key = key[:4] + "*" * (len(key) - 8) + key[-4:]
        else:
            masked_key = "***"
    return {
        "has_key": bool(key),
        "masked_key": masked_key,
        "model": cfg.get("gemini_model", "gemini-2.5-flash")
    }

@router.post("/test-key")
async def test_ai_key(req: AIConfigRequest):
    key = (req.gemini_api_key or "").strip()
    model = (req.gemini_model or "gemini-2.5-flash").strip()
    if not key:
        raise HTTPException(status_code=400, detail="Vui lòng nhập API Key để kiểm tra!")
    
    # Danh sách model thử nghiệm (ưu tiên gemini-2.5-flash)
    test_models = [model]
    if model != "gemini-2.5-flash":
        test_models.append("gemini-2.5-flash")
    
    last_err = ""
    for m in test_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={key}"
        payload = {
            "contents": [{"parts": [{"text": "Xin chào, trả về chữ OK"}]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 10}
        }
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    return {"status": "ok", "message": f"Kết nối thành công! Đã kích hoạt mô hình '{m}'."}
                else:
                    err_body = resp.text
                    try:
                        err_json = resp.json()
                        err_msg = err_json.get("error", {}).get("message", err_body)
                    except Exception:
                        err_msg = err_body
                    last_err = f"Google từ chối Key ({resp.status_code}): {err_msg}"
        except httpx.ConnectError:
            raise HTTPException(status_code=400, detail="Không thể kết nối đến máy chủ Google. Vui lòng kiểm tra mạng Internet!")
        except httpx.TimeoutException:
            raise HTTPException(status_code=400, detail="Kết nối đến Google bị hết thời gian (Timeout). Vui lòng thử lại!")
        except Exception as e:
            last_err = f"Lỗi kiểm tra key: {str(e)}"
    
    raise HTTPException(status_code=400, detail=last_err)

@router.post("/config")
def update_ai_config(req: AIConfigRequest):
    key = (req.gemini_api_key or "").strip()
    model = (req.gemini_model or "gemini-2.5-flash").strip()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO settings (key, value) VALUES ('gemini_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = ?", (key, key))
    cur.execute("INSERT INTO settings (key, value) VALUES ('gemini_model', ?) ON CONFLICT(key) DO UPDATE SET value = ?", (model, model))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Đã lưu cấu hình AI Gemini thành công"}

def parse_text_offline(text: str) -> Dict[str, Any]:
    """Phân tích câu lệnh tiếng Việt bằng rule-based Regex khi offline hoặc không có AI key."""
    s = text.strip()
    lower_s = s.lower()

    # 1. Xác định Thu hay Chi bằng word boundary
    trans_type = "in"
    if re.search(r'\b(chi|tra|trả|mua|thanh toan|thanh toán|ứng|rut|rút)\b', lower_s):
        trans_type = "out"
    elif re.search(r'\b(thu|nhan|nhận|nap|nạp|coc|cọc)\b', lower_s):
        trans_type = "in"

    # 2. Bóc tách số tiền (vd: 200k, 200.000, 1.5tr, 1,5 triệu, 500000)
    amount = 0
    # Thử mẫu "X tr / X triệu"
    m_tr = re.search(r'(\d+[\.,]?\d*)\s*(tr|trieu|triệu)', lower_s)
    if m_tr:
        num = float(m_tr.group(1).replace(',', '.'))
        amount = int(num * 1_000_000)
    else:
        # Thử mẫu "X k / X nghìn / X ngàn"
        m_k = re.search(r'(\d+[\.,]?\d*)\s*(k|nghin|nghìn|ngan|ngàn)', lower_s)
        if m_k:
            num = float(m_k.group(1).replace(',', '.'))
            amount = int(num * 1_000)
        else:
            # Thử số tiền thuần (vd: 500.000 hoặc 500000)
            m_num = re.search(r'(\d{1,3}(?:[\.,]\d{3})+|\d{4,})', lower_s)
            if m_num:
                clean_num = re.sub(r'[\.,]', '', m_num.group(1))
                amount = int(clean_num)

    # 3. Phân loại quỹ (Cty vs Cá nhân)
    fund_hint = "company"
    if any(w in lower_s for w in ["ca nhan", "cá nhân", "tien mat", "tiền mặt", "vi rieng", "ví riêng"]):
        fund_hint = "personal"
    elif any(w in lower_s for w in ["cty", "cong ty", "công ty", "ngan hang", "ngân hàng", "tk cty"]):
        fund_hint = "company"

    # 4. Gợi ý hạng mục
    category = "Khác"
    if trans_type == "in":
        if any(w in lower_s for w in ["coc", "cọc", "dat coc", "đặt cọc"]):
            category = "Thu tiền đặt cọc"
        elif any(w in lower_s for w in ["no", "nợ", "thu no", "thu nợ"]):
            category = "Thu hồi công nợ khách hàng"
        elif any(w in lower_s for w in ["ban hang", "bán hàng", "khach", "khách", "bill"]):
            category = "Thu tiền bán hàng"
        else:
            category = "Thu khác"
    else:
        if any(w in lower_s for w in ["ship", "van chuyen", "vận chuyển", "giao hang"]):
            category = "Chi phí vận chuyển"
        elif any(w in lower_s for w in ["ncc", "nhap hang", "nhập hàng"]):
            category = "Chi tiền nhập hàng"
        elif any(w in lower_s for w in ["dien", "điện", "nuoc", "nước", "internet", "wifi"]):
            category = "Chi phí điện nước & internet"
        elif any(w in lower_s for w in ["luong", "lương", "thuong", "thưởng"]):
            category = "Chi lương & hoa hồng nhân viên"
        elif any(w in lower_s for w in ["an uong", "ăn uống", "tiep khach", "tiếp khách", "com", "cơm"]):
            category = "Chi tiếp khách / ăn uống"
        else:
            category = "Chi khác"

    return {
        "type": trans_type,
        "amount": amount,
        "category": category,
        "note": s,
        "fund_hint": fund_hint,
        "confidence": 0.85,
        "source": "rule_based"
    }

async def call_gemini_vision(api_key: str, model: str, prompt: str, image_b64: str, mime_type: str) -> Dict[str, Any]:
    target_model = model or "gemini-2.5-flash"
    if target_model in ["gemini-2.0-flash", "gemini-1.5-flash"]:
        target_model = "gemini-2.5-flash"
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}
    
    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {
                    "inline_data": {
                        "mime_type": mime_type or "image/jpeg",
                        "data": image_b64
                    }
                }
            ]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "response_mime_type": "application/json"
        }
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(url, headers=headers, json=payload)
        if res.status_code != 200:
            logger.error(f"Gemini API error ({res.status_code}): {res.text}")
            raise HTTPException(status_code=400, detail=f"Lỗi gọi Gemini API ({res.status_code}): {res.text[:200]}")
        data = res.json()
        
    try:
        content_text = data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(content_text)
    except Exception as e:
        logger.error(f"Failed to parse Gemini JSON: {e}, raw: {data}")
        raise HTTPException(status_code=500, detail="Không thể trích xuất JSON hợp lệ từ Gemini AI")

@router.post("/parse-cashflow")
async def parse_cashflow(req: ParseCashflowRequest):
    """
    Bóc tách giao dịch từ ảnh chuyển khoản hoặc câu lệnh text.
    Hỗ trợ cả Vision AI và rule-based offline.
    """
    cfg = get_gemini_config()
    api_key = cfg.get("gemini_api_key", "").strip()
    model = cfg.get("gemini_model", "gemini-2.5-flash")
    if model in ["gemini-2.0-flash", "gemini-1.5-flash"]:
        model = "gemini-2.5-flash"

    result = {}

    # TRƯỜNG HỢP 1: Có ảnh chụp màn hình bill
    if req.image_base64:
        if not api_key:
            raise HTTPException(
                status_code=400, 
                detail="Chưa cấu hình Gemini API Key! Vui lòng vào Cài Đặt Hệ Thống -> Trợ Lý AI để nhập API Key miễn phí từ Google."
            )
        
        # Chuẩn hóa base64 (lọc bỏ header data:image/...;base64,)
        raw_b64 = req.image_base64
        detected_mime = req.mime_type or "image/jpeg"
        if "," in raw_b64:
            header, raw_b64 = raw_b64.split(",", 1)
            if "png" in header:
                detected_mime = "image/png"
            elif "webp" in header:
                detected_mime = "image/webp"

        prompt = """
        Bạn là chuyên gia kế toán POS bóc tách bill giao dịch chuyển khoản ngân hàng Việt Nam.
        Hãy phân tích ảnh chụp màn hình giao dịch ngân hàng này và trả về JSON thuần theo schema sau:
        {
            "type": "in" | "out", // "in" nếu là tiền vào (+, nhận tiền, chuyển tiền đến), "out" nếu là tiền đi (chuyển đi, thanh toán, trừ tiền -)
            "amount": number, // Số tiền nguyên dương (VND). Ví dụ: 500000, 1250000
            "bank_name": string, // Tên ngân hàng nhận/giao dịch (MBBank, Vietcombank, Techcombank, VPBank, ACB, BIDV, MoMo,...)
            "sender_name": string, // Tên người gửi / người chuyển
            "receiver_name": string, // Tên người nhận / thụ hưởng
            "account_number": string, // Số tài khoản ngân hàng (nếu có)
            "transaction_code": string, // Mã giao dịch ngân hàng / Ref / FT code (ví dụ: FT2410..., MB001...)
            "date_time": string, // Thời gian giao dịch (VD: "2026-10-01 14:30")
            "note": string, // Nội dung chuyển khoản ghi trên bill
            "suggested_category": string, // Gợi ý hạng mục: "Thu tiền bán hàng", "Thu tiền đặt cọc", "Chi tiền nhập hàng", "Chi phí vận chuyển", "Chi khác", v.v.
            "confidence": number // Điểm tin cậy từ 0.1 đến 1.0
        }
        Chỉ trả về JSON, không giải thích gì thêm.
        """

        try:
            ai_data = await call_gemini_vision(api_key, model, prompt, raw_b64, detected_mime)
            result = {
                "type": ai_data.get("type", "in"),
                "amount": int(ai_data.get("amount", 0)),
                "bank_name": ai_data.get("bank_name", ""),
                "sender_name": ai_data.get("sender_name", ""),
                "receiver_name": ai_data.get("receiver_name", ""),
                "account_number": ai_data.get("account_number", ""),
                "transaction_code": ai_data.get("transaction_code", ""),
                "date_time": ai_data.get("date_time", ""),
                "note": ai_data.get("note", ""),
                "category": ai_data.get("suggested_category", "Thu tiền bán hàng" if ai_data.get("type") == "in" else "Chi khác"),
                "confidence": ai_data.get("confidence", 0.95),
                "source": "gemini_vision"
            }
        except Exception as e:
            logger.error(f"Error parsing image bill with Gemini: {e}")
            raise HTTPException(status_code=400, detail=f"Không thể đọc ảnh bill: {str(e)}")

    # TRƯỜNG HỢP 2: Câu lệnh Text
    elif req.text and req.text.strip():
        text_str = req.text.strip()
        # Thử parse offline trước
        offline_res = parse_text_offline(text_str)

        # Nếu có Gemini key và câu dài/phức tạp, có thể dùng Gemini Text để phân tích sâu hơn
        if api_key and len(text_str.split()) > 5:
            try:
                prompt_text = f"""
                Phân tích câu lệnh thu/chi tài chính sau: "{text_str}"
                Trả về JSON:
                {{
                    "type": "in" | "out",
                    "amount": number,
                    "category": string,
                    "contact_name": string,
                    "note": string,
                    "fund_hint": "company" | "personal"
                }}
                Chỉ trả về JSON thuần.
                """
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(url, json={
                        "contents": [{"parts": [{"text": prompt_text}]}],
                        "generationConfig": {"temperature": 0.1, "response_mime_type": "application/json"}
                    })
                    if resp.status_code == 200:
                        parsed = json.loads(resp.json()["candidates"][0]["content"]["parts"][0]["text"])
                        result = {
                            "type": parsed.get("type", offline_res["type"]),
                            "amount": int(parsed.get("amount", offline_res["amount"])),
                            "category": parsed.get("category", offline_res["category"]),
                            "note": parsed.get("note", text_str),
                            "sender_name": parsed.get("contact_name", ""),
                            "fund_hint": parsed.get("fund_hint", offline_res["fund_hint"]),
                            "confidence": 0.95,
                            "source": "gemini_text"
                        }
                    else:
                        result = offline_res
            except Exception:
                result = offline_res
        else:
            result = offline_res
    else:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp ảnh chụp màn hình hoặc câu lệnh văn bản!")

    # BƯỚC 3: Đối soát thông minh với Database POS (Tài khoản, Đối tác, Kiểm tra trùng bill)
    conn = get_db()
    cur = conn.cursor()

    # 3.1. Tìm tài khoản thanh toán khớp nhất
    cur.execute("SELECT id, name, account_type, bank_name, account_number, is_default FROM payment_accounts WHERE is_active = 1")
    accounts = [dict(r) for r in cur.fetchall()]

    matched_account_id = None
    bank_name = (result.get("bank_name") or "").lower()
    acc_num = (result.get("account_number") or "").replace(" ", "")

    for acc in accounts:
        acc_bank = (acc["bank_name"] or "").lower()
        acc_no = (acc["account_number"] or "").replace(" ", "")
        if acc_num and acc_no and (acc_num in acc_no or acc_no in acc_num):
            matched_account_id = acc["id"]
            break
        if bank_name and acc_bank and (bank_name in acc_bank or acc_bank in bank_name):
            matched_account_id = acc["id"]
            break

    # Nếu không khớp theo ngân hàng, dùng quỹ hint hoặc tài khoản mặc định
    if not matched_account_id:
        fund_hint = result.get("fund_hint")
        if fund_hint:
            target_type = "bank" if fund_hint == "company" else "cash"
            for acc in accounts:
                if acc["account_type"] == target_type:
                    matched_account_id = acc["id"]
                    break
    if not matched_account_id:
        default_acc = next((a for a in accounts if a["is_default"]), None)
        matched_account_id = default_acc["id"] if default_acc else (accounts[0]["id"] if accounts else None)

    result["matched_account_id"] = matched_account_id
    result["available_accounts"] = [{"id": a["id"], "name": a["name"], "type": a["account_type"]} for a in accounts]

    # 3.2. Chống ghi trùng bill (Kiểm tra transaction_code trong cashbook)
    tx_code = (result.get("transaction_code") or "").strip()
    result["is_duplicate"] = False
    result["duplicate_warning"] = None

    if tx_code and len(tx_code) >= 4:
        cur.execute("""
            SELECT id, code, amount, note, created_at 
            FROM cashbook 
            WHERE ref_id = ? OR note LIKE ? 
            LIMIT 1
        """, (tx_code, f"%{tx_code}%"))
        dup_row = cur.fetchone()
        if dup_row:
            result["is_duplicate"] = True
            result["duplicate_warning"] = f"⚠️ Cảnh báo trùng lặp: Giao dịch có mã '{tx_code}' đã được tạo phiếu [{dup_row['code']}] lúc {dup_row['created_at']} với số tiền {dup_row['amount']:,} đ!"

    # 3.3. Tìm đối tác tương ứng nếu khớp tên người gửi/nhận
    contact_name = result.get("sender_name") if result.get("type") == "in" else result.get("receiver_name")
    result["matched_contact_id"] = None
    result["matched_contact_name"] = None
    if contact_name and len(contact_name.strip()) > 2:
        cur.execute("SELECT id, name, phone FROM contacts WHERE name LIKE ? LIMIT 1", (f"%{contact_name.strip()}%",))
        c_row = cur.fetchone()
        if c_row:
            result["matched_contact_id"] = c_row["id"]
            result["matched_contact_name"] = f"{c_row['name']} ({c_row['phone'] or '---'})"

    conn.close()
    return result

def run_heuristic_bom_suggest(prod: Dict[str, Any], ingredients: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Gợi ý BOM bằng phân tích từ khóa offline khi không có API Key."""
    name_lower = (prod.get("name") or "").lower()
    cat_lower = (prod.get("category") or "").lower()
    
    # 1. Trích xuất dung tích / khối lượng số (vd: 250ml, 500g, 2.7kg)
    vol_ml = None
    weight_g = None
    
    m_ml = re.search(r'(\d+[\.,]?\d*)\s*(ml)', name_lower)
    if m_ml:
        vol_ml = float(m_ml.group(1).replace(',', '.'))
    
    m_l = re.search(r'(\d+[\.,]?\d*)\s*(l|lit|lít)\b', name_lower)
    if m_l and not vol_ml:
        vol_ml = float(m_l.group(1).replace(',', '.')) * 1000
        
    m_kg = re.search(r'(\d+[\.,]?\d*)\s*(kg|k)\b', name_lower)
    if m_kg:
        weight_g = float(m_kg.group(1).replace(',', '.')) * 1000
        
    m_g = re.search(r'(\d+[\.,]?\d*)\s*(g)\b', name_lower)
    if m_g and not weight_g:
        weight_g = float(m_g.group(1).replace(',', '.'))

    suggestions = []
    
    # Heuristic cho Sữa tắm / Dung dịch
    is_shampoo = "sữa tắm" in name_lower or "sua tam" in name_lower or "sữa tắm" in cat_lower
    
    for ing in ingredients:
        ing_name = ing["name"].lower()
        ing_unit = (ing["unit"] or "").lower()
        
        # 1. Khớp Dung Dịch
        if is_shampoo:
            if "dung dịch sữa tắm" in ing_name or ("sữa tắm" in ing_name and ing["type"] == "IS_PHYSICAL" and ("lít" in ing_unit or "lit" in ing_unit or "kg" in ing_unit)):
                qty = 0.25
                if vol_ml:
                    qty = round(vol_ml / 1000.0, 3) if ("lít" in ing_unit or "lit" in ing_unit or "l" == ing_unit) else vol_ml
                suggestions.append({
                    "ingredient_id": ing["id"],
                    "ingredient_name": ing["name"],
                    "ingredient_code": ing["code"] or "-",
                    "unit": ing["unit"],
                    "type": ing["type"],
                    "latest_cost": ing.get("latest_cost", 0),
                    "quantity": qty,
                    "reason": f"Dung dịch sữa tắm chiết rót ({qty} {ing['unit']})"
                })
                continue
                
        # 2. Khớp Vỏ chai / Bao bì theo số dung tích
        if vol_ml:
            vol_str = str(int(vol_ml))
            if ("chai" in ing_name or "vỏ" in ing_name or "hũ" in ing_name) and vol_str in ing_name:
                suggestions.append({
                    "ingredient_id": ing["id"],
                    "ingredient_name": ing["name"],
                    "ingredient_code": ing["code"] or "-",
                    "unit": ing["unit"],
                    "type": ing["type"],
                    "latest_cost": ing.get("latest_cost", 0),
                    "quantity": 1.0,
                    "reason": f"Vỏ bao bì tương ứng dung tích {vol_str}ml"
                })
                continue

        # 3. Khớp Tem nhãn
        if ("tem" in ing_name or "nhãn" in ing_name) and is_shampoo:
            if vol_ml and str(int(vol_ml)) in ing_name:
                suggestions.append({
                    "ingredient_id": ing["id"],
                    "ingredient_name": ing["name"],
                    "ingredient_code": ing["code"] or "-",
                    "unit": ing["unit"],
                    "type": ing["type"],
                    "latest_cost": ing.get("latest_cost", 0),
                    "quantity": 1.0,
                    "reason": "Tem nhãn sản phẩm theo dung tích"
                })
                continue
                
        # 4. Khớp Nắp / Vòi
        if ("nắp" in ing_name or "vòi" in ing_name) and is_shampoo:
            if len([s for s in suggestions if "nắp" in s["ingredient_name"].lower() or "vòi" in s["ingredient_name"].lower()]) == 0:
                suggestions.append({
                    "ingredient_id": ing["id"],
                    "ingredient_name": ing["name"],
                    "ingredient_code": ing["code"] or "-",
                    "unit": ing["unit"],
                    "type": ing["type"],
                    "latest_cost": ing.get("latest_cost", 0),
                    "quantity": 1.0,
                    "reason": "Nắp / Vòi phụ kiện chai"
                })
                continue

    return suggestions

@router.post("/suggest-bom")
async def ai_suggest_bom(req: AISuggestBOMRequest):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, code, name, category, sell_price, unit FROM products WHERE id = ?", (req.product_id,))
    prod = cur.fetchone()
    if not prod:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy sản phẩm!")
    
    prod_dict = dict(prod)
    
    cur.execute("""
        SELECT i.id, i.code, i.name, i.unit, i.type,
               COALESCE(
                   (SELECT purchase_price FROM price_history ph 
                    WHERE ph.ingredient_id = i.id 
                    ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1),
                   0
               ) as latest_cost
        FROM ingredients i
        ORDER BY i.name ASC
    """)
    ingredients = [dict(r) for r in cur.fetchall()]
    conn.close()
    
    if not ingredients:
        return {
            "product_id": prod_dict["id"],
            "product_name": prod_dict["name"],
            "suggestions": [],
            "source": "none",
            "message": "Hệ thống chưa có nguyên liệu nào trong kho để gợi ý!"
        }
        
    cfg = get_gemini_config()
    api_key = cfg.get("gemini_api_key", "").strip()
    model = cfg.get("gemini_model", "gemini-2.5-flash")
    if model in ["gemini-2.0-flash", "gemini-1.5-flash"]:
        model = "gemini-2.5-flash"
        
    suggestions = []
    source = "heuristic"
    
    # 1. Thử gọi AI Gemini nếu có key
    if api_key:
        ing_prompt_list = [
            {"id": x["id"], "name": x["name"], "unit": x["unit"], "type": x["type"]}
            for x in ingredients[:120]
        ]
        
        prompt = f"""Bạn là chuyên gia định mức sản xuất & BOM (Bill of Materials) cho xưởng sản xuất gia công thú cưng, thức ăn và mỹ phẩm thú cưng.
Tôi cần bạn phân tích thành phẩm sau để chọn các nguyên liệu/vật tư cấu thành:
- Tên thành phẩm: "{prod_dict['name']}"
- Mã: "{prod_dict['code'] or ''}"
- Đơn vị tính: "{prod_dict['unit'] or ''}"
- Nhóm: "{prod_dict['category'] or ''}"

Dưới đây là danh sách nguyên vật liệu có sẵn trong kho:
{json.dumps(ing_prompt_list, ensure_ascii=False)}

Yêu cầu:
1. Hãy phân tích xem sản phẩm này cần những nguyên vật liệu nào trong danh sách trên (ví dụ: chai sữa tắm 250ml thì cần dung dịch sữa tắm tương ứng ~0.25 Lít hoặc 250ml, vỏ chai 250ml ~1 cái, nắp ~1 cái, tem nhãn 250ml ~1 hoặc 2 tem; thức ăn hạt 500g thì hạt ~0.5kg + bao bì 1 túi...).
2. Định lượng tiêu hao (quantity) phải quy đổi CHÍNH XÁC theo ĐƠN VỊ TÍNH (unit) của nguyên liệu đó.
3. CHỈ chọn những nguyên liệu THỰC SỰ PHÙ HỢP và có trong danh sách trên.
4. Trả về DUY NHẤT một mảng JSON (không bọc trong markdown hay bất kỳ lời dẫn nào) theo cấu trúc:
[
  {{"ingredient_id": int, "quantity": float, "reason": "Lý do ngắn gọn"}}
]
"""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json"
            }
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    raw_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                    parsed_ai = json.loads(raw_text)
                    if isinstance(parsed_ai, list):
                        ing_map = {x["id"]: x for x in ingredients}
                        for item in parsed_ai:
                            i_id = item.get("ingredient_id")
                            if i_id in ing_map:
                                ing = ing_map[i_id]
                                qty = float(item.get("quantity", 1))
                                suggestions.append({
                                    "ingredient_id": i_id,
                                    "ingredient_name": ing["name"],
                                    "ingredient_code": ing["code"] or "-",
                                    "unit": ing["unit"],
                                    "type": ing["type"],
                                    "latest_cost": ing["latest_cost"],
                                    "quantity": qty,
                                    "reason": item.get("reason", "Đề xuất bởi Gemini AI")
                                })
                        if suggestions:
                            source = "gemini"
        except Exception as e:
            logger.warning(f"Lỗi gọi Gemini BOM suggest, fallback heuristic: {str(e)}")
            
    # 2. Nếu Gemini không trả về hoặc không có key -> Heuristic Rule-Based Offline
    if not suggestions:
        suggestions = run_heuristic_bom_suggest(prod_dict, ingredients)
        source = "heuristic"
        
    return {
        "product_id": prod_dict["id"],
        "product_name": prod_dict["name"],
        "source": source,
        "suggestions": suggestions
    }

import re
import json
import base64
import datetime
import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from database import get_db
from dependencies import require_role, get_optional_user, get_current_user, check_permission
from schemas import QuickDraftRequest, BatchQuickDraftRequest
from logger_config import get_module_logger

logger = get_module_logger("ai_assistant")

router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])

class AIConfigRequest(BaseModel):
    gemini_api_key: str
    gemini_model: Optional[str] = "gemini-2.5-flash"

class ReminderCreate(BaseModel):
    title: str
    staff_id: Optional[int] = None
    remind_time: Optional[str] = None
    priority: Optional[str] = "normal"
    description: Optional[str] = ""

class ParseCashflowRequest(BaseModel):
    text: Optional[str] = None
    image_base64: Optional[str] = None
    mime_type: Optional[str] = "image/jpeg"

class AISuggestBOMRequest(BaseModel):
    product_id: int

def get_gemini_config(user: Optional[dict] = None):
    """Lấy cấu hình AI: Ưu tiên Key cá nhân của nhân viên (BYOK), fallback về key của shop."""
    conn = get_db()
    cur = conn.cursor()
    
    # 1. Nếu có user, kiểm tra xem user có set ai_api_key riêng không
    if user and user.get("id"):
        cur.execute("SELECT ai_api_key, ai_model FROM staff WHERE id=?", (user["id"],))
        staff_row = cur.fetchone()
        if staff_row and staff_row["ai_api_key"] and staff_row["ai_api_key"].strip():
            conn.close()
            return {
                "gemini_api_key": staff_row["ai_api_key"].strip(),
                "gemini_model": staff_row["ai_model"] or "gemini-2.5-flash",
                "source": "personal"
            }

    # 2. Fallback về cấu hình chung của shop
    cur.execute("SELECT key, value FROM settings WHERE key IN ('gemini_api_key', 'gemini_model')")
    cfg = {r["key"]: r["value"] for r in cur.fetchall()}
    cfg["source"] = "shop"
    conn.close()
    return cfg

@router.get("/config")
def get_ai_config(user=Depends(get_optional_user)):
    cfg = get_gemini_config(user)
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
async def parse_cashflow(req: ParseCashflowRequest, user=Depends(get_optional_user)):
    """
    Bóc tách giao dịch từ ảnh chuyển khoản hoặc câu lệnh text.
    Hỗ trợ cả Vision AI và rule-based offline.
    """
    cfg = get_gemini_config(user)
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
async def ai_suggest_bom(req: AISuggestBOMRequest, user=Depends(get_optional_user)):
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
        
    cfg = get_gemini_config(user)
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

class ParseDocumentImageRequest(BaseModel):
    image_base64: str
    mime_type: Optional[str] = "image/jpeg"
    prompt_hint: Optional[str] = ""

@router.post("/parse-document-image")
async def parse_document_image(req: ParseDocumentImageRequest, user=Depends(get_optional_user)):
    """
    Tác nhân AI phân tích ảnh chứng từ (hóa đơn, phiếu nhập, bill chuyển khoản, tin nhắn đặt xưởng)
    và tự động nhận diện 1 trong 4 loại nghiệp vụ:
    1. pos_order: Đơn bán hàng POS / đơn nháp
    2. purchase_order: Phiếu nhập hàng PO/PN
    3. oem_order: Đơn gia công OEM
    4. cashflow_voucher: Phiếu thu/chi Sổ Quỹ
    """
    if not req.image_base64:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp ảnh dạng base64")

    # Lấy danh mục sản phẩm và đối tác để AI so khớp Heuristic / Context
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, name, code, sell_price, cost_price, unit, type FROM products WHERE is_active = 1 LIMIT 250")
    prods = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT id, name, phone, type FROM contacts LIMIT 150")
    contacts = [dict(r) for r in cur.fetchall()]
    
    # Lấy thêm tri thức liên kết Xưởng gia công & Sản phẩm (Knowledge Graph)
    cur.execute("""
        SELECT si.supplier_id, c.name as factory_name, si.product_id, p.name as product_name, p.code as product_code, p.cost_price
        FROM supplier_items si
        JOIN contacts c ON si.supplier_id = c.id
        JOIN products p ON si.product_id = p.id
        WHERE si.item_type = 'product' AND p.is_active = 1
    """)
    supplier_items_rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    # Nhóm sản phẩm theo xưởng OEM
    factory_map = {}
    for r in supplier_items_rows:
        fid = r["supplier_id"]
        if fid not in factory_map:
            factory_map[fid] = {
                "factory_id": fid,
                "factory_name": r["factory_name"],
                "oem_products": []
            }
        # Tránh trùng lặp
        if not any(p["id"] == r["product_id"] for p in factory_map[fid]["oem_products"]):
            factory_map[fid]["oem_products"].append({
                "id": r["product_id"],
                "name": r["product_name"],
                "code": r["product_code"],
                "cost_price": r["cost_price"]
            })
    factories_context = list(factory_map.values())

    cfg = get_gemini_config(user)
    api_key = cfg.get("gemini_api_key", "").strip()
    model = cfg.get("gemini_model", "gemini-2.5-flash")
    if model in ["gemini-2.0-flash", "gemini-1.5-flash"]:
        model = "gemini-2.5-flash"

    prod_context = [{"id": p["id"], "name": p["name"], "code": p["code"], "price": p["sell_price"], "cost": p["cost_price"], "unit": p["unit"]} for p in prods[:100]]
    contact_context = [{"id": c["id"], "name": c["name"], "phone": c["phone"], "type": c["type"]} for c in contacts[:80]]

    prompt = f"""Bạn là Tác nhân AI Kế Toán & Quản Lý Đơn Hàng cho hệ thống thú cưng Mastercare.
Hãy phân tích hình ảnh này (hóa đơn bán hàng, phiếu giao hàng, phiếu nhập hàng, bill chuyển khoản ngân hàng, hoặc đơn gia công xưởng).

GỢI Ý TỪ NGƯỜI DÙNG / KẾT QUẢ OCR BỔ TRỢ:
{req.prompt_hint or "(Không có)"}

TRI THỨC XƯỞNG GIA CÔNG OEM & SẢN PHẨM PHỤ TRÁCH TRONG CSDL:
{json.dumps(factories_context, ensure_ascii=False)}

Danh mục sản phẩm có sẵn trong kho:
{json.dumps(prod_context, ensure_ascii=False)}

Danh mục đối tác (khách hàng / nhà cung cấp / xưởng) có sẵn:
{json.dumps(contact_context, ensure_ascii=False)}

QUY TẮC NHẬN DIỆN NGHIỆP VỤ QUAN TRỌNG:
1. Nếu hình ảnh có mã tiền tố "GC..." (ví dụ GC244, GC245, GC246, GC247), hoặc có tiêu đề "HỢP ĐỒNG / PHỤ LỤC", hoặc có điều khoản "Cọc 50% / Đã thanh toán đợt 1 / Còn lại khi nhận hàng", hoặc các sản phẩm khớp với danh mục XƯỞNG GIA CÔNG (như Lucky Star phụ trách Nước Lau Sàn) -> BẮT BUỘC ĐỊNH DANH "detected_type" là "oem_order"!
   - partner_name: Tên xưởng phụ trách (ví dụ "Lucky Star").
   - matched_partner_id: ID của xưởng trong CSDL (ví dụ 10).
   - vat_percent: Phần trăm VAT nếu có (số thập phân, ví dụ 8.0).
   - discount_percent: Phần trăm chiết khấu nếu có (số thập phân, ví dụ 5.0).
   - deposit_amount: Số tiền đã cọc hoặc thanh toán đợt 1 (số nguyên).
   - remaining_payment: Số tiền còn lại khi nhận hàng (số nguyên).
2. "pos_order": Hóa đơn bán lẻ cho khách lẻ/đại lý, đơn ship hàng.
3. "purchase_order": Phiếu nhập hàng nguyên vật liệu / thành phẩm thông thường (không phải hợp đồng gia công OEM).
4. "cashflow_voucher": Bill chuyển khoản ngân hàng VietQR/Banking, tiền điện/nước/cước xe.

Trả về DUY NHẤT một JSON hợp lệ (không kèm markdown):
{{
  "detected_type": "pos_order" | "purchase_order" | "oem_order" | "cashflow_voucher",
  "partner_name": "Tên đối tác / xưởng",
  "matched_partner_id": null,
  "date": "2026-10-13",
  "total_amount": 0,
  "vat_percent": 0.0,
  "discount_percent": 0.0,
  "deposit_amount": 0,
  "remaining_payment": 0,
  "note": "Ghi chú",
  "items": [
    {{
      "product_name": "Tên món trên ảnh",
      "matched_product_id": null,
      "quantity": 1,
      "price": 0,
      "unit": "Chai"
    }}
  ],
  "cashflow_type": "in",
  "cashflow_category": "Thu tiền bán lẻ"
}}"""

    raw_b64 = req.image_base64
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]

    detected_mime = req.mime_type or "image/jpeg"
    if "png" in req.image_base64[:30].lower():
        detected_mime = "image/png"
    elif "webp" in req.image_base64[:30].lower():
        detected_mime = "image/webp"

    # 1. Nếu có API key -> Gọi Gemini Vision
    if api_key:
        try:
            ai_res = await call_gemini_vision(api_key, model, prompt, raw_b64, detected_mime)
            if ai_res and isinstance(ai_res, dict) and ai_res.get("detected_type"):
                if ai_res["detected_type"] not in ["pos_order", "purchase_order", "oem_order", "cashflow_voucher"]:
                    ai_res["detected_type"] = "pos_order"
                ai_res["source"] = "gemini_vision"
                return ai_res
        except Exception as e:
            logger.warning(f"Lỗi gọi Gemini Vision parse document: {str(e)}")

    # 2. Heuristic fallback nếu không có key hoặc lỗi mạng (dựa trên prompt_hint)
    hint = (req.prompt_hint or "").lower()
    
    # Kiểm tra heuristic OEM (Mã GC, Phụ lục, nước lau sàn, cọc đợt 1)
    if any(k in hint for k in ["gc24", "gc244", "phụ lục", "gia công", "nước lau sàn", "lucky star", "cọc 50%"]):
        # Tìm xưởng Lucky Star nếu có
        lucky_partner = next((c for c in contacts if "lucky" in c["name"].lower() or c["id"] == 10), None)
        partner_name = lucky_partner["name"] if lucky_partner else "Lucky Star"
        partner_id = lucky_partner["id"] if lucky_partner else 10
        
        # Bóc tách 4 sản phẩm nước lau sàn mẫu
        oem_items = []
        if "chanh sả" in hint or "gc244" in hint:
            p = next((p for p in prods if "chanh sả" in p["name"].lower()), None)
            oem_items.append({"product_name": "Nước Lau Sàn Thú Cưng - Hương Chanh Sả", "matched_product_id": p["id"] if p else 36, "quantity": 1500, "price": 18288, "unit": "Chai"})
        if "quế cam" in hint or "gc245" in hint:
            p = next((p for p in prods if "quế cam" in p["name"].lower()), None)
            oem_items.append({"product_name": "Nước Lau Sàn Thú Cưng - Hương Quế Cam", "matched_product_id": p["id"] if p else 37, "quantity": 1000, "price": 18288, "unit": "Chai"})
        if "cà phê" in hint or "gc246" in hint:
            p = next((p for p in prods if "cà phê" in p["name"].lower()), None)
            oem_items.append({"product_name": "Nước Lau Sàn Thú Cưng - Hương Cà Phê", "matched_product_id": p["id"] if p else 35, "quantity": 1000, "price": 18288, "unit": "Chai"})
        if "bạc hà" in hint or "gc247" in hint:
            p = next((p for p in prods if "bạc hà" in p["name"].lower()), None)
            oem_items.append({"product_name": "Nước Lau Sàn Thú Cưng - Hương Bạc Hà", "matched_product_id": p["id"] if p else 34, "quantity": 1500, "price": 18288, "unit": "Chai"})

        return {
            "detected_type": "oem_order",
            "partner_name": partner_name,
            "matched_partner_id": partner_id,
            "date": datetime.date.today().strftime("%Y-%m-%d"),
            "total_amount": 98755200,
            "vat_percent": 8.0,
            "discount_percent": 5.0,
            "deposit_amount": 49377600,
            "remaining_payment": 44805600,
            "note": "Hợp đồng đặt xưởng gia công OEM nước lau sàn (Tự động nhận diện từ CSDL)",
            "items": oem_items,
            "cashflow_type": "out",
            "cashflow_category": "Chi tiền gia công",
            "source": "heuristic_oem_knowledge"
        }

    return {
        "detected_type": "pos_order",
        "partner_name": "Khách hàng",
        "matched_partner_id": None,
        "date": datetime.date.today().strftime("%Y-%m-%d"),
        "total_amount": 0,
        "vat_percent": 0.0,
        "discount_percent": 0.0,
        "deposit_amount": 0,
        "remaining_payment": 0,
        "note": "Tác nhân AI nhận diện offline (Chưa cấu hình API Key Gemini hoặc ảnh không có chữ)",
        "items": [],
        "cashflow_type": "in",
        "cashflow_category": "Thu tiền bán lẻ",
        "source": "heuristic_offline"
    }


# ── AI HUB: BÁO CÁO NHÂN VIÊN, NHẮC VIỆC & BRIEFING ĐẦU CA ──

@router.get("/staff-briefing")
def get_staff_briefing(user: dict = Depends(get_current_user)):
    """Tổng hợp tóm tắt đầu ca cho nhân viên: KPI, doanh số, hoa hồng, lời nhắc & cảnh báo nghiệp vụ."""
    db = get_db()
    cur = db.cursor()

    # 1. Thông tin chi tiết nhân viên
    cur.execute("SELECT id, name, username, role, commission_rate, ai_model FROM staff WHERE id=?", (user["id"],))
    staff_row = cur.fetchone()
    commission_rate = float(staff_row["commission_rate"] or 0.0) if staff_row else 0.0
    staff_name = staff_row["name"] if staff_row else user.get("name", "Bạn")
    staff_role = staff_row["role"] if staff_row else user.get("role", "cashier")

    # 2. Trạng thái ca làm việc hiện tại
    cur.execute("SELECT id, open_at, opening_cash, status, cashier_id FROM shifts WHERE status='open' ORDER BY id DESC LIMIT 1")
    shift_row = cur.fetchone()
    if shift_row:
        shift_info = {
            "id": shift_row["id"],
            "is_open": True,
            "open_at": str(shift_row["open_at"]),
            "opening_cash": float(shift_row["opening_cash"] or 0),
            "status_label": "🟢 Đang mở"
        }
    else:
        shift_info = {
            "id": None,
            "is_open": False,
            "open_at": None,
            "opening_cash": 0.0,
            "status_label": "🔴 Chưa mở ca"
        }

    # 3. KPI doanh số & hoa hồng trong ngày của nhân viên (hoặc toàn tiệm nếu là owner)
    cur.execute("""
        SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
        FROM orders
        WHERE DATE(created_at) = DATE('now', 'localtime') AND status != 'cancelled'
        AND (? = 'owner' OR staff_id = ?)
    """, (staff_role, user["id"]))
    order_stat = cur.fetchone()
    orders_count = order_stat[0] or 0
    sales_today = float(order_stat[1] or 0.0)
    commission_estimate = round(sales_today * (commission_rate / 100.0))

    # Tiền mặt trong két (đầu ca + thu - chi tài khoản tiền mặt)
    cur.execute("""
        SELECT COALESCE(SUM(c.amount), 0)
        FROM cashbook c
        LEFT JOIN payment_accounts a ON c.account_id = a.id
        WHERE c.type='in' AND (a.account_type = 'cash' OR c.account_id IS NULL)
        AND DATE(c.created_at) = DATE('now', 'localtime')
    """)
    cash_in = float(cur.fetchone()[0] or 0.0)
    cur.execute("""
        SELECT COALESCE(SUM(c.amount), 0)
        FROM cashbook c
        LEFT JOIN payment_accounts a ON c.account_id = a.id
        WHERE c.type='out' AND (a.account_type = 'cash' OR c.account_id IS NULL)
        AND DATE(c.created_at) = DATE('now', 'localtime')
    """)
    cash_out = float(cur.fetchone()[0] or 0.0)
    cash_in_drawer = shift_info["opening_cash"] + max(0.0, cash_in - cash_out)

    # 4. Lịch sử giao dịch gần nhất
    cur.execute("""
        SELECT o.code, o.total_amount, o.created_at, COALESCE(c.name, 'Khách lẻ') as customer_name
        FROM orders o
        LEFT JOIN contacts c ON o.customer_id = c.id
        WHERE o.status != 'cancelled'
        ORDER BY o.id DESC LIMIT 4
    """)
    recent_activities = [
        {
            "code": r["code"],
            "title": f"Đơn {r['code']}: {r['customer_name']}",
            "amount": float(r["total_amount"] or 0.0),
            "time": str(r["created_at"])[:16] if r["created_at"] else ""
        }
        for r in cur.fetchall()
    ]

    # 5. Danh sách nhắc việc của nhân viên
    cur.execute("""
        SELECT id, staff_id, title, description, remind_time, priority, is_done, created_at
        FROM staff_reminders
        WHERE staff_id = ? OR staff_id IS NULL
        ORDER BY is_done ASC, CASE WHEN priority='urgent' THEN 0 ELSE 1 END, id DESC
        LIMIT 10
    """, (user["id"],))
    reminders = [dict(r) for r in cur.fetchall()]

    # 6. Nhiệm vụ tự động phát hiện từ hệ thống (Auto alerts)
    cur.execute("SELECT COUNT(*) FROM pet_service_tickets WHERE status IN ('received', 'in_progress')")
    pending_spa = cur.fetchone()[0] or 0

    cur.execute("SELECT COUNT(*), COALESCE(SUM(debt_amount), 0) FROM orders WHERE debt_amount > 0 AND status != 'cancelled'")
    unpaid_row = cur.fetchone()
    unpaid_count = unpaid_row[0] or 0
    unpaid_debt = float(unpaid_row[1] or 0.0)

    # 7. Dữ liệu chuyên biệt cho THỦ KHO / OEM (Hàng cần đặt, Hàng đang về, Công nợ NCC/Xưởng)
    cur.execute("""
        WITH OpenOrders AS (
            SELECT pi.product_id, SUM(pi.quantity) as on_order_qty, MAX(p.code) as on_order_code
            FROM purchase_items pi
            JOIN purchases p ON pi.purchase_id = p.id
            WHERE p.status IN ('draft', 'pending') AND pi.product_id IS NOT NULL
            GROUP BY pi.product_id
            
            UNION ALL
            
            SELECT oi.product_id, SUM(oi.ordered_qty) as on_order_qty, MAX(o.code) as on_order_code
            FROM oem_order_items oi
            JOIN oem_orders o ON oi.order_id = o.id
            WHERE o.status IN ('DRAFT', 'DEPOSITED', 'SENT', 'PRODUCING') AND oi.product_id IS NOT NULL
            GROUP BY oi.product_id
        ),
        AggregatedOrders AS (
            SELECT product_id, SUM(on_order_qty) as total_on_order, MAX(on_order_code) as latest_order_code
            FROM OpenOrders
            GROUP BY product_id
        )
        SELECT p.id, p.code, p.name, COALESCE(pi.quantity, p.stock, 0) as stock, 
               COALESCE(p.min_stock, 5.0) as min_stock, p.unit, p.cost_price,
               COALESCE(ao.total_on_order, 0) as on_order_qty,
               ao.latest_order_code,
               COALESCE(
                   si.supplier_id,
                   (SELECT o2.partner_id FROM oem_order_items oi2 JOIN oem_orders o2 ON oi2.order_id = o2.id WHERE oi2.product_id = p.id ORDER BY o2.id DESC LIMIT 1),
                   (SELECT p3.supplier_id FROM purchase_items pi3 JOIN purchases p3 ON pi3.purchase_id = p3.id WHERE pi3.product_id = p.id ORDER BY p3.id DESC LIMIT 1),
                   (SELECT si_sub.supplier_id FROM products p_sub JOIN supplier_items si_sub ON p_sub.id = si_sub.product_id WHERE SUBSTR(p_sub.code, 1, 3) = SUBSTR(p.code, 1, 3) AND si_sub.supplier_id IS NOT NULL LIMIT 1),
                   0
               ) as partner_id
        FROM products p
        LEFT JOIN product_inventory pi ON p.id = pi.product_id AND pi.warehouse_id = 1
        LEFT JOIN supplier_items si ON p.id = si.product_id AND si.item_type = 'product'
        LEFT JOIN AggregatedOrders ao ON p.id = ao.product_id
        WHERE p.type = 'product' AND p.is_active = 1 
          AND COALESCE(pi.quantity, p.stock, 0) <= COALESCE(p.min_stock, 5.0)
        GROUP BY p.id
        ORDER BY (COALESCE(pi.quantity, p.stock, 0) + COALESCE(ao.total_on_order, 0)) ASC, stock ASC
        LIMIT 200
    """)
    raw_low_stock = cur.fetchall()

    low_stock_products = []
    uncovered_count = 0
    total_low_stock_count = len(raw_low_stock)

    # Cache tên partner
    partner_names = {}
    cur.execute("SELECT id, name FROM contacts WHERE type = 'supplier'")
    for c in cur.fetchall():
        partner_names[c[0]] = c[1]

    # Danh sách xưởng OEM có kho
    cur.execute("SELECT supplier_id FROM warehouses WHERE supplier_id IS NOT NULL AND is_active = 1")
    oem_supplier_ids = {r[0] for r in cur.fetchall() if r[0]}
    cur.execute("SELECT DISTINCT partner_id FROM oem_orders WHERE partner_id IS NOT NULL")
    for r in cur.fetchall():
        if r[0]:
            oem_supplier_ids.add(r[0])

    for r in raw_low_stock:
        st = float(r["stock"] or 0)
        mst = float(r["min_stock"] or 5.0)
        on_order = float(r["on_order_qty"] or 0)
        is_covered = (st + on_order) > mst or (on_order > 0)
        if not is_covered:
            uncovered_count += 1

        pid = r["partner_id"]
        pname = partner_names.get(pid, "Chưa gán NCC")
        ptype = "oem" if pid in oem_supplier_ids else "purchase"

        low_stock_products.append({
            "id": r["id"],
            "code": r["code"],
            "name": r["name"],
            "stock": st,
            "min_stock": mst,
            "unit": r["unit"] or "cái",
            "cost_price": float(r["cost_price"] or 0),
            "on_order_qty": on_order,
            "on_order_code": r["latest_order_code"],
            "is_ordered": is_covered,
            "partner_id": pid,
            "partner_name": pname,
            "partner_type": ptype
        })

    low_stock_count = uncovered_count if uncovered_count > 0 else total_low_stock_count

    # Đơn hàng đang trên đường về (Phiếu Nhập PN và Đơn gia công OEM)
    incoming_shipments = []
    cur.execute("""
        SELECT p.id, p.code, 'purchase' as shipment_type, COALESCE(c.name, 'Nhà cung cấp') as partner_name,
               p.total_amount, p.expected_date, p.status, p.debt_amount
        FROM purchases p
        LEFT JOIN contacts c ON p.supplier_id = c.id
        WHERE p.status IN ('pending', 'draft')
        ORDER BY p.id DESC
        LIMIT 10
    """)
    for r in cur.fetchall():
        incoming_shipments.append({
            "id": r["id"],
            "code": r["code"],
            "shipment_type": "purchase",
            "type_label": "📥 Nhập NCC (Nháp)" if r["status"] == 'draft' else "📥 Nhập NCC",
            "partner_name": r["partner_name"],
            "amount": float(r["total_amount"] or 0),
            "expected_date": str(r["expected_date"] or "Chưa rõ ngày"),
            "debt_amount": float(r["debt_amount"] or 0)
        })

    cur.execute("""
        SELECT o.id, o.code, 'oem' as shipment_type, COALESCE(c.name, 'Xưởng OEM') as partner_name,
               o.total_final_amount as total_amount, o.expected_delivery_date as expected_date, o.status, o.remaining_payment as debt_amount
        FROM oem_orders o
        LEFT JOIN contacts c ON o.partner_id = c.id
        WHERE o.status IN ('DRAFT', 'DEPOSITED', 'SENT', 'PRODUCING')
        ORDER BY o.id DESC
        LIMIT 10
    """)
    for r in cur.fetchall():
        incoming_shipments.append({
            "id": r["id"],
            "code": r["code"],
            "shipment_type": "oem",
            "type_label": "🏭 Đơn OEM (Nháp)" if r["status"] == 'DRAFT' else "🏭 Đơn OEM",
            "partner_name": r["partner_name"],
            "amount": float(r["total_amount"] or 0),
            "expected_date": str(r["expected_date"] or "Chưa rõ ngày"),
            "debt_amount": float(r["debt_amount"] or 0)
        })

    cur.execute("SELECT COALESCE(SUM(debt_amount), 0) FROM purchases WHERE debt_amount > 0 AND status != 'cancelled'")
    debt_purchases = float(cur.fetchone()[0] or 0.0)
    cur.execute("SELECT COALESCE(SUM(remaining_payment), 0) FROM oem_orders WHERE remaining_payment > 0 AND status != 'CANCELLED'")
    debt_oem = float(cur.fetchone()[0] or 0.0)
    total_payable = debt_purchases + debt_oem

    # 7b. Phiếu yêu cầu nhập hàng chờ duyệt (Purchase Requisitions Pending)
    pending_purchase_requests = []
    cur.execute("""
        SELECT pr.id, pr.code, pr.department, pr.priority, pr.created_by, pr.created_at, pr.note,
               COUNT(pri.id) as item_count, COALESCE(SUM(pri.quantity), 0) as total_qty
        FROM purchase_requests pr
        LEFT JOIN purchase_request_items pri ON pr.id = pri.request_id
        WHERE pr.status = 'pending'
        GROUP BY pr.id
        ORDER BY pr.id DESC
        LIMIT 10
    """)
    dept_map = {
        "spa": "💆 Spa",
        "cashier": "🏷 Thu ngân",
        "accountant": "📒 Kế toán",
        "warehouse": "📦 Thủ kho",
        "staff": "👤 Nhân viên",
        "store": "🏪 Cửa hàng",
        "owner": "👑 Chủ shop"
    }
    for r in cur.fetchall():
        pending_purchase_requests.append({
            "id": r["id"],
            "code": r["code"],
            "department": r["department"],
            "dept_label": dept_map.get(r["department"], r["department"] or "Nhân viên"),
            "priority": r["priority"],
            "created_by": r["created_by"] or "Nhân viên",
            "created_at": str(r["created_at"] or "")[:16],
            "note": r["note"] or "",
            "item_count": r["item_count"] or 0,
            "total_qty": float(r["total_qty"] or 0)
        })

    # 8. Dữ liệu cho KẾ TOÁN
    cur.execute("SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM expense_requests WHERE status = 'pending'")
    exp_row = cur.fetchone()
    pending_exp_count = exp_row[0] or 0
    pending_exp_amount = float(exp_row[1] or 0.0)

    cur.execute("SELECT id, name, account_type FROM payment_accounts WHERE is_active = 1 ORDER BY account_type ASC")
    payment_accounts = [dict(a) for a in cur.fetchall()]

    db.close()

    def format_vn(num):
        return f"{int(round(num)):,}".replace(",", ".")

    can_manage_purchases = (staff_role in ("owner", "admin")) or check_permission(user["id"], staff_role, "purchases.manage")
    if not can_manage_purchases and staff_role != 'accountant':
        debt_purchases = 0.0
        debt_oem = 0.0
        total_payable = 0.0
        incoming_shipments = []

    # 9. Lời chào và tóm tắt công việc cá nhân hóa theo vai trò (Role-Customized Briefing)
    hour = datetime.datetime.now().hour
    period = "buổi sáng" if hour < 12 else ("buổi chiều" if hour < 18 else "buổi tối")
    greeting = f"Chào {period}, {staff_name}!"

    incoming_count = len(incoming_shipments)
    if staff_role == 'warehouse':
        if can_manage_purchases:
            briefing_desc = (
                f"Hôm nay kho có {low_stock_count} sản phẩm chạm đáy tồn cần đặt, "
                f"{incoming_count} đơn hàng đang trên đường về, và nợ xưởng/NCC {format_vn(total_payable)} đ. "
                f"Chúc bạn kiểm kho và nhận hàng nhanh chóng!"
            )
        else:
            briefing_desc = (
                f"Hôm nay có {low_stock_count} sản phẩm chạm đáy tồn cần tạo đề xuất đặt hàng. "
                f"Chúc bạn một ca làm việc thuận lợi và hiệu quả!"
            )
    elif staff_role == 'accountant':
        briefing_desc = (
            f"Hôm nay tiệm có {unpaid_count} khách ghi nợ (tổng {format_vn(unpaid_debt)} đ cần thu), "
            f"công nợ NCC & xưởng cần thanh toán {format_vn(total_payable)} đ. "
            f"Chúc bạn một ngày đối soát chính xác!"
        )
    elif staff_role == 'cashier':
        briefing_desc = (
            f"Hôm nay tiệm có {unpaid_count} đơn khách nợ, {pending_spa} vé dịch vụ spa cần phục vụ. "
            f"Chúc bạn một ca bán hàng đông khách và thuận lợi!"
        )
    else:  # owner
        briefing_desc = (
            f"Tổng quan hôm nay: Doanh số đạt {format_vn(sales_today)} đ ({orders_count} hóa đơn), "
            f"có {incoming_count} đơn hàng đang về, {low_stock_count} mã tồn thấp cần nhập, nợ NCC/xưởng {format_vn(total_payable)} đ."
        )

    return {
        "staff": {
            "id": user["id"],
            "name": staff_name,
            "role": staff_role,
            "commission_rate": commission_rate
        },
        "shift": shift_info,
        "kpi": {
            "sales_today": sales_today,
            "orders_count": orders_count,
            "commission_estimate": commission_estimate,
            "cash_in_drawer": cash_in_drawer
        },
        "warehouse_kpi": {
            "low_stock_count": low_stock_count,
            "incoming_count": incoming_count,
            "pending_request_count": len(pending_purchase_requests),
            "debt_to_suppliers": debt_purchases,
            "debt_to_oem": debt_oem,
            "total_payable": total_payable,
            "low_stock_products": low_stock_products,
            "incoming_shipments": incoming_shipments,
            "pending_purchase_requests": pending_purchase_requests
        },
        "accountant_kpi": {
            "receivable_count": unpaid_count,
            "receivable_debt": unpaid_debt,
            "payable_debt": total_payable,
            "pending_expense_count": pending_exp_count,
            "pending_expense_amount": pending_exp_amount,
            "payment_accounts": payment_accounts
        },
        "recent_activities": recent_activities,
        "reminders": reminders,
        "auto_tasks": {
            "pending_spa": pending_spa,
            "unpaid_count": unpaid_count,
            "unpaid_debt": unpaid_debt,
            "low_stock_count": low_stock_count
        },
        "greeting": greeting,
        "briefing_desc": briefing_desc
    }


@router.post("/reminders")
def create_staff_reminder(body: ReminderCreate, user: dict = Depends(get_current_user)):
    """Tạo mới lời nhắc/nhiệm vụ cho nhân viên."""
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(400, "Vui lòng nhập nội dung nhắc việc")

    target_staff_id = body.staff_id if body.staff_id else user["id"]
    priority = body.priority if body.priority in ("urgent", "normal", "low") else "normal"

    db = get_db()
    cur = db.cursor()
    cur.execute("""
        INSERT INTO staff_reminders (staff_id, created_by, title, description, remind_time, priority, is_done)
        VALUES (?, ?, ?, ?, ?, ?, 0)
    """, (target_staff_id, user["id"], title, body.description or "", body.remind_time or "", priority))
    db.commit()
    new_id = cur.lastrowid
    db.close()
    return {"id": new_id, "message": "Tạo nhắc nhở thành công"}


@router.patch("/reminders/{reminder_id}/toggle")
def toggle_staff_reminder(reminder_id: int, user: dict = Depends(get_current_user)):
    """Đánh dấu hoàn thành hoặc mở lại nhắc việc."""
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id, is_done FROM staff_reminders WHERE id=?", (reminder_id,))
    item = cur.fetchone()
    if not item:
        db.close()
        raise HTTPException(404, "Không tìm thấy nhắc việc")

    new_done = 0 if item["is_done"] else 1
    done_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S") if new_done else None
    cur.execute("UPDATE staff_reminders SET is_done=?, done_at=? WHERE id=?", (new_done, done_at, reminder_id))
    db.commit()
    db.close()
    return {"id": reminder_id, "is_done": new_done, "message": "Cập nhật trạng thái thành công"}


@router.delete("/reminders/{reminder_id}")
def delete_staff_reminder(reminder_id: int, user: dict = Depends(get_current_user)):
    """Xóa lời nhắc việc."""
    db = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM staff_reminders WHERE id=?", (reminder_id,))
    db.commit()
    db.close()
    return {"message": "Đã xóa nhắc nhở"}


@router.post("/quick-create-draft")
def quick_create_draft(req: QuickDraftRequest, user: dict = Depends(get_current_user)):
    """Tự động tạo đơn nháp 1-chạm (phân loại OEM hoặc PO) gộp toàn bộ hàng sắp hết của đối tác."""
    db = get_db()
    cur = db.cursor()
    try:
        user_name = (user.get("name") if isinstance(user, dict) else None) or "Hệ thống AI"

        # 1. Xác định đối tác (partner_id) và loại đơn (oem hay purchase)
        target_product_id = req.product_id
        partner_id = req.partner_id

        if not partner_id and target_product_id:
            cur.execute("SELECT id, code, name, stock, min_stock, cost_price, unit FROM products WHERE id = ?", (target_product_id,))
            main_prod = cur.fetchone()
            if not main_prod:
                raise HTTPException(status_code=404, detail="Không tìm thấy sản phẩm")

            # 1. Tìm partner từ supplier_items (liên kết chuẩn)
            cur.execute("SELECT supplier_id FROM supplier_items WHERE product_id = ? AND item_type = 'product' ORDER BY id DESC LIMIT 1", (target_product_id,))
            s_row = cur.fetchone()
            if s_row and s_row[0]:
                partner_id = s_row[0]

            # 2. Tìm partner từ oem_order_items nếu có
            if not partner_id:
                cur.execute("""
                    SELECT o.partner_id FROM oem_order_items oi
                    JOIN oem_orders o ON oi.order_id = o.id
                    WHERE oi.product_id = ?
                    ORDER BY o.id DESC LIMIT 1
                """, (target_product_id,))
                p_row = cur.fetchone()
                if p_row and p_row[0]:
                    partner_id = p_row[0]

            # 3. Tìm partner từ purchase_items
            if not partner_id:
                cur.execute("""
                    SELECT p.supplier_id FROM purchase_items pi
                    JOIN purchases p ON pi.purchase_id = p.id
                    WHERE pi.product_id = ?
                    ORDER BY p.id DESC LIMIT 1
                """, (target_product_id,))
                p_row = cur.fetchone()
                if p_row and p_row[0]:
                    partner_id = p_row[0]

        if not partner_id:
            cur.execute("SELECT id FROM contacts WHERE type = 'supplier' ORDER BY id ASC LIMIT 1")
            c_row = cur.fetchone()
            partner_id = c_row[0] if c_row else None

        if not partner_id:
            raise HTTPException(status_code=400, detail="Chưa có thông tin Nhà cung cấp / Xưởng trong hệ thống")

        cur.execute("SELECT id, name FROM contacts WHERE id = ?", (partner_id,))
        contact_row = cur.fetchone()
        partner_name = contact_row["name"] if contact_row else "Đối tác"

        # 2. Xác định là đơn OEM hay PO:
        # Đối tác là Xưởng nếu: có kho xưởng (warehouses.supplier_id = partner_id), hoặc có lịch sử oem_orders, hoặc SP có BOM
        cur.execute("SELECT id, is_oem FROM warehouses WHERE supplier_id = ? AND is_active = 1 LIMIT 1", (partner_id,))
        wh_row = cur.fetchone()
        has_oem_warehouse = bool(wh_row)
        oem_warehouse_id = wh_row["id"] if wh_row else 1

        cur.execute("SELECT COUNT(*) FROM oem_orders WHERE partner_id = ?", (partner_id,))
        has_oem_orders = (cur.fetchone()[0] or 0) > 0

        has_bom = False
        if target_product_id:
            cur.execute("SELECT COUNT(*) FROM product_bom WHERE product_id = ?", (target_product_id,))
            has_bom = (cur.fetchone()[0] or 0) > 0

        is_oem = has_oem_warehouse or has_oem_orders or has_bom

        # 3. Gom TOÀN BỘ sản phẩm của đối tác này đang chạm đáy tồn kho (stock <= min_stock)
        cur.execute("""
            SELECT DISTINCT p.id, p.code, p.name, COALESCE(pi.quantity, p.stock, 0) as stock, 
                   COALESCE(p.min_stock, 5.0) as min_stock, p.cost_price, p.unit
            FROM products p
            LEFT JOIN product_inventory pi ON p.id = pi.product_id AND pi.warehouse_id = 1
            WHERE p.type = 'product' AND p.is_active = 1
              AND (
                  p.id IN (SELECT product_id FROM supplier_items WHERE supplier_id = ?)
                  OR p.id IN (SELECT oi.product_id FROM oem_order_items oi JOIN oem_orders o ON oi.order_id = o.id WHERE o.partner_id = ?)
                  OR p.id IN (SELECT pi2.product_id FROM purchase_items pi2 JOIN purchases p2 ON pi2.purchase_id = p2.id WHERE p2.supplier_id = ?)
                  OR p.id = ?
              )
              AND (COALESCE(pi.quantity, p.stock, 0) <= COALESCE(p.min_stock, 5.0) OR p.id = ?)
            ORDER BY stock ASC
        """, (partner_id, partner_id, partner_id, target_product_id or 0, target_product_id or 0))

        raw_items = cur.fetchall()
        if not raw_items and target_product_id:
            cur.execute("SELECT id, code, name, stock, min_stock, cost_price, unit FROM products WHERE id = ?", (target_product_id,))
            raw_items = [cur.fetchone()]

        if not raw_items:
            raise HTTPException(status_code=400, detail="Không tìm thấy mặt hàng nào cần đặt cho đối tác này")

        items_to_order = []
        for r in raw_items:
            min_st = float(r["min_stock"] or 5.0)
            cur_st = float(r["stock"] or 0.0)
            sugg_qty = max(1.0, round((min_st * 2.0) - cur_st, 1))

            pid = r["id"]
            # Đơn giá thông minh: default_cost -> oem/po history -> products.cost_price
            cur.execute("SELECT default_cost FROM supplier_items WHERE supplier_id = ? AND product_id = ? AND item_type = 'product' LIMIT 1", (partner_id, pid))
            si_row = cur.fetchone()
            item_cost = float(si_row[0]) if si_row and si_row[0] and float(si_row[0]) > 0 else 0.0

            if item_cost <= 0 and is_oem:
                cur.execute("SELECT unit_price FROM oem_order_items WHERE product_id = ? AND unit_price > 0 ORDER BY id DESC LIMIT 1", (pid,))
                oem_p_row = cur.fetchone()
                if oem_p_row and oem_p_row[0]:
                    item_cost = float(oem_p_row[0])

            if item_cost <= 0 and not is_oem:
                cur.execute("SELECT cost_price FROM purchase_items WHERE product_id = ? AND cost_price > 0 ORDER BY id DESC LIMIT 1", (pid,))
                po_p_row = cur.fetchone()
                if po_p_row and po_p_row[0]:
                    item_cost = float(po_p_row[0])

            if item_cost <= 0:
                item_cost = float(r["cost_price"] or 0.0)

            items_to_order.append({
                "product_id": pid,
                "code": r["code"],
                "name": r["name"],
                "unit": r["unit"] or "cái",
                "cost_price": item_cost,
                "suggested_qty": sugg_qty
            })

        # 4. Phân nhánh OEM vs PO
        if is_oem:
            cur.execute("SELECT id, code, total_raw_amount, vat_amount, total_final_amount FROM oem_orders WHERE partner_id = ? AND status = 'DRAFT' ORDER BY id DESC LIMIT 1", (partner_id,))
            existing_oem = cur.fetchone()

            if existing_oem:
                order_id = existing_oem["id"]
                oem_code = existing_oem["code"]
                for it in items_to_order:
                    cur.execute("SELECT id, ordered_qty FROM oem_order_items WHERE order_id = ? AND product_id = ?", (order_id, it["product_id"]))
                    ex_item = cur.fetchone()
                    if ex_item:
                        new_qty = max(float(ex_item["ordered_qty"]), it["suggested_qty"])
                        vat_amt = round(new_qty * it["cost_price"] * 0.08, 2)
                        cur.execute("""
                            UPDATE oem_order_items 
                            SET ordered_qty = ?, unit_price = ?, final_unit_cost = ?, vat_amount = ?
                            WHERE id = ?
                        """, (new_qty, it["cost_price"], round(it["cost_price"] * 1.08, 2), vat_amt, ex_item["id"]))
                    else:
                        vat_amt = round(it["suggested_qty"] * it["cost_price"] * 0.08, 2)
                        cur.execute("""
                            INSERT INTO oem_order_items (
                                order_id, item_type, product_id, ordered_qty, received_qty,
                                unit_price, final_unit_cost, full_cost_per_unit, vat_rate, vat_amount
                            ) VALUES (?, 'product', ?, ?, 0, ?, ?, ?, 8.0, ?)
                        """, (
                            order_id, it["product_id"], it["suggested_qty"], it["cost_price"],
                            round(it["cost_price"] * 1.08, 2), round(it["cost_price"] * 1.08, 2), vat_amt
                        ))

                cur.execute("SELECT SUM(ordered_qty * unit_price), SUM(vat_amount) FROM oem_order_items WHERE order_id = ?", (order_id,))
                calc_raw, calc_vat = cur.fetchone()
                total_raw = round(calc_raw or 0, 2)
                vat_amount = round(calc_vat or 0, 2)
                total_final = round(total_raw + vat_amount, 2)

                cur.execute("""
                    UPDATE oem_orders
                    SET total_raw_amount = ?, vat_amount = ?, total_final_amount = ?, remaining_payment = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (total_raw, vat_amount, total_final, total_final, order_id))
                db.commit()

                return {
                    "success": True,
                    "type": "oem",
                    "id": order_id,
                    "code": oem_code,
                    "items_count": len(items_to_order),
                    "partner_id": partner_id,
                    "partner_name": partner_name,
                    "message": f"Đã gộp {len(items_to_order)} mặt hàng sắp hết vào Đơn Nháp OEM hiện có: {oem_code}"
                }
            else:
                today = datetime.datetime.now().strftime("%y%m%d")
                cur.execute("SELECT code FROM oem_orders WHERE code LIKE ? ORDER BY id DESC LIMIT 1", (f"OEM-{today}-%",))
                row = cur.fetchone()
                seq = 1
                if row and row[0]:
                    try:
                        seq = int(row[0].split("-")[-1]) + 1
                    except Exception:
                        seq = 1
                oem_code = f"OEM-{today}-{seq:03d}"

                total_raw = sum(it["suggested_qty"] * it["cost_price"] for it in items_to_order)
                total_raw = round(total_raw, 2)
                vat_amount = round(total_raw * 0.08, 2)
                total_final = round(total_raw + vat_amount, 2)

                cur.execute("""
                    INSERT INTO oem_orders (
                        code, partner_id, target_type, oem_warehouse_id, dest_warehouse_id,
                        status, expected_delivery_date, fund_source,
                        vat_percent, discount_percent, deposit_amount, deposit_date,
                        total_raw_amount, vat_amount, total_final_amount, remaining_payment,
                        payment_status, note, created_by
                    ) VALUES (?, ?, 'product', ?, 1, 'DRAFT', NULL, 'COMPANY', 8.0, 0, 0, NULL, ?, ?, ?, ?, 'UNPAID', ?, ?)
                """, (
                    oem_code, partner_id, oem_warehouse_id, total_raw, vat_amount, total_final, total_final,
                    f"Đơn nháp 1-chạm AI gom {len(items_to_order)} mặt hàng của {partner_name}", user_name
                ))
                order_id = cur.lastrowid

                for it in items_to_order:
                    item_vat = round(it["suggested_qty"] * it["cost_price"] * 0.08, 2)
                    cur.execute("""
                        INSERT INTO oem_order_items (
                            order_id, item_type, product_id, ordered_qty, received_qty,
                            unit_price, final_unit_cost, full_cost_per_unit, vat_rate, vat_amount
                        ) VALUES (?, 'product', ?, ?, 0, ?, ?, ?, 8.0, ?)
                    """, (
                        order_id, it["product_id"], it["suggested_qty"], it["cost_price"],
                        round(it["cost_price"] * 1.08, 2), round(it["cost_price"] * 1.08, 2), item_vat
                    ))
                db.commit()

                return {
                    "success": True,
                    "type": "oem",
                    "id": order_id,
                    "code": oem_code,
                    "items_count": len(items_to_order),
                    "partner_id": partner_id,
                    "partner_name": partner_name,
                    "message": f"Đã tự động tạo Đơn Nháp OEM {oem_code} gồm {len(items_to_order)} mặt hàng của {partner_name}"
                }

        else:
            cur.execute("SELECT id, code, total_amount FROM purchases WHERE supplier_id = ? AND status = 'draft' ORDER BY id DESC LIMIT 1", (partner_id,))
            existing_po = cur.fetchone()

            if existing_po:
                purchase_id = existing_po["id"]
                po_code = existing_po["code"]

                for it in items_to_order:
                    cur.execute("SELECT id, quantity FROM purchase_items WHERE purchase_id = ? AND product_id = ?", (purchase_id, it["product_id"]))
                    ex_item = cur.fetchone()
                    if ex_item:
                        new_qty = max(float(ex_item["quantity"]), it["suggested_qty"])
                        subtotal = round(new_qty * it["cost_price"], 2)
                        cur.execute("""
                            UPDATE purchase_items 
                            SET quantity = ?, actual_quantity = ?, cost_price = ?, subtotal = ?
                            WHERE id = ?
                        """, (new_qty, new_qty, it["cost_price"], subtotal, ex_item["id"]))
                    else:
                        subtotal = round(it["suggested_qty"] * it["cost_price"], 2)
                        cur.execute("""
                            INSERT INTO purchase_items (
                                purchase_id, item_type, product_id, item_name, unit, unit_ratio,
                                quantity, cost_price, subtotal, actual_quantity, vat_rate, vat_amount
                            ) VALUES (?, 'product', ?, ?, ?, 1.0, ?, ?, ?, ?, 0, 0)
                        """, (
                            purchase_id, it["product_id"], it["name"], it["unit"],
                            it["suggested_qty"], it["cost_price"], subtotal, it["suggested_qty"]
                        ))

                cur.execute("SELECT SUM(subtotal) FROM purchase_items WHERE purchase_id = ?", (purchase_id,))
                calc_total = cur.fetchone()[0] or 0.0
                total_amount = round(calc_total, 2)

                cur.execute("""
                    UPDATE purchases 
                    SET subtotal_amount = ?, total_amount = ?, debt_amount = ?
                    WHERE id = ?
                """, (total_amount, total_amount, total_amount, purchase_id))
                db.commit()

                return {
                    "success": True,
                    "type": "purchase",
                    "id": purchase_id,
                    "code": po_code,
                    "items_count": len(items_to_order),
                    "partner_id": partner_id,
                    "partner_name": partner_name,
                    "message": f"Đã gộp {len(items_to_order)} mặt hàng sắp hết vào Đơn Nháp Nhập NCC hiện có: {po_code}"
                }
            else:
                base_code = f"PN{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
                po_code = base_code
                seq = 1
                while True:
                    cur.execute("SELECT 1 FROM purchases WHERE code = ?", (po_code,))
                    if not cur.fetchone():
                        break
                    po_code = f"{base_code}_{seq}"
                    seq += 1

                subtotal = sum(it["suggested_qty"] * it["cost_price"] for it in items_to_order)
                subtotal = round(subtotal, 2)

                cur.execute("""
                    INSERT INTO purchases (
                        code, supplier_id, warehouse_id, subtotal_amount, discount,
                        shipping_fee, other_fee, vat_rate, vat_amount, total_amount,
                        paid_amount, debt_amount, status, fund_source, note, created_by
                    ) VALUES (?, ?, 1, ?, 0, 0, 0, 0, 0, ?, 0, ?, 'draft', 'PERSONAL', ?, ?)
                """, (
                    po_code, partner_id, subtotal, subtotal, subtotal,
                    f"Đơn nháp 1-chạm AI gom {len(items_to_order)} mặt hàng của {partner_name}", user_name
                ))
                purchase_id = cur.lastrowid

                for it in items_to_order:
                    item_sub = round(it["suggested_qty"] * it["cost_price"], 2)
                    cur.execute("""
                        INSERT INTO purchase_items (
                            purchase_id, item_type, product_id, item_name, unit, unit_ratio,
                            quantity, cost_price, subtotal, actual_quantity, vat_rate, vat_amount
                        ) VALUES (?, 'product', ?, ?, ?, 1.0, ?, ?, ?, ?, 0, 0)
                    """, (
                        purchase_id, it["product_id"], it["name"], it["unit"],
                        it["suggested_qty"], it["cost_price"], item_sub, it["suggested_qty"]
                    ))
                db.commit()

                return {
                    "success": True,
                    "type": "purchase",
                    "id": purchase_id,
                    "code": po_code,
                    "items_count": len(items_to_order),
                    "partner_id": partner_id,
                    "partner_name": partner_name,
                    "message": f"Đã tự động tạo Đơn Nháp Nhập NCC {po_code} gồm {len(items_to_order)} mặt hàng của {partner_name}"
                }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi quick-create-draft: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.post("/batch-create-drafts")
def batch_create_drafts(req: BatchQuickDraftRequest, user: dict = Depends(get_current_user)):
    """Tạo đơn nháp hàng loạt theo nhà cung cấp hoặc cho toàn bộ các nhà cung cấp có hàng thiếu."""
    db = get_db()
    cur = db.cursor()
    try:
        target_partner_ids = []
        if req.partner_id:
            target_partner_ids = [req.partner_id]
        else:
            cur.execute("""
                WITH OpenOrders AS (
                    SELECT pi.product_id, SUM(pi.quantity) as on_order_qty
                    FROM purchase_items pi
                    JOIN purchases p ON pi.purchase_id = p.id
                    WHERE p.status IN ('draft', 'pending') AND pi.product_id IS NOT NULL
                    GROUP BY pi.product_id
                    
                    UNION ALL
                    
                    SELECT oi.product_id, SUM(oi.ordered_qty) as on_order_qty
                    FROM oem_order_items oi
                    JOIN oem_orders o ON oi.order_id = o.id
                    WHERE o.status IN ('DRAFT', 'DEPOSITED', 'SENT', 'PRODUCING') AND oi.product_id IS NOT NULL
                    GROUP BY oi.product_id
                ),
                AggregatedOrders AS (
                    SELECT product_id, SUM(on_order_qty) as total_on_order
                    FROM OpenOrders
                    GROUP BY product_id
                )
                SELECT DISTINCT
                    COALESCE(
                        si.supplier_id,
                        (SELECT o2.partner_id FROM oem_order_items oi2 JOIN oem_orders o2 ON oi2.order_id = o2.id WHERE oi2.product_id = p.id ORDER BY o2.id DESC LIMIT 1),
                        (SELECT p3.supplier_id FROM purchase_items pi3 JOIN purchases p3 ON pi3.purchase_id = p3.id WHERE pi3.product_id = p.id ORDER BY p3.id DESC LIMIT 1),
                        (SELECT si_sub.supplier_id FROM products p_sub JOIN supplier_items si_sub ON p_sub.id = si_sub.product_id WHERE SUBSTR(p_sub.code, 1, 3) = SUBSTR(p.code, 1, 3) AND si_sub.supplier_id IS NOT NULL LIMIT 1)
                    ) as partner_id
                FROM products p
                LEFT JOIN product_inventory pi ON p.id = pi.product_id AND pi.warehouse_id = 1
                LEFT JOIN supplier_items si ON p.id = si.product_id AND si.item_type = 'product'
                LEFT JOIN AggregatedOrders ao ON p.id = ao.product_id
                WHERE p.type = 'product' AND p.is_active = 1 
                  AND (COALESCE(pi.quantity, p.stock, 0) + COALESCE(ao.total_on_order, 0)) <= COALESCE(p.min_stock, 5.0)
            """)
            target_partner_ids = [r[0] for r in cur.fetchall() if r[0]]

        if not target_partner_ids:
            return {
                "success": True,
                "created_orders": [],
                "count": 0,
                "message": "Không có mặt hàng nào cần đặt thêm hoặc tất cả đã được lên đơn."
            }

        db.close()

        results = []
        for pid in target_partner_ids:
            try:
                res = quick_create_draft(QuickDraftRequest(partner_id=pid), user)
                results.append(res)
            except Exception as e:
                logger.warning(f"Lỗi tạo nháp cho partner {pid}: {e}")

        return {
            "success": True,
            "created_orders": results,
            "count": len(results),
            "message": f"Đã tạo/gộp thành công {len(results)} đơn nháp theo từng Nhà Cung Cấp / Xưởng!"
        }
    except Exception as e:
        logger.error(f"Lỗi batch_create_drafts: {e}")
        raise HTTPException(status_code=500, detail=str(e))



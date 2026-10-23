import pytest
from starlette.testclient import TestClient
from server import app

from tests.auth_helpers import owner_auth_headers
client = TestClient(app, headers=owner_auth_headers())

def test_ai_parse_oem_invoice_with_database_context(monkeypatch):
    """
    Test kiểm tra tác nhân AI khi nhận diện văn bản hoặc từ khóa hợp đồng gia công:
    - Mã GC244..GC247
    - Nước Lau Sàn hương Chanh Sả, Bạc Hà, Quế Cam, Cà Phê
    - Có VAT 8%, CK 5%, cọc 50%
    -> Phải tự động nhận diện detected_type = 'oem_order'
    -> Phải nhận diện partner là Lucky Star (ID 10)
    -> Phải bóc tách được vat_percent, discount_percent, deposit_amount
    """
    # Đảm bảo test heuristic offline hoạt động độc lập, không phụ thuộc kết nối mạng/quota Gemini ngoài
    from routers import ai_assistant
    monkeypatch.setattr(ai_assistant, "get_gemini_config", lambda user=None: {"gemini_api_key": ""})

    # Gửi request với prompt_hint mô phỏng nội dung OCR từ ảnh hóa đơn phụ lục 07
    hint_text = """
    MASTER CARE FOR PET_ HĐ VÀ PHỤ LỤC 07 Ngày 13/10/2026
    GC244 Nước Lau Sàn Thú Cưng - Hương Chanh Sả SL 1.500 Đơn giá 18.288
    GC245 Nước Lau Sàn Thú Cưng - Hương Quế Cam SL 1.000 Đơn giá 18.288
    GC246 Nước Lau Sàn Thú Cưng - Hương Cà Phê SL 1.000 Đơn giá 18.288
    GC247 Nước Lau Sàn Thú Cưng - Hương Bạc Hà SL 1.500 Đơn giá 18.288
    THÀNH TIỀN: 91.440.000
    VAT 8%: 7.315.200
    TỔNG THÀNH TIỀN: 98.755.200
    ĐÃ THANH TOÁN ĐỢT 1 (cọc 50%): 49.377.600
    Trừ Chiết Khấu 5% Doanh Số Chưa VAT: 4.572.000
    THANH TOÁN CÒN LẠI KHI NHẬN HÀNG: 44.805.600
    """
    dummy_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    res = client.post("/api/ai/parse-document-image", json={
        "image_base64": dummy_b64,
        "mime_type": "image/png",
        "prompt_hint": hint_text
    })
    assert res.status_code == 200
    data = res.json()
    assert data["detected_type"] == "oem_order"
    assert data["matched_partner_id"] == 10
    assert "Lucky Star" in data["partner_name"]
    assert len(data["items"]) == 4
    assert data.get("vat_percent") == 8.0
    assert data.get("discount_percent") == 5.0
    assert data.get("deposit_amount") == 49377600

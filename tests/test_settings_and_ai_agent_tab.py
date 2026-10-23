import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db

from tests.auth_helpers import owner_auth_headers
client = TestClient(app, headers=owner_auth_headers())

def test_settings_sub_activity_log_exists():
    """Kiểm tra nhật ký hoạt động đã được tách thành sub-tab riêng biệt"""
    res = client.get("/")
    assert res.status_code == 200
    html = res.text
    assert 'id="settings-sub-activity-log"' in html
    assert "switchSettingsSubTab('activity-log')" in html
    assert 'id="activity-log-limit"' in html

def test_company_settings_has_drive_and_no_qr_box():
    """Kiểm tra tab Doanh Nghiệp đã bỏ khối QR ngân hàng và có trường link Drive"""
    res = client.get("/")
    assert res.status_code == 200
    html = res.text
    # Không còn panel vietqr trong tab doanh nghiệp
    assert 'id="panel-vietqr"' not in html
    assert 'id="comp-bank-account"' not in html
    # Có link drive webhook
    assert 'id="comp-drive-webhook-url"' in html

def test_ai_agent_sidebar_tab_and_container():
    """Kiểm tra tab Tác Nhân AI trên sidebar và khung làm việc tab-ai-agent"""
    res = client.get("/")
    assert res.status_code == 200
    html = res.text
    assert "switchTab('ai-agent')" in html
    assert 'id="tab-ai-agent"' in html
    assert 'id="ai-agent-preview-img"' in html
    assert 'btn-ai-push-pos' in html
    assert 'btn-ai-create-po' in html
    assert 'btn-ai-create-oem' in html
    assert 'btn-ai-create-cash' in html

def test_api_parse_document_image():
    """Kiểm tra endpoint POST /api/ai/parse-document-image hoạt động"""
    dummy_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    res = client.post("/api/ai/parse-document-image", json={
        "image_base64": dummy_b64,
        "mime_type": "image/png"
    })
    assert res.status_code == 200
    data = res.json()
    assert "detected_type" in data
    assert "items" in data
    assert data["detected_type"] in ["pos_order", "purchase_order", "oem_order", "cashflow_voucher"]

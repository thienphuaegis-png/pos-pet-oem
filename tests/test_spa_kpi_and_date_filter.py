import pytest
from fastapi.testclient import TestClient
from server import app
import datetime
from database import get_db

client = TestClient(app)

def test_spa_kpi_endpoint():
    res = client.get("/api/pet-services/kpi")
    assert res.status_code == 200
    data = res.json()
    assert "total_pets" in data
    assert "appointments_today" in data
    assert "in_progress" in data
    assert "transport" in data
    assert "uncalled" in data
    assert "not_checked_out" in data
    assert isinstance(data["uncalled"], int)
    assert isinstance(data["not_checked_out"], int)
    assert data["uncalled"] >= 0
    assert data["not_checked_out"] >= 0

from fastapi.testclient import TestClient

from app.main import app


def test_health_and_device_endpoints():
    with TestClient(app) as client:
        assert client.get("/healthz").json() == {"status": "ok"}
        response = client.get("/api/devices")
        assert response.status_code == 200
        assert len(response.json()["devices"]) == 4
        assert client.get("/api/devices/not-real").status_code == 404

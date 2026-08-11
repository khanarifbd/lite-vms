from fastapi.testclient import TestClient

from app.main import app


def test_root() -> None:
    client = TestClient(app)
    response = client.get("/")
    client.close()
    assert response.status_code == 200
    assert response.json()["docs"] == "/docs"


def test_health() -> None:
    client = TestClient(app)
    response = client.get("/health")
    client.close()
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "national-vehicle-platform-api",
    }

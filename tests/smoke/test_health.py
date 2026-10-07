import pytest

from tests.utils.api import ApiClient


@pytest.mark.smoke
def test_health_endpoint_is_available(api_client: ApiClient) -> None:
    response = api_client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.smoke
def test_openapi_document_is_available(api_client: ApiClient) -> None:
    response = api_client.get("/openapi.json")

    assert response.status_code == 200
    assert response.json()["info"]["title"] == "JobConnect API"

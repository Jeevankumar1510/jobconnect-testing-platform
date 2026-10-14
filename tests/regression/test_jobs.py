from uuid import uuid4

import pytest

from tests.utils.api import ApiClient
from tests.utils.factories import JobFactory, UserFactory


@pytest.mark.regression
@pytest.mark.integration
def test_recruiter_can_manage_only_own_jobs(
    api_client: ApiClient,
    candidate: dict[str, int | str],
    recruiter: dict[str, int | str],
    user_factory: UserFactory,
    job_factory: JobFactory,
) -> None:
    other_recruiter = user_factory.create("recruiter")
    job = job_factory(recruiter)
    own_headers = {"Authorization": f"Bearer {recruiter['token']}"}
    other_headers = {"Authorization": f"Bearer {other_recruiter['token']}"}
    candidate_headers = {"Authorization": f"Bearer {candidate['token']}"}

    candidate_create = api_client.post(
        "/api/v1/jobs",
        json={"title": "Unauthorized", "company": "Test", "location": "Remote", "description": "No permission.", "employment_type": "full_time"},
        headers=candidate_headers,
    )
    other_update = api_client.patch(
        f"/api/v1/jobs/{job['id']}",
        json={"title": "Not owner"},
        headers=other_headers,
    )
    candidate_delete = api_client.delete(
        f"/api/v1/jobs/{job['id']}",
        headers=candidate_headers,
    )
    own_update = api_client.patch(
        f"/api/v1/jobs/{job['id']}",
        json={"title": "Updated Python API Test Engineer"},
        headers=own_headers,
    )
    own_delete = api_client.delete(
        f"/api/v1/jobs/{job['id']}",
        headers=own_headers,
    )

    assert candidate_create.status_code == 403
    assert other_update.status_code == 403
    assert candidate_delete.status_code == 403
    assert own_update.status_code == 200
    assert own_update.json()["title"] == "Updated Python API Test Engineer"
    assert own_delete.status_code == 204


@pytest.mark.regression
@pytest.mark.integration
def test_search_filters_and_paginates_jobs(
    api_client: ApiClient,
    recruiter: dict[str, int | str],
    job_factory: JobFactory,
) -> None:
    search_tag = f"pytestsearch{uuid4().hex}"
    first = job_factory(
        recruiter,
        title=f"Python QA Engineer {search_tag}",
        salary_min=85000,
        salary_max=110000,
    )
    second = job_factory(
        recruiter,
        title=f"Python API Engineer {search_tag}",
        salary_min=100000,
        salary_max=130000,
    )

    response = api_client.get(
        "/api/v1/jobs",
        params={
            "q": search_tag,
            "location": "Remote",
            "employment_type": "full_time",
            "salary_min": 90000,
            "salary_max": 120000,
            "page": 1,
            "page_size": 1,
        },
    )
    body = response.json()
    returned_ids = {item["id"] for item in body["items"]}

    assert response.status_code == 200
    assert body["total"] == 2
    assert body["page"] == 1
    assert body["page_size"] == 1
    assert body["pages"] == 2
    assert returned_ids <= {first["id"], second["id"]}


@pytest.mark.regression
@pytest.mark.integration
def test_recruiter_can_list_only_their_jobs(
    api_client: ApiClient,
    recruiter: dict[str, int | str],
    user_factory: UserFactory,
    job_factory: JobFactory,
) -> None:
    other_recruiter = user_factory.create("recruiter")
    own_job = job_factory(recruiter)
    job_factory(other_recruiter)

    response = api_client.get(
        "/api/v1/jobs/mine",
        headers={"Authorization": f"Bearer {recruiter['token']}"},
    )

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["id"] == own_job["id"]


@pytest.mark.regression
@pytest.mark.integration
def test_job_search_rejects_invalid_salary_range(
    api_client: ApiClient,
) -> None:
    response = api_client.get(
        "/api/v1/jobs",
        params={"salary_min": 150000, "salary_max": 50000},
    )

    assert response.status_code == 422


@pytest.mark.regression
@pytest.mark.integration
def test_job_creation_rejects_non_it_and_non_india_locations(
    api_client: ApiClient,
    recruiter: dict[str, int | str],
) -> None:
    headers = {"Authorization": f"Bearer {recruiter['token']}"}

    # Reject non-IT role
    non_it = api_client.post(
        "/api/v1/jobs",
        json={
            "title": "Experienced Tilesetter",
            "company": "Tile Co",
            "location": "Bengaluru",
            "description": "Laying ceramic tiles.",
            "employment_type": "full_time",
        },
        headers=headers,
    )
    assert non_it.status_code == 422
    assert "IT & Tech roles" in non_it.json()["detail"]

    # Reject non-India location
    non_india = api_client.post(
        "/api/v1/jobs",
        json={
            "title": "Junior Software Engineer",
            "company": "Berlin Tech",
            "location": "Berlin, Germany",
            "description": "Backend API development in Python.",
            "employment_type": "full_time",
        },
        headers=headers,
    )
    assert non_india.status_code == 422
    assert "India locations only" in non_india.json()["detail"]

    # Accept India IT role
    valid_india = api_client.post(
        "/api/v1/jobs",
        json={
            "title": "Junior Python Developer",
            "company": "Bangalore Tech Labs",
            "location": "Bengaluru, Karnataka",
            "description": "Build FastAPI microservices and tests.",
            "employment_type": "full_time",
        },
        headers=headers,
    )
    assert valid_india.status_code == 201
    assert valid_india.json()["title"] == "Junior Python Developer"
    assert valid_india.json()["location"] == "Bengaluru, Karnataka"


@pytest.mark.regression
@pytest.mark.integration
def test_cron_sync_endpoint(
    api_client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Test without secret when no secret is configured
    monkeypatch.delenv("CRON_SECRET", raising=False)
    resp = api_client.get("/api/v1/jobs/cron-sync")
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"

    # Test with secret when CRON_SECRET is configured
    monkeypatch.setenv("CRON_SECRET", "super-secret-cron-key-12345")
    unauth = api_client.get("/api/v1/jobs/cron-sync")
    assert unauth.status_code == 401

    auth_query = api_client.get("/api/v1/jobs/cron-sync?secret=super-secret-cron-key-12345")
    assert auth_query.status_code == 200

    auth_header = api_client.post(
        "/api/v1/jobs/cron-sync",
        headers={"X-Cron-Secret": "super-secret-cron-key-12345"},
    )
    assert auth_header.status_code == 200



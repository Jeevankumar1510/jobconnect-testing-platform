import pytest

from tests.utils.api import ApiClient
from tests.utils.factories import (
    ApplicationFactory,
    JobFactory,
    UserFactory,
    VALID_PDF,
)


@pytest.mark.regression
@pytest.mark.integration
def test_candidate_application_resume_and_status_workflow(
    api_client: ApiClient,
    candidate: dict[str, int | str],
    recruiter: dict[str, int | str],
    user_factory: UserFactory,
    job_factory: JobFactory,
    application_factory: ApplicationFactory,
) -> None:
    other_recruiter = user_factory.create("recruiter")
    job = job_factory(recruiter)
    candidate_headers = {"Authorization": f"Bearer {candidate['token']}"}
    recruiter_headers = {"Authorization": f"Bearer {recruiter['token']}"}
    other_headers = {"Authorization": f"Bearer {other_recruiter['token']}"}

    unsupported_file = application_factory(
        job["id"],
        filename="resume.txt",
        content=b"not a resume",
    )
    malformed_pdf = application_factory(
        job["id"],
        filename="resume.pdf",
        content=b"not a PDF",
    )
    oversized_pdf = application_factory(
        job["id"],
        filename="resume.pdf",
        content=b"%PDF-" + b"x" * (5_242_881 - 5),
    )

    assert unsupported_file.status_code == 415
    assert malformed_pdf.status_code == 415
    assert oversized_pdf.status_code == 413

    application_response = application_factory(job["id"])
    assert application_response.status_code == 201, application_response.text
    application = application_response.json()
    application_id = application["id"]
    assert application["status"] == "submitted"

    duplicate = application_factory(job["id"])
    recruiter_applications = api_client.get(
        f"/api/v1/applications/jobs/{job['id']}",
        headers=recruiter_headers,
    )
    candidate_applications = api_client.get(
        "/api/v1/applications/mine",
        headers=candidate_headers,
    )
    wrong_recruiter_applications = api_client.get(
        f"/api/v1/applications/jobs/{job['id']}",
        headers=other_headers,
    )

    assert duplicate.status_code == 409
    assert recruiter_applications.status_code == 200
    assert recruiter_applications.json()["total"] == 1
    assert candidate_applications.status_code == 200
    assert candidate_applications.json()["total"] == 1
    assert wrong_recruiter_applications.status_code == 403

    candidate_update = api_client.patch(
        f"/api/v1/applications/{application_id}/status",
        json={"status": "reviewing"},
        headers=candidate_headers,
    )
    assert candidate_update.status_code == 403

    for next_status in ("reviewing", "interview", "accepted"):
        response = api_client.patch(
            f"/api/v1/applications/{application_id}/status",
            json={"status": next_status},
            headers=recruiter_headers,
        )
        assert response.status_code == 200
        assert response.json()["status"] == next_status

    invalid_transition = api_client.patch(
        f"/api/v1/applications/{application_id}/status",
        json={"status": "reviewing"},
        headers=recruiter_headers,
    )
    downloaded_resume = api_client.get(
        f"/api/v1/applications/{application_id}/resume",
        headers=candidate_headers,
    )
    other_resume = api_client.get(
        f"/api/v1/applications/{application_id}/resume",
        headers=other_headers,
    )

    assert invalid_transition.status_code == 409
    assert downloaded_resume.status_code == 200
    assert downloaded_resume.content == VALID_PDF
    assert other_resume.status_code == 403

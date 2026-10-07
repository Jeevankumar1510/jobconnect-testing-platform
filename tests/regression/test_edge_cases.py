from io import BytesIO
from zipfile import ZipFile

import pytest

from applications.enums import ApplicationStatus
from applications.models import Application
from config.database import SessionLocal
from tests.utils.api import ApiClient
from tests.utils.factories import (
    ApplicationFactory,
    JobFactory,
    UserFactory,
)


@pytest.mark.regression
@pytest.mark.integration
def test_email_case_is_normalized_for_login_and_duplicate_checks(
    api_client: ApiClient,
    candidate: dict[str, int | str],
    user_factory: UserFactory,
) -> None:
    uppercase_email = str(candidate["email"]).upper()
    password = user_factory.password_for(str(candidate["email"]))
    login = api_client.post(
        "/api/v1/auth/login",
        json={"email": uppercase_email, "password": password},
    )
    duplicate = api_client.post(
        "/api/v1/auth/register",
        json={
            "email": uppercase_email,
            "password": password,
            "role": "candidate",
        },
    )

    assert login.status_code == 200
    assert duplicate.status_code == 409
    profile = api_client.get(
        "/api/v1/auth/me",
        headers={
            "Authorization": f"Bearer {login.json()['access_token']}",
        },
    )
    assert profile.status_code == 200
    assert profile.json()["email"] == str(candidate["email"])


@pytest.mark.regression
@pytest.mark.integration
def test_invalid_partial_job_updates_do_not_change_saved_values(
    api_client: ApiClient,
    recruiter: dict[str, int | str],
    job_factory: JobFactory,
) -> None:
    job = job_factory(recruiter)
    headers = {"Authorization": f"Bearer {recruiter['token']}"}
    invalid_salary = api_client.patch(
        f"/api/v1/jobs/{job['id']}",
        json={"salary_min": 120000},
        headers=headers,
    )
    null_title = api_client.patch(
        f"/api/v1/jobs/{job['id']}",
        json={"title": None},
        headers=headers,
    )
    unchanged = api_client.get(f"/api/v1/jobs/{job['id']}")

    assert invalid_salary.status_code == 422
    assert null_title.status_code == 422
    assert unchanged.status_code == 200
    assert unchanged.json()["title"] == job["title"]
    assert unchanged.json()["salary_min"] == "85000.00"


@pytest.mark.regression
@pytest.mark.integration
def test_candidate_cannot_apply_to_closed_or_missing_job(
    api_client: ApiClient,
    recruiter: dict[str, int | str],
    job_factory: JobFactory,
    application_factory: ApplicationFactory,
) -> None:
    job = job_factory(recruiter)
    close_response = api_client.patch(
        f"/api/v1/jobs/{job['id']}",
        json={"status": "closed"},
        headers={"Authorization": f"Bearer {recruiter['token']}"},
    )
    closed_job = application_factory(int(job["id"]))
    missing_job = application_factory(2147483647)

    assert close_response.status_code == 200
    assert closed_job.status_code == 404
    assert missing_job.status_code == 404


@pytest.mark.regression
@pytest.mark.integration
def test_valid_docx_resume_is_persisted_and_downloadable(
    api_client: ApiClient,
    candidate: dict[str, int | str],
    recruiter: dict[str, int | str],
    job_factory: JobFactory,
    application_factory: ApplicationFactory,
) -> None:
    document = BytesIO()
    with ZipFile(document, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", "<w:document/>")
    docx_bytes = document.getvalue()
    job = job_factory(recruiter)
    application_response = application_factory(
        int(job["id"]),
        filename="pytest-resume.docx",
        content=docx_bytes,
    )

    assert application_response.status_code == 201, application_response.text
    application = application_response.json()
    assert application["resume_content_type"] == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )

    download = api_client.get(
        f"/api/v1/applications/{application['id']}/resume",
        headers={"Authorization": f"Bearer {candidate['token']}"},
    )
    assert download.status_code == 200
    assert download.content == docx_bytes


@pytest.mark.regression
@pytest.mark.integration
def test_only_the_job_owner_can_change_application_status(
    api_client: ApiClient,
    recruiter: dict[str, int | str],
    user_factory: UserFactory,
    job_factory: JobFactory,
    application_factory: ApplicationFactory,
) -> None:
    other_recruiter = user_factory.create("recruiter")
    job = job_factory(recruiter)
    application_response = application_factory(int(job["id"]))
    assert application_response.status_code == 201, application_response.text
    application_id = application_response.json()["id"]

    response = api_client.patch(
        f"/api/v1/applications/{application_id}/status",
        json={"status": "reviewing"},
        headers={"Authorization": f"Bearer {other_recruiter['token']}"},
    )
    with SessionLocal() as db:
        saved_application = db.get(Application, application_id)
        assert saved_application is not None
        saved_status = saved_application.status

    assert response.status_code == 403
    assert saved_status == ApplicationStatus.SUBMITTED

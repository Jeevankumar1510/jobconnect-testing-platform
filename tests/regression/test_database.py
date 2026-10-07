import pytest

from accounts.models import User
from accounts.security import verify_password
from applications.enums import ApplicationStatus
from applications.models import Application
from config.database import SessionLocal
from config.settings import get_settings
from jobs.enums import JobStatus
from jobs.models import Job
from tests.utils.api import ApiClient
from tests.utils.factories import ApplicationFactory, JobFactory, UserFactory


@pytest.mark.regression
@pytest.mark.integration
def test_registered_user_is_saved_with_an_argon2_password_hash(
    candidate: dict[str, int | str],
    user_factory: UserFactory,
) -> None:
    with SessionLocal() as db:
        saved_user = db.get(User, int(candidate["id"]))
        assert saved_user is not None
        assert saved_user.email == candidate["email"]
        assert saved_user.role.value == "candidate"
        assert saved_user.hashed_password != user_factory.password_for(
            str(candidate["email"])
        )
        assert saved_user.hashed_password.startswith("$argon2id$")
        assert verify_password(
            user_factory.password_for(str(candidate["email"])),
            saved_user.hashed_password,
        )


@pytest.mark.regression
@pytest.mark.integration
def test_job_application_rows_and_resume_file_follow_database_lifecycle(
    api_client: ApiClient,
    candidate: dict[str, int | str],
    recruiter: dict[str, int | str],
    job_factory: JobFactory,
    application_factory: ApplicationFactory,
) -> None:
    job = job_factory(recruiter)
    application_response = application_factory(int(job["id"]))
    assert application_response.status_code == 201, application_response.text
    application_id = application_response.json()["id"]

    with SessionLocal() as db:
        saved_job = db.get(Job, int(job["id"]))
        saved_application = db.get(Application, application_id)
        assert saved_job is not None
        assert saved_job.recruiter_id == int(recruiter["id"])
        assert saved_job.status == JobStatus.OPEN
        assert saved_application is not None
        assert saved_application.job_id == int(job["id"])
        assert saved_application.candidate_id == int(candidate["id"])
        assert saved_application.status == ApplicationStatus.SUBMITTED
        resume_path = (
            get_settings().resume_storage_dir
            / saved_application.resume_storage_key
        )
        assert resume_path.is_file()
        assert resume_path.read_bytes().startswith(b"%PDF-")

    status_response = api_client.patch(
        f"/api/v1/applications/{application_id}/status",
        json={"status": "reviewing"},
        headers={"Authorization": f"Bearer {recruiter['token']}"},
    )
    assert status_response.status_code == 200
    with SessionLocal() as db:
        updated_application = db.get(Application, application_id)
        assert updated_application is not None
        assert updated_application.status == ApplicationStatus.REVIEWING

    try:
        delete_response = api_client.delete(
            f"/api/v1/jobs/{job['id']}",
            headers={"Authorization": f"Bearer {recruiter['token']}"},
        )
        assert delete_response.status_code == 204
        with SessionLocal() as db:
            assert db.get(Job, int(job["id"])) is None
            assert db.get(Application, application_id) is None
        assert not resume_path.exists()
    finally:
        resume_path.unlink(missing_ok=True)

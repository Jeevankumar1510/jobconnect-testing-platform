from pathlib import Path
from secrets import token_urlsafe
from typing import Protocol
from uuid import uuid4

import requests
from sqlalchemy import delete, select

from accounts.models import User
from applications.models import Application
from config.database import SessionLocal
from config.settings import get_settings
from tests.utils.api import ApiClient
VALID_PDF = b"%PDF-1.4\nJobConnect API test resume\n%%EOF"


class JobFactory(Protocol):
    def __call__(
        self,
        recruiter: dict[str, int | str],
        **overrides: object,
    ) -> dict[str, object]: ...


class ApplicationFactory(Protocol):
    def __call__(
        self,
        job_id: int,
        *,
        filename: str = "pytest-resume.pdf",
        content: bytes = VALID_PDF,
        token: str | None = None,
    ) -> requests.Response: ...


class UserFactory:
    def __init__(self, client: ApiClient) -> None:
        self.client = client
        self.emails: list[str] = []
        self._passwords: dict[str, str] = {}

    def create(self, role: str) -> dict[str, int | str]:
        email = f"pytest-{role}-{uuid4().hex}@example.com"
        password = token_urlsafe(24)
        self.emails.append(email)
        self._passwords[email] = password
        response = self.client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": password,
                "role": role,
            },
        )
        assert response.status_code == 201, response.text
        registered_user = response.json()

        login_response = self.client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        assert login_response.status_code == 200, login_response.text
        return {
            "id": registered_user["id"],
            "email": email,
            "role": role,
            "token": login_response.json()["access_token"],
        }

    def password_for(self, email: str) -> str:
        return self._passwords[email]

    def cleanup(self) -> None:
        if not self.emails:
            return

        with SessionLocal() as db:
            storage_keys = db.scalars(
                select(Application.resume_storage_key)
                .join(User, User.id == Application.candidate_id)
                .where(User.email.in_(self.emails))
            ).all()
            resume_dir: Path = get_settings().resume_storage_dir
            for storage_key in storage_keys:
                (resume_dir / storage_key).unlink(missing_ok=True)

            db.execute(delete(User).where(User.email.in_(self.emails)))
            db.commit()


def make_job_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "title": "Python API Test Engineer",
        "company": f"Pytest Demo {uuid4().hex[:8]}",
        "location": "Remote",
        "description": "Build Python REST APIs and automated tests.",
        "employment_type": "full_time",
        "salary_min": 85000,
        "salary_max": 110000,
    }
    payload.update(overrides)
    return payload

from secrets import token_urlsafe

import pytest

from tests.utils.api import ApiClient
from tests.utils.factories import UserFactory


@pytest.mark.regression
@pytest.mark.integration
def test_candidate_can_login_and_read_own_profile(
    api_client: ApiClient,
    candidate: dict[str, int | str],
) -> None:
    response = api_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {candidate['token']}"},
    )

    assert response.status_code == 200
    assert response.json()["email"] == candidate["email"]
    assert response.json()["role"] == "candidate"
    assert "hashed_password" not in response.json()


@pytest.mark.regression
@pytest.mark.integration
def test_authentication_rejects_missing_and_invalid_credentials(
    api_client: ApiClient,
    candidate: dict[str, int | str],
) -> None:
    missing_token = api_client.get("/api/v1/auth/me")
    invalid_login = api_client.post(
        "/api/v1/auth/login",
        json={
            "email": candidate["email"],
            "password": token_urlsafe(16),
        },
    )

    assert missing_token.status_code == 401
    assert invalid_login.status_code == 401


@pytest.mark.regression
@pytest.mark.integration
def test_registration_rejects_duplicate_and_invalid_data(
    api_client: ApiClient,
    candidate: dict[str, int | str],
    user_factory: UserFactory,
) -> None:
    duplicate = api_client.post(
        "/api/v1/auth/register",
        json={
            "email": candidate["email"],
            "password": user_factory.password_for(str(candidate["email"])),
            "role": "candidate",
        },
    )
    invalid_email = api_client.post(
        "/api/v1/auth/register",
        json={
            "email": "not-an-email",
            "password": token_urlsafe(16),
            "role": "candidate",
        },
    )
    invalid_role = api_client.post(
        "/api/v1/auth/register",
        json={
            "email": "pytest-invalid-role@example.com",
            "password": token_urlsafe(16),
            "role": "admin",
        },
    )

    assert duplicate.status_code == 409
    assert invalid_email.status_code == 422
    assert invalid_role.status_code == 422

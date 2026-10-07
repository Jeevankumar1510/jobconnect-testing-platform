import os
import socket
import threading
import time
from collections.abc import Generator
from pathlib import Path

import pytest
import requests
import uvicorn

from tests.utils.api import ApiClient
from tests.utils.factories import (
    VALID_PDF,
    ApplicationFactory,
    JobFactory,
    UserFactory,
    make_job_payload,
)


@pytest.fixture(scope="session")
def base_url() -> Generator[str, None, None]:
    configured_url = os.getenv("API_BASE_URL")
    if configured_url:
        yield configured_url.rstrip("/")
        return

    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    port = listener.getsockname()[1]
    server = uvicorn.Server(
        uvicorn.Config(
            "api.main:app",
            host="127.0.0.1",
            port=port,
            log_level="error",
            access_log=False,
        )
    )
    thread = threading.Thread(
        target=server.run,
        kwargs={"sockets": [listener]},
        daemon=True,
    )
    thread.start()

    deadline = time.monotonic() + 10
    while not server.started and thread.is_alive() and time.monotonic() < deadline:
        time.sleep(0.05)
    if not server.started:
        server.should_exit = True
        thread.join(timeout=10)
        listener.close()
        raise RuntimeError("The test API server failed to start")

    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        listener.close()
        if thread.is_alive():
            raise RuntimeError("The test API server did not shut down")


@pytest.fixture
def api_client(base_url: str) -> Generator[ApiClient, None, None]:
    client = ApiClient(base_url)
    yield client
    client.close()


@pytest.fixture
def user_factory(api_client: ApiClient) -> Generator[UserFactory, None, None]:
    factory = UserFactory(api_client)
    yield factory
    factory.cleanup()


@pytest.fixture
def candidate(user_factory: UserFactory) -> dict[str, int | str]:
    return user_factory.create("candidate")


@pytest.fixture
def recruiter(user_factory: UserFactory) -> dict[str, int | str]:
    return user_factory.create("recruiter")


@pytest.fixture
def job_factory(
    api_client: ApiClient,
) -> JobFactory:
    def create(
        recruiter: dict[str, int | str],
        **overrides: object,
    ) -> dict[str, object]:
        response = api_client.post(
            "/api/v1/jobs",
            json=make_job_payload(**overrides),
            headers={"Authorization": f"Bearer {recruiter['token']}"},
        )
        assert response.status_code == 201, response.text
        return response.json()

    return create


@pytest.fixture
def application_factory(
    api_client: ApiClient,
    candidate: dict[str, int | str],
) -> ApplicationFactory:
    def apply(
        job_id: int,
        *,
        filename: str = "pytest-resume.pdf",
        content: bytes = VALID_PDF,
        token: str | None = None,
    ) -> requests.Response:
        return api_client.post(
            "/api/v1/applications",
            data={
                "job_id": str(job_id),
                "cover_letter": "Pytest application integration test",
            },
            files={
                "resume": (
                    filename,
                    content,
                    {
                        ".pdf": "application/pdf",
                        ".docx": (
                            "application/vnd.openxmlformats-officedocument."
                            "wordprocessingml.document"
                        ),
                    }.get(Path(filename).suffix.lower(), "application/octet-stream"),
                ),
            },
            headers={
                "Authorization": f"Bearer {token or candidate['token']}",
            },
        )

    return apply


def pytest_configure() -> None:
    Path("reports").mkdir(exist_ok=True)
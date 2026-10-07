import random

from locust import HttpUser, between, task


class PublicJobApiUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self) -> None:
        self.job_ids: list[int] = []

    @task(6)
    def search_jobs(self) -> None:
        params = {
            "q": random.choice(["python", "test automation", "engineer"]),
            "location": random.choice(["Remote", "New York", "London"]),
            "page": 1,
            "page_size": 20,
        }
        with self.client.get(
            "/api/v1/jobs",
            params=params,
            name="GET /api/v1/jobs",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"Unexpected HTTP status {response.status_code}")
                return
            try:
                payload = response.json()
            except ValueError:
                response.failure("Job search did not return valid JSON")
                return
            if not isinstance(payload, dict) or not isinstance(
                payload.get("items"), list
            ):
                response.failure("Job search response is missing the items list")
                return

            self.job_ids = [
                item["id"]
                for item in payload["items"]
                if isinstance(item, dict) and isinstance(item.get("id"), int)
            ]
            response.success()

    @task(2)
    def read_job_details(self) -> None:
        if not self.job_ids:
            return

        job_id = random.choice(self.job_ids)
        with self.client.get(
            f"/api/v1/jobs/{job_id}",
            name="GET /api/v1/jobs/[job_id]",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"Unexpected HTTP status {response.status_code}")
                return
            try:
                payload = response.json()
            except ValueError:
                response.failure("Job detail did not return valid JSON")
                return
            if not isinstance(payload, dict) or payload.get("id") != job_id:
                response.failure("Job detail response did not match the requested job")
                return
            response.success()

    @task(1)
    def check_health(self) -> None:
        with self.client.get(
            "/api/v1/health",
            name="GET /api/v1/health",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"Unexpected HTTP status {response.status_code}")
                return
            try:
                payload = response.json()
            except ValueError:
                response.failure("Health check did not return valid JSON")
                return
            if not isinstance(payload, dict) or payload.get("status") != "ok":
                response.failure("Health check returned an unexpected response")
                return
            response.success()

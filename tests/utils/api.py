import requests


class ApiClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json"})

    def request(self, method: str, path: str, **kwargs: object) -> requests.Response:
        kwargs.setdefault("timeout", 10)
        return self.session.request(
            method,
            f"{self.base_url}{path}",
            **kwargs,
        )

    def get(self, path: str, **kwargs: object) -> requests.Response:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs: object) -> requests.Response:
        return self.request("POST", path, **kwargs)

    def patch(self, path: str, **kwargs: object) -> requests.Response:
        return self.request("PATCH", path, **kwargs)

    def delete(self, path: str, **kwargs: object) -> requests.Response:
        return self.request("DELETE", path, **kwargs)

    def close(self) -> None:
        self.session.close()

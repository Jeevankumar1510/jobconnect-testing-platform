import os
import urllib.parse
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
    postgres_db: str = ""
    postgres_user: str = ""
    postgres_password: SecretStr = SecretStr("")
    jwt_secret_key: SecretStr
    django_secret_key: SecretStr
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5432
    jwt_access_token_expire_minutes: int = Field(default=30, gt=0)
    resume_storage_dir: Path = Path("media/resumes")
    max_resume_size_bytes: int = Field(default=5_242_880, gt=0)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="before")
    @classmethod
    def populate_db_from_url(cls, data: Any) -> Any:
        if isinstance(data, dict):
            db_url = data.get("DATABASE_URL") or os.environ.get("DATABASE_URL")
            if db_url:
                parsed = urllib.parse.urlparse(db_url)
                if not data.get("postgres_user") and parsed.username:
                    data["postgres_user"] = parsed.username
                if not data.get("postgres_password") and parsed.password:
                    data["postgres_password"] = parsed.password
                if not data.get("postgres_host") and parsed.hostname:
                    data["postgres_host"] = parsed.hostname
                if not data.get("postgres_port") and parsed.port:
                    data["postgres_port"] = parsed.port
                if not data.get("postgres_db") and parsed.path:
                    data["postgres_db"] = parsed.path.lstrip("/")
        return data

    @field_validator("jwt_secret_key")
    @classmethod
    def validate_jwt_secret(cls, secret: SecretStr) -> SecretStr:
        if len(secret.get_secret_value()) < 32:
            raise ValueError("JWT_SECRET_KEY must contain at least 32 characters")
        return secret

    @field_validator("django_secret_key")
    @classmethod
    def validate_django_secret(cls, secret: SecretStr) -> SecretStr:
        if len(secret.get_secret_value()) < 32:
            raise ValueError("DJANGO_SECRET_KEY must contain at least 32 characters")
        return secret

    @property
    def database_url(self) -> URL:
        return URL.create(
            drivername="postgresql+psycopg",
            username=self.postgres_user,
            password=self.postgres_password.get_secret_value(),
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()

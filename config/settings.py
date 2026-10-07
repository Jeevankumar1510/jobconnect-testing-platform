from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
    postgres_db: str
    postgres_user: str
    postgres_password: SecretStr
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

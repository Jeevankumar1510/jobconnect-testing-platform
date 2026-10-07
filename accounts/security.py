from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash

from config.settings import get_settings

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.jwt_access_token_expire_minutes
    )
    return jwt.encode(
        {"sub": str(user_id), "exp": expires_at},
        settings.jwt_secret_key.get_secret_value(),
        algorithm="HS256",
    )

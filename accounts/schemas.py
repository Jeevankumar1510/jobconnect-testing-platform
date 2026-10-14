from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field


class UserRole(str, Enum):
    CANDIDATE = "candidate"
    RECRUITER = "recruiter"


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    role: UserRole
    created_at: datetime
    resume_filename: str | None = None
    headline: str | None = None
    resume_storage_key: str | None = Field(default=None, exclude=True)

    @computed_field
    @property
    def has_saved_resume(self) -> bool:
        return bool(self.resume_storage_key)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

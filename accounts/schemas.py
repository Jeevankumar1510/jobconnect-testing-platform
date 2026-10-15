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


class CandidateProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=150)
    phone: str | None = Field(default=None, max_length=30)
    current_location: str | None = Field(default=None, max_length=150)
    preferred_locations: str | None = None
    preferred_job_titles: str | None = None
    technical_skills: str | None = None
    education: str | None = None
    experience_level: str | None = Field(default=None, max_length=50)
    internship_experience: str | None = None
    projects: str | None = None
    certifications: str | None = None
    preferred_industries: str | None = None
    employment_type_preferences: str | None = None
    work_mode_preferences: str | None = None
    expected_salary_min: float | None = None
    expected_salary_max: float | None = None


class CandidateProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    full_name: str | None = None
    phone: str | None = None
    current_location: str | None = None
    preferred_locations: str | None = None
    preferred_job_titles: str | None = None
    technical_skills: str | None = None
    education: str | None = None
    experience_level: str | None = "fresher"
    internship_experience: str | None = None
    projects: str | None = None
    certifications: str | None = None
    preferred_industries: str | None = None
    employment_type_preferences: str | None = None
    work_mode_preferences: str | None = None
    expected_salary_min: float | None = None
    expected_salary_max: float | None = None
    profile_completion_percentage: int = 0
    updated_at: datetime


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    job_id: int | None = None
    notification_type: str
    title: str
    message: str
    is_read: bool
    created_at: datetime


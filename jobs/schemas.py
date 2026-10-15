from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from jobs.enums import EmploymentType, JobStatus


class JobCreate(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    company: str = Field(min_length=1, max_length=150)
    location: str = Field(min_length=1, max_length=150)
    description: str = Field(min_length=1)
    employment_type: EmploymentType
    experience_level: str = Field(default="fresher", max_length=50)
    is_fresher: bool = Field(default=True)
    salary_min: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    salary_max: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)

    @model_validator(mode="after")
    def validate_salary_range(self) -> "JobCreate":
        if (
            self.salary_min is not None
            and self.salary_max is not None
            and self.salary_min > self.salary_max
        ):
            raise ValueError("salary_min must not exceed salary_max")
        return self


class JobUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=150)
    company: str | None = Field(default=None, min_length=1, max_length=150)
    location: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = Field(default=None, min_length=1)
    employment_type: EmploymentType | None = None
    experience_level: str | None = Field(default=None, max_length=50)
    is_fresher: bool | None = None
    salary_min: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    salary_max: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    status: JobStatus | None = None

    @model_validator(mode="after")
    def validate_update(self) -> "JobUpdate":
        required_fields = {
            "title",
            "company",
            "location",
            "description",
            "employment_type",
            "status",
        }
        for field in required_fields & self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")

        if (
            self.salary_min is not None
            and self.salary_max is not None
            and self.salary_min > self.salary_max
        ):
            raise ValueError("salary_min must not exceed salary_max")
        return self


class JobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    recruiter_id: int
    title: str
    company: str
    location: str
    description: str
    employment_type: EmploymentType
    experience_level: str = "fresher"
    is_fresher: bool = True
    salary_min: Decimal | None
    salary_max: Decimal | None
    status: JobStatus
    is_external: bool = False
    external_url: str | None = None
    company_logo: str | None = None
    source: str | None = None
    source_job_url: str | None = None
    employer_job_url: str | None = None
    application_url: str | None = None
    source_listing_url: str | None = None
    source_platform: str | None = None
    employer_website: str | None = None
    canonical_job_url: str | None = None
    last_url_verified_at: datetime | None = None
    verification_status: str = "unverified"
    hiring_status: str = "open"
    verification_reason: str | None = None
    apply_destination_url: str | None = None
    apply_destination_type: str | None = None
    is_destination_verified: bool = False
    apply_warning: str | None = None
    apply_disabled: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None


class JobPage(BaseModel):
    items: list[JobRead]
    total: int
    page: int
    page_size: int
    pages: int


class SaveJobCreate(BaseModel):
    notes: str | None = None


class SavedJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    job_id: int
    notes: str | None = None
    created_at: datetime
    job: JobRead | None = None


class JobRecommendationRead(BaseModel):
    job: JobRead
    match_score: int
    match_reasons: list[str]
    explanation: str


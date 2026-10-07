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
    salary_min: Decimal | None
    salary_max: Decimal | None
    status: JobStatus
    created_at: datetime
    updated_at: datetime


class JobPage(BaseModel):
    items: list[JobRead]
    total: int
    page: int
    page_size: int
    pages: int

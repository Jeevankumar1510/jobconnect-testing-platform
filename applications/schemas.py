from datetime import datetime

from pydantic import BaseModel, ConfigDict

from applications.enums import ApplicationStatus


class ApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    candidate_id: int
    status: ApplicationStatus
    cover_letter: str | None = None
    resume_filename: str | None = None
    resume_content_type: str | None = None
    notes: str | None = None
    external_application_url: str | None = None
    applied_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    job_title: str | None = None
    company: str | None = None
    external_url: str | None = None


class ApplicationStatusUpdate(BaseModel):
    status: ApplicationStatus
    notes: str | None = None


class ExternalApplicationTrack(BaseModel):
    job_id: int
    status: ApplicationStatus | None = None
    notes: str | None = None
    external_url: str | None = None


class ApplicationPage(BaseModel):
    items: list[ApplicationRead]
    total: int
    page: int
    page_size: int
    pages: int


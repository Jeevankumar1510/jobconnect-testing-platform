from datetime import datetime

from pydantic import BaseModel, ConfigDict

from applications.enums import ApplicationStatus


class ApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    candidate_id: int
    status: ApplicationStatus
    cover_letter: str | None
    resume_filename: str
    resume_content_type: str
    created_at: datetime
    updated_at: datetime


class ApplicationStatusUpdate(BaseModel):
    status: ApplicationStatus


class ApplicationPage(BaseModel):
    items: list[ApplicationRead]
    total: int
    page: int
    page_size: int
    pages: int

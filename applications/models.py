from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from applications.enums import ApplicationStatus
from config.database import Base


class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint(
            "job_id",
            "candidate_id",
            name="uq_application_job_candidate",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(
            ApplicationStatus,
            native_enum=False,
            length=20,
            values_callable=lambda enum_type: [item.value for item in enum_type],
        ),
        default=ApplicationStatus.SUBMITTED,
        nullable=False,
    )
    cover_letter: Mapped[str | None] = mapped_column(Text)
    resume_storage_key: Mapped[str] = mapped_column(String(41), unique=True)
    resume_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    resume_content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

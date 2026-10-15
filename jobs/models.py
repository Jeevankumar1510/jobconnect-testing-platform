from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from config.database import Base
from jobs.enums import EmploymentType, JobStatus


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    recruiter_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(150), index=True, nullable=False)
    company: Mapped[str] = mapped_column(String(150), nullable=False)
    location: Mapped[str] = mapped_column(String(150), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    employment_type: Mapped[EmploymentType] = mapped_column(
        Enum(
            EmploymentType,
            native_enum=False,
            length=20,
            values_callable=lambda enum_type: [item.value for item in enum_type],
        ),
        nullable=False,
    )
    salary_min: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    salary_max: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    status: Mapped[JobStatus] = mapped_column(
        Enum(
            JobStatus,
            native_enum=False,
            length=50,
            values_callable=lambda enum_type: [item.value for item in enum_type],
        ),
        default=JobStatus.OPEN,
        index=True,
        nullable=False,
    )
    is_external: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    external_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    company_logo: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    experience_level: Mapped[str] = mapped_column(String(50), default="fresher", index=True, nullable=False)
    is_fresher: Mapped[bool] = mapped_column(Boolean, default=True, index=True, nullable=False)
    external_id: Mapped[str | None] = mapped_column(
        String(100),
        unique=True,
        index=True,
        nullable=True,
    )
    source_job_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    employer_job_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    application_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_listing_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_platform: Mapped[str | None] = mapped_column(String(100), nullable=True)
    employer_website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    canonical_job_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_url_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verification_status: Mapped[str] = mapped_column(String(50), default="unverified", nullable=False)
    hiring_status: Mapped[str] = mapped_column(String(50), default="open", index=True, nullable=False)
    verification_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    consecutive_verification_failures: Mapped[int] = mapped_column(default=0, nullable=False)
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


class SavedJob(Base):
    __tablename__ = "saved_jobs"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "job_id",
            name="uq_saved_job_user",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    job_id: Mapped[int] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class JobVerificationHistory(Base):
    __tablename__ = "job_verification_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    verification_result: Mapped[str] = mapped_column(String(50), nullable=False)
    evidence_source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    destination_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


import enum
from datetime import datetime, timezone

from decimal import Decimal
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from config.database import Base


class UserRole(str, enum.Enum):
    CANDIDATE = "candidate"
    RECRUITER = "recruiter"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, native_enum=False, length=20),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    resume_storage_key: Mapped[str | None] = mapped_column(String(41), nullable=True)
    resume_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resume_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    headline: Mapped[str | None] = mapped_column(String(200), nullable=True)


class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    full_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    current_location: Mapped[str | None] = mapped_column(String(150), nullable=True)
    preferred_locations: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_job_titles: Mapped[str | None] = mapped_column(Text, nullable=True)
    technical_skills: Mapped[str | None] = mapped_column(Text, nullable=True)
    education: Mapped[str | None] = mapped_column(Text, nullable=True)
    experience_level: Mapped[str | None] = mapped_column(String(50), default="fresher", nullable=True)
    internship_experience: Mapped[str | None] = mapped_column(Text, nullable=True)
    projects: Mapped[str | None] = mapped_column(Text, nullable=True)
    certifications: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_industries: Mapped[str | None] = mapped_column(Text, nullable=True)
    employment_type_preferences: Mapped[str | None] = mapped_column(Text, nullable=True)
    work_mode_preferences: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_salary_min: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    expected_salary_max: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    profile_completion_percentage: Mapped[int] = mapped_column(default=0, nullable=False)
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


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=True,
    )
    notification_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


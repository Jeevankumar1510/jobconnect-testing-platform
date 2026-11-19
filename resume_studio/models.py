import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from config.database import Base


class ResumeTemplateModel(Base):
    __tablename__ = "resume_templates"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    template_name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="Technical", nullable=False)
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    badge: Mapped[str] = mapped_column(String(50), default="ATS-Friendly", nullable=False)
    accent_color: Mapped[str] = mapped_column(String(30), default="#0f172a", nullable=False)
    font_family: Mapped[str] = mapped_column(String(50), default="Inter", nullable=False)
    is_single_column: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    template_configuration: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON config
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class ResumeDocument(Base):
    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    resume_name: Mapped[str] = mapped_column(String(200), default="My Professional Resume", nullable=False)
    template_id: Mapped[str] = mapped_column(String(50), default="modern-professional", nullable=False)
    target_role: Mapped[str | None] = mapped_column(String(150), nullable=True)
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("jobs.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Core Structured Sections (Stored as JSON)
    personal_info_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    career_objective: Mapped[str | None] = mapped_column(Text, nullable=True)
    technical_skills_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    education_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    projects_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    internships_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    certifications_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    custom_sections_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)

    # Formatting Customization (Fonts, Margins, Accent Colors)
    formatting_config_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)

    # ATS Quality Score
    ats_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

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

    versions = relationship("ResumeVersion", back_populates="resume", cascade="all, delete-orphan")


class ResumeVersion(Base):
    __tablename__ = "resume_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    resume_id: Mapped[int] = mapped_column(
        ForeignKey("resumes.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    version_name: Mapped[str] = mapped_column(String(150), nullable=False)
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("jobs.id", ondelete="SET NULL"),
        nullable=True,
    )
    snapshot_data_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    resume = relationship("ResumeDocument", back_populates="versions")

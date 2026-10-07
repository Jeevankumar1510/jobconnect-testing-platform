from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text
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
            length=20,
            values_callable=lambda enum_type: [item.value for item in enum_type],
        ),
        default=JobStatus.OPEN,
        index=True,
        nullable=False,
    )
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

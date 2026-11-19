from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from config.database import Base


class ResumeAnalysis(Base):
    __tablename__ = "resume_analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("jobs.id", ondelete="SET NULL"),
        nullable=True,
    )
    resume_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    ats_score: Mapped[int] = mapped_column(Integer, nullable=False)
    role_target: Mapped[str | None] = mapped_column(String(150), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_skills: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    soft_skills: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    missing_skills: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    strengths: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    weaknesses: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    improvement_suggestions: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    raw_text_snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class SkillRoadmap(Base):
    __tablename__ = "skill_roadmaps"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    target_role: Mapped[str] = mapped_column(String(150), nullable=False)
    current_skills: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    missing_skills: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    roadmap_steps: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list of milestones
    recommended_projects: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list of project specs
    progress_percentage: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
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


class Interview(Base):
    __tablename__ = "interviews"

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
    recruiter_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    application_id: Mapped[int | None] = mapped_column(
        ForeignKey("applications.id", ondelete="SET NULL"),
        nullable=True,
    )
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=45, nullable=False)
    meeting_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    round_type: Mapped[str] = mapped_column(String(100), default="Technical Round", nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="scheduled", nullable=False)  # scheduled, completed, cancelled, rescheduled
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
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


class MockInterviewSession(Base):
    __tablename__ = "mock_interview_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    role_target: Mapped[str] = mapped_column(String(150), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)  # Python, SQL, Java, AWS, AI/ML, React, HR
    total_questions: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    completed_questions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    overall_score: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    feedback_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class MockInterviewExchange(Base):
    __tablename__ = "mock_interview_exchanges"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("mock_interview_sessions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(50), default="Fresher", nullable=False)
    user_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0 to 10
    ideal_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    communication_tips: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user, assistant, system
    agent_type: Mapped[str | None] = mapped_column(String(50), default="general")  # resume, job, career, interview, application, general
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from accounts.models import User, UserRole
from ai.models import Interview, ResumeAnalysis
from ai.schemas import AdminAnalyticsResponse
from applications.models import Application
from config.database import get_db
from jobs.enums import JobStatus
from jobs.models import Job

router = APIRouter(prefix="/admin-analytics", tags=["Admin Analytics"])


@router.get("/stats", response_model=AdminAnalyticsResponse)
def get_platform_analytics(
    db: Session = Depends(get_db),
) -> AdminAnalyticsResponse:
    total_users = db.scalar(select(func.count()).select_from(User)) or 0
    candidates_count = db.scalar(
        select(func.count()).select_from(User).where(User.role == UserRole.CANDIDATE)
    ) or 0
    recruiters_count = db.scalar(
        select(func.count()).select_from(User).where(User.role == UserRole.RECRUITER)
    ) or 0

    total_jobs = db.scalar(select(func.count()).select_from(Job)) or 0
    active_jobs = db.scalar(
        select(func.count()).select_from(Job).where(Job.status == JobStatus.OPEN)
    ) or 0
    external_jobs = db.scalar(
        select(func.count()).select_from(Job).where(Job.is_external == True)
    ) or 0

    total_applications = db.scalar(select(func.count()).select_from(Application)) or 0

    # Applications grouped by status
    status_counts = db.execute(
        select(Application.status, func.count(Application.id))
        .group_by(Application.status)
    ).all()
    apps_by_status = {
        (s.value if hasattr(s, "value") else str(s)): count
        for s, count in status_counts
    }

    total_interviews = db.scalar(select(func.count()).select_from(Interview)) or 0
    total_resumes = db.scalar(select(func.count()).select_from(ResumeAnalysis)) or 0

    return AdminAnalyticsResponse(
        total_users=total_users,
        candidates_count=candidates_count,
        recruiters_count=recruiters_count,
        total_jobs=total_jobs,
        active_jobs=active_jobs,
        external_jobs=external_jobs,
        total_applications=total_applications,
        applications_by_status=apps_by_status,
        total_interviews_scheduled=total_interviews,
        total_resumes_analyzed=total_resumes,
    )

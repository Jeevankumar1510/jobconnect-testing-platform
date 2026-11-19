from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from accounts.dependencies import get_current_user
from accounts.models import CandidateProfile, Notification, User, UserRole
from ai.models import Interview
from ai.schemas import InterviewResponse, InterviewScheduleRequest, InterviewUpdateRequest
from applications.enums import ApplicationStatus
from applications.models import Application
from config.database import get_db
from jobs.models import Job

router = APIRouter(prefix="/interviews", tags=["Interviews"])


@router.post("/schedule", response_model=InterviewResponse, status_code=status.HTTP_201_CREATED)
def schedule_interview(
    payload: InterviewScheduleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InterviewResponse:
    if current_user.role != UserRole.RECRUITER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters can schedule interviews",
        )

    job = db.get(Job, payload.job_id)
    if not job or job.recruiter_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only schedule interviews for your own job postings",
        )

    candidate = db.get(User, payload.candidate_id)
    if not candidate or candidate.role != UserRole.CANDIDATE:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    # Optional application check & advance status to INTERVIEW if applicable
    if payload.application_id:
        app = db.get(Application, payload.application_id)
        if app and app.job_id == job.id and app.candidate_id == candidate.id:
            app.status = ApplicationStatus.INTERVIEW
            db.commit()

    interview = Interview(
        job_id=job.id,
        candidate_id=candidate.id,
        recruiter_id=current_user.id,
        application_id=payload.application_id,
        scheduled_at=payload.scheduled_at,
        duration_minutes=payload.duration_minutes,
        meeting_link=payload.meeting_link,
        round_type=payload.round_type,
        status="scheduled",
        notes=payload.notes,
    )
    db.add(interview)

    # Create candidate notification
    notification = Notification(
        user_id=candidate.id,
        job_id=job.id,
        notification_type="interview_scheduled",
        title=f"Interview Scheduled: {job.title}",
        message=f"{job.company} has scheduled an interview ({payload.round_type}) on {payload.scheduled_at.strftime('%b %d, %Y at %I:%M %p')}.",
    )
    db.add(notification)
    db.commit()
    db.refresh(interview)

    cand_profile = db.scalar(select(CandidateProfile).where(CandidateProfile.user_id == candidate.id))

    return InterviewResponse(
        id=interview.id,
        job_id=interview.job_id,
        candidate_id=interview.candidate_id,
        recruiter_id=interview.recruiter_id,
        application_id=interview.application_id,
        job_title=job.title,
        company=job.company,
        candidate_name=cand_profile.full_name if cand_profile else candidate.email.split("@")[0],
        candidate_email=candidate.email,
        scheduled_at=interview.scheduled_at,
        duration_minutes=interview.duration_minutes,
        meeting_link=interview.meeting_link,
        round_type=interview.round_type,
        status=interview.status,
        notes=interview.notes,
        feedback=interview.feedback,
        created_at=interview.created_at,
    )


@router.get("/mine", response_model=list[InterviewResponse])
def list_my_interviews(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[InterviewResponse]:
    if current_user.role == UserRole.RECRUITER:
        stmt = select(Interview).where(Interview.recruiter_id == current_user.id)
    else:
        stmt = select(Interview).where(Interview.candidate_id == current_user.id)

    interviews = db.scalars(stmt.order_by(Interview.scheduled_at.asc())).all()

    results: list[InterviewResponse] = []
    for iv in interviews:
        job = db.get(Job, iv.job_id)
        candidate = db.get(User, iv.candidate_id)
        cand_profile = db.scalar(select(CandidateProfile).where(CandidateProfile.user_id == iv.candidate_id)) if candidate else None

        results.append(
            InterviewResponse(
                id=iv.id,
                job_id=iv.job_id,
                candidate_id=iv.candidate_id,
                recruiter_id=iv.recruiter_id,
                application_id=iv.application_id,
                job_title=job.title if job else "Software Engineer",
                company=job.company if job else "Company",
                candidate_name=cand_profile.full_name if cand_profile and cand_profile.full_name else (candidate.email.split("@")[0] if candidate else "Candidate"),
                candidate_email=candidate.email if candidate else "",
                scheduled_at=iv.scheduled_at,
                duration_minutes=iv.duration_minutes,
                meeting_link=iv.meeting_link,
                round_type=iv.round_type,
                status=iv.status,
                notes=iv.notes,
                feedback=iv.feedback,
                created_at=iv.created_at,
            )
        )
    return results


@router.patch("/{interview_id}", response_model=InterviewResponse)
def update_interview(
    interview_id: int,
    payload: InterviewUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InterviewResponse:
    interview = db.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    is_recruiter = current_user.role == UserRole.RECRUITER and interview.recruiter_id == current_user.id
    is_candidate = current_user.role == UserRole.CANDIDATE and interview.candidate_id == current_user.id

    if not is_recruiter and not is_candidate:
        raise HTTPException(status_code=403, detail="Unauthorized to modify this interview")

    if payload.status:
        # Candidates can only mark cancelled
        if is_candidate and payload.status not in ["cancelled"]:
            raise HTTPException(status_code=403, detail="Candidates can only cancel scheduled interviews")
        interview.status = payload.status

    if is_recruiter:
        if payload.scheduled_at:
            interview.scheduled_at = payload.scheduled_at
        if payload.meeting_link is not None:
            interview.meeting_link = payload.meeting_link
        if payload.notes is not None:
            interview.notes = payload.notes
        if payload.feedback is not None:
            interview.feedback = payload.feedback

    db.commit()
    db.refresh(interview)

    job = db.get(Job, interview.job_id)
    candidate = db.get(User, interview.candidate_id)
    cand_profile = db.scalar(select(CandidateProfile).where(CandidateProfile.user_id == interview.candidate_id)) if candidate else None

    return InterviewResponse(
        id=interview.id,
        job_id=interview.job_id,
        candidate_id=interview.candidate_id,
        recruiter_id=interview.recruiter_id,
        application_id=interview.application_id,
        job_title=job.title if job else "",
        company=job.company if job else "",
        candidate_name=cand_profile.full_name if cand_profile else (candidate.email if candidate else ""),
        candidate_email=candidate.email if candidate else "",
        scheduled_at=interview.scheduled_at,
        duration_minutes=interview.duration_minutes,
        meeting_link=interview.meeting_link,
        round_type=interview.round_type,
        status=interview.status,
        notes=interview.notes,
        feedback=interview.feedback,
        created_at=interview.created_at,
    )

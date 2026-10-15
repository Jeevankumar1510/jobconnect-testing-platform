from io import BytesIO
from math import ceil
from pathlib import Path
from uuid import uuid4
from zipfile import BadZipFile, ZipFile

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from accounts.dependencies import get_current_user
from accounts.models import User, UserRole
from applications.enums import ApplicationStatus
from applications.models import Application
from applications.resume_validator import (
    ALLOWED_RESUME_TYPES,
    read_and_validate_resume,
)
from datetime import datetime, timezone

from applications.schemas import (
    ApplicationPage,
    ApplicationRead,
    ApplicationStatusUpdate,
    ExternalApplicationTrack,
)
from config.database import get_db
from config.settings import get_settings
from jobs.enums import JobStatus
from jobs.models import Job

router = APIRouter(prefix="/applications", tags=["applications"])

ALLOWED_STATUS_TRANSITIONS = {
    ApplicationStatus.INTERESTED: {
        ApplicationStatus.READY_TO_APPLY,
        ApplicationStatus.APPLIED,
        ApplicationStatus.WITHDRAWN,
    },
    ApplicationStatus.READY_TO_APPLY: {
        ApplicationStatus.APPLIED,
        ApplicationStatus.WITHDRAWN,
    },
    ApplicationStatus.SUBMITTED: {
        ApplicationStatus.REVIEWING,
        ApplicationStatus.ASSESSMENT,
        ApplicationStatus.INTERVIEW,
        ApplicationStatus.REJECTED,
        ApplicationStatus.ACCEPTED,
        ApplicationStatus.WITHDRAWN,
    },
    ApplicationStatus.APPLIED: {
        ApplicationStatus.REVIEWING,
        ApplicationStatus.ASSESSMENT,
        ApplicationStatus.INTERVIEW,
        ApplicationStatus.OFFER,
        ApplicationStatus.REJECTED,
        ApplicationStatus.ACCEPTED,
        ApplicationStatus.WITHDRAWN,
    },
    ApplicationStatus.REVIEWING: {
        ApplicationStatus.ASSESSMENT,
        ApplicationStatus.INTERVIEW,
        ApplicationStatus.OFFER,
        ApplicationStatus.REJECTED,
        ApplicationStatus.ACCEPTED,
        ApplicationStatus.WITHDRAWN,
    },
    ApplicationStatus.ASSESSMENT: {
        ApplicationStatus.INTERVIEW,
        ApplicationStatus.OFFER,
        ApplicationStatus.REJECTED,
        ApplicationStatus.ACCEPTED,
        ApplicationStatus.WITHDRAWN,
    },
    ApplicationStatus.INTERVIEW: {
        ApplicationStatus.OFFER,
        ApplicationStatus.REJECTED,
        ApplicationStatus.ACCEPTED,
        ApplicationStatus.WITHDRAWN,
    },
    ApplicationStatus.OFFER: {
        ApplicationStatus.ACCEPTED,
        ApplicationStatus.REJECTED,
        ApplicationStatus.WITHDRAWN,
    },
    ApplicationStatus.REJECTED: set(),
    ApplicationStatus.ACCEPTED: set(),
    ApplicationStatus.WITHDRAWN: set(),
}


def require_role(user: User, role: UserRole) -> None:
    if user.role != role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{role.value.capitalize()} access is required",
        )


def get_application(application_id: int, db: Session) -> Application:
    application = db.get(Application, application_id)
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found",
        )
    return application


def get_application_job(application: Application, db: Session) -> Job:
    job = db.get(Job, application.job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    return job


def authorize_application_view(
    application: Application,
    job: Job,
    user: User,
) -> None:
    if user.role == UserRole.CANDIDATE and application.candidate_id == user.id:
        return
    if user.role == UserRole.RECRUITER and job.recruiter_id == user.id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You are not allowed to view this application",
    )


@router.post(
    "",
    response_model=ApplicationRead,
    status_code=status.HTTP_201_CREATED,
)
async def apply_for_job(
    job_id: int = Form(..., gt=0),
    cover_letter: str | None = Form(default=None, max_length=5000),
    resume: UploadFile | None = File(default=None),
    use_saved_resume: bool = Form(default=False),
    save_as_profile_resume: bool = Form(default=False),
    candidate: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApplicationRead:
    require_role(candidate, UserRole.CANDIDATE)
    job = db.get(Job, job_id)
    if job is None or job.status != JobStatus.OPEN:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Open job not found",
        )

    existing = db.scalar(
        select(Application).where(
            Application.job_id == job_id,
            Application.candidate_id == candidate.id,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already applied for this job",
        )

    # Determine whether using uploaded resume or saved profile resume
    content: bytes
    filename: str
    content_type: str

    if use_saved_resume or (resume is None and candidate.resume_storage_key):
        if not candidate.resume_storage_key:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="No saved resume found on your profile. Please upload a resume file.",
            )
        saved_path = get_settings().resume_storage_dir / candidate.resume_storage_key
        if not saved_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Saved profile resume file not found on disk. Please upload a new resume.",
            )
        content = saved_path.read_bytes()
        filename = candidate.resume_filename or "saved_resume.pdf"
        content_type = candidate.resume_content_type or "application/pdf"
    elif resume is not None:
        content, filename, content_type = await read_and_validate_resume(resume)
        if save_as_profile_resume or not candidate.resume_storage_key:
            # Also save to candidate's profile
            profile_key = f"{uuid4()}{Path(filename).suffix.lower()}"
            profile_path = get_settings().resume_storage_dir / profile_key
            profile_path.parent.mkdir(parents=True, exist_ok=True)
            profile_path.write_bytes(content)
            if candidate.resume_storage_key:
                (get_settings().resume_storage_dir / candidate.resume_storage_key).unlink(missing_ok=True)
            candidate.resume_storage_key = profile_key
            candidate.resume_filename = filename
            candidate.resume_content_type = content_type
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Resume file is required. Please upload a PDF or DOCX resume, or save one to your profile.",
        )

    storage_key = f"{uuid4()}{Path(filename).suffix.lower()}"
    resume_path = get_settings().resume_storage_dir / storage_key
    resume_path.parent.mkdir(parents=True, exist_ok=True)
    resume_path.write_bytes(content)

    application = Application(
        job_id=job_id,
        candidate_id=candidate.id,
        cover_letter=cover_letter,
        resume_storage_key=storage_key,
        resume_filename=filename,
        resume_content_type=content_type,
    )
    db.add(application)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        resume_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already applied for this job",
        ) from None
    except SQLAlchemyError:
        db.rollback()
        resume_path.unlink(missing_ok=True)
        raise
    db.refresh(application)

    app_read = ApplicationRead.model_validate(application)
    app_read.job_title = job.title
    app_read.company = job.company
    app_read.external_url = job.external_url
    return app_read


@router.get("/mine", response_model=ApplicationPage)
def list_my_applications(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    candidate: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApplicationPage:
    require_role(candidate, UserRole.CANDIDATE)
    filters = [Application.candidate_id == candidate.id]
    total = db.scalar(
        select(func.count()).select_from(Application).where(*filters)
    ) or 0
    rows = db.execute(
        select(Application, Job.title, Job.company, Job.external_url)
        .outerjoin(Job, Application.job_id == Job.id)
        .where(*filters)
        .order_by(Application.created_at.desc(), Application.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    items: list[ApplicationRead] = []
    for app, job_title, company, external_url in rows:
        app_read = ApplicationRead.model_validate(app)
        app_read.job_title = job_title
        app_read.company = company
        app_read.external_url = external_url
        items.append(app_read)

    return ApplicationPage(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=ceil(total / page_size),
    )


@router.get("/jobs/{job_id}", response_model=ApplicationPage)
def list_job_applications(
    job_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    recruiter: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApplicationPage:
    require_role(recruiter, UserRole.RECRUITER)
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    if job.recruiter_id != recruiter.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view applications for your own jobs",
        )

    filters = [Application.job_id == job_id]
    total = db.scalar(
        select(func.count()).select_from(Application).where(*filters)
    ) or 0
    items = db.scalars(
        select(Application)
        .where(*filters)
        .order_by(Application.created_at.desc(), Application.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return ApplicationPage(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=ceil(total / page_size),
    )


@router.get("/{application_id}/resume")
def download_resume(
    application_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    application = get_application(application_id, db)
    job = get_application_job(application, db)
    authorize_application_view(application, job, user)
    resume_path = get_settings().resume_storage_dir / application.resume_storage_key
    if not resume_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume file not found",
        )
    return FileResponse(
        resume_path,
        media_type=application.resume_content_type,
        filename=application.resume_filename,
    )


@router.get("/{application_id}", response_model=ApplicationRead)
def get_application_details(
    application_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApplicationRead:
    application = get_application(application_id, db)
    job = get_application_job(application, db)
    authorize_application_view(application, job, user)
    app_read = ApplicationRead.model_validate(application)
    app_read.job_title = job.title
    app_read.company = job.company
    app_read.external_url = job.external_url
    return app_read


@router.post("/track-external", response_model=ApplicationRead)
def track_external_application(
    track_data: ExternalApplicationTrack,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApplicationRead:
    require_role(current_user, UserRole.CANDIDATE)
    job = db.get(Job, track_data.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    existing = db.scalar(
        select(Application).where(
            Application.job_id == job.id,
            Application.candidate_id == current_user.id,
        )
    )
    now = datetime.now(timezone.utc)
    target_status = track_data.status or ApplicationStatus.APPLIED
    if existing:
        existing.status = target_status
        existing.applied_at = now
        if track_data.notes:
            existing.notes = track_data.notes
        if track_data.external_url:
            existing.external_application_url = track_data.external_url
        db.commit()
        db.refresh(existing)
        read = ApplicationRead.model_validate(existing)
        read.job_title = job.title
        read.company = job.company
        read.external_url = job.external_url
        return read

    app = Application(
        job_id=job.id,
        candidate_id=current_user.id,
        status=target_status,
        notes=track_data.notes,
        external_application_url=track_data.external_url or job.external_url,
        applied_at=now,
    )
    db.add(app)
    db.commit()
    db.refresh(app)
    read = ApplicationRead.model_validate(app)
    read.job_title = job.title
    read.company = job.company
    read.external_url = job.external_url
    return read


@router.patch("/{application_id}/status", response_model=ApplicationRead)
def update_application_status(
    application_id: int,
    status_update: ApplicationStatusUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApplicationRead:
    application = get_application(application_id, db)
    job = get_application_job(application, db)

    is_recruiter_owner = (user.role == UserRole.RECRUITER and job.recruiter_id == user.id)
    is_candidate_owner = (user.role == UserRole.CANDIDATE and application.candidate_id == user.id)

    if user.role == UserRole.CANDIDATE:
        if not is_candidate_owner or status_update.status in {ApplicationStatus.REVIEWING, ApplicationStatus.ACCEPTED}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Candidates cannot advance application to reviewing or accepted status",
            )
    elif not is_recruiter_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to update this application",
        )

    if status_update.status not in ALLOWED_STATUS_TRANSITIONS.get(application.status, set()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot change application status from {application.status.value} to {status_update.status.value}",
        )

    application.status = status_update.status
    if status_update.notes is not None:
        application.notes = status_update.notes
    db.commit()
    db.refresh(application)
    read = ApplicationRead.model_validate(application)
    read.job_title = job.title
    read.company = job.company
    read.external_url = job.external_url
    return read


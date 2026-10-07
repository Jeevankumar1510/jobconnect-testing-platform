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
from applications.schemas import (
    ApplicationPage,
    ApplicationRead,
    ApplicationStatusUpdate,
)
from config.database import get_db
from config.settings import get_settings
from jobs.enums import JobStatus
from jobs.models import Job

router = APIRouter(prefix="/applications", tags=["applications"])

ALLOWED_RESUME_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
ALLOWED_STATUS_TRANSITIONS = {
    ApplicationStatus.SUBMITTED: {
        ApplicationStatus.REVIEWING,
        ApplicationStatus.REJECTED,
    },
    ApplicationStatus.REVIEWING: {
        ApplicationStatus.INTERVIEW,
        ApplicationStatus.REJECTED,
        ApplicationStatus.ACCEPTED,
    },
    ApplicationStatus.INTERVIEW: {
        ApplicationStatus.REJECTED,
        ApplicationStatus.ACCEPTED,
    },
    ApplicationStatus.REJECTED: set(),
    ApplicationStatus.ACCEPTED: set(),
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


async def read_and_validate_resume(resume: UploadFile) -> tuple[bytes, str, str]:
    filename = Path(resume.filename or "").name
    extension = Path(filename).suffix.lower()
    content_type = ALLOWED_RESUME_TYPES.get(extension)
    if content_type is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Resume must be a PDF or DOCX file",
        )

    max_size = get_settings().max_resume_size_bytes
    content = await resume.read(max_size + 1)
    if len(content) > max_size:
        limit_mib = max_size / (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Resume exceeds the {limit_mib:g} MiB upload limit",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Resume file cannot be empty",
        )

    if extension == ".pdf":
        valid_content = content.startswith(b"%PDF-")
    else:
        try:
            with ZipFile(BytesIO(content)) as archive:
                valid_content = {
                    "[Content_Types].xml",
                    "word/document.xml",
                }.issubset(archive.namelist())
        except BadZipFile:
            valid_content = False

    if not valid_content:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="File content does not match a valid PDF or DOCX resume",
        )
    return content, filename[:255], content_type


@router.post(
    "",
    response_model=ApplicationRead,
    status_code=status.HTTP_201_CREATED,
)
async def apply_for_job(
    job_id: int = Form(..., gt=0),
    cover_letter: str | None = Form(default=None, max_length=5000),
    resume: UploadFile = File(...),
    candidate: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Application:
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

    content, filename, content_type = await read_and_validate_resume(resume)
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
    return application


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
) -> Application:
    application = get_application(application_id, db)
    job = get_application_job(application, db)
    authorize_application_view(application, job, user)
    return application


@router.patch("/{application_id}/status", response_model=ApplicationRead)
def update_application_status(
    application_id: int,
    status_update: ApplicationStatusUpdate,
    recruiter: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Application:
    require_role(recruiter, UserRole.RECRUITER)
    application = get_application(application_id, db)
    job = get_application_job(application, db)
    if job.recruiter_id != recruiter.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update applications for your own jobs",
        )
    if status_update.status not in ALLOWED_STATUS_TRANSITIONS[application.status]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot change application status from {application.status.value} to {status_update.status.value}",
        )

    application.status = status_update.status
    db.commit()
    db.refresh(application)
    return application

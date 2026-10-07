from math import ceil
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from accounts.dependencies import get_current_user
from accounts.models import User, UserRole
from applications.models import Application
from config.database import get_db
from config.settings import get_settings
from jobs.enums import EmploymentType, JobStatus
from jobs.models import Job
from jobs.schemas import JobCreate, JobPage, JobRead, JobUpdate

router = APIRouter(prefix="/jobs", tags=["jobs"])


def get_current_recruiter(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != UserRole.RECRUITER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Recruiter access is required",
        )
    return current_user


def get_owned_job(job_id: int, recruiter_id: int, db: Session) -> Job:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    if job.recruiter_id != recruiter_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage your own job postings",
        )
    return job


@router.post(
    "",
    response_model=JobRead,
    status_code=status.HTTP_201_CREATED,
)
def create_job(
    job_data: JobCreate,
    recruiter: User = Depends(get_current_recruiter),
    db: Session = Depends(get_db),
) -> Job:
    job = Job(**job_data.model_dump(), recruiter_id=recruiter.id)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("/mine", response_model=JobPage)
def list_my_jobs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    recruiter: User = Depends(get_current_recruiter),
    db: Session = Depends(get_db),
) -> JobPage:
    filters = [Job.recruiter_id == recruiter.id]
    total = db.scalar(
        select(func.count()).select_from(Job).where(*filters)
    ) or 0
    items = db.scalars(
        select(Job)
        .where(*filters)
        .order_by(Job.created_at.desc(), Job.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return JobPage(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=ceil(total / page_size),
    )


@router.get("", response_model=JobPage)
def search_jobs(
    q: str | None = Query(default=None, max_length=100),
    location: str | None = Query(default=None, max_length=150),
    employment_type: EmploymentType | None = None,
    salary_min: Decimal | None = Query(default=None, ge=0),
    salary_max: Decimal | None = Query(default=None, ge=0),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> JobPage:
    if salary_min is not None and salary_max is not None and salary_min > salary_max:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="salary_min must not exceed salary_max",
        )

    filters = [Job.status == JobStatus.OPEN]
    if q:
        search_pattern = f"%{q}%"
        filters.append(
            or_(
                Job.title.ilike(search_pattern),
                Job.company.ilike(search_pattern),
                Job.description.ilike(search_pattern),
            )
        )
    if location:
        filters.append(Job.location.ilike(f"%{location}%"))
    if employment_type is not None:
        filters.append(Job.employment_type == employment_type)
    if salary_min is not None:
        filters.append(Job.salary_max >= salary_min)
    if salary_max is not None:
        filters.append(
            or_(Job.salary_min.is_(None), Job.salary_min <= salary_max)
        )

    total = db.scalar(select(func.count()).select_from(Job).where(*filters)) or 0
    items = db.scalars(
        select(Job)
        .where(*filters)
        .order_by(Job.created_at.desc(), Job.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return JobPage(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=ceil(total / page_size),
    )


@router.get("/{job_id}", response_model=JobRead)
def get_job(job_id: int, db: Session = Depends(get_db)) -> Job:
    job = db.get(Job, job_id)
    if job is None or job.status != JobStatus.OPEN:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    return job


@router.patch("/{job_id}", response_model=JobRead)
def update_job(
    job_id: int,
    job_data: JobUpdate,
    recruiter: User = Depends(get_current_recruiter),
    db: Session = Depends(get_db),
) -> Job:
    job = get_owned_job(job_id, recruiter.id, db)
    updates = job_data.model_dump(exclude_unset=True)
    salary_min = updates.get("salary_min", job.salary_min)
    salary_max = updates.get("salary_max", job.salary_max)
    if (
        salary_min is not None
        and salary_max is not None
        and salary_min > salary_max
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="salary_min must not exceed salary_max",
        )

    for field, value in updates.items():
        setattr(job, field, value)
    db.commit()
    db.refresh(job)
    return job


@router.delete(
    "/{job_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_job(
    job_id: int,
    recruiter: User = Depends(get_current_recruiter),
    db: Session = Depends(get_db),
) -> Response:
    job = get_owned_job(job_id, recruiter.id, db)
    resume_storage_keys = db.scalars(
        select(Application.resume_storage_key).where(Application.job_id == job.id)
    ).all()
    db.delete(job)
    db.commit()
    resume_dir = get_settings().resume_storage_dir
    for storage_key in resume_storage_keys:
        (resume_dir / storage_key).unlink(missing_ok=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

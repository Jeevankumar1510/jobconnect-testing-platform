import os
from math import ceil
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
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
from jobs.services.external_jobs import (
    is_india_location,
    is_it_tech_job,
    sync_external_postings,
)

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
    disqualifiers = ["senior", "sr.", "lead", "principal", "director", "architect", "chief"]
    if any(d in job_data.title.lower() for d in disqualifiers):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="JobConnect is dedicated to Freshers and Entry-Level talent. Please post an entry-level or junior role.",
        )
    is_it, domain = is_it_tech_job(job_data.title, job_data.description)
    if not is_it:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="JobConnect is strictly dedicated to IT & Tech roles (e.g. Software, Web, Data/AI, QA, Cloud/DevOps, Cyber Security).",
        )
    is_india, norm_loc = is_india_location(job_data.location)
    if not is_india:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="JobConnect supports India locations only (e.g. Bengaluru, Hyderabad, Pune, Chennai, Delhi NCR, Mumbai, Remote - India).",
        )
    data = job_data.model_dump()
    data["location"] = norm_loc
    data["is_fresher"] = True
    job = Job(**data, recruiter_id=recruiter.id)
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


@router.post("/sync-external")
def trigger_external_sync(
    limit: int = Query(default=100, ge=5, le=200),
    purge_placeholders: bool = Query(default=True),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    stats = sync_external_postings(db, limit_per_source=limit, purge_placeholders=purge_placeholders)
    total_jobs = db.scalar(select(func.count()).select_from(Job).where(Job.status == JobStatus.OPEN)) or 0
    return {
        "status": "success",
        "imported": stats["imported"],
        "updated": stats["updated"],
        "sources": stats.get("sources", {}),
        "total_active_jobs": total_jobs,
    }


@router.get("", response_model=JobPage)
def search_jobs(
    q: str | None = Query(default=None, max_length=100),
    location: str | None = Query(default=None, max_length=150),
    employment_type: EmploymentType | None = None,
    experience_level: str | None = Query(default=None, max_length=50),
    is_fresher: bool | None = None,
    domain: str | None = Query(default=None, max_length=50),
    company_type: str | None = Query(default=None, max_length=50),
    work_mode: str | None = Query(default=None, max_length=50),
    salary_min: Decimal | None = Query(default=None, ge=0),
    salary_max: Decimal | None = Query(default=None, ge=0),
    source: str | None = Query(default=None, max_length=50),
    auto_sync: bool = Query(default=True),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
) -> JobPage:
    if salary_min is not None and salary_max is not None and salary_min > salary_max:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="salary_min must not exceed salary_max",
        )

    # Auto-populate live jobs if no external postings exist
    total_external = db.scalar(select(func.count()).select_from(Job).where(Job.is_external == True)) or 0
    if total_external == 0 and auto_sync and not q and not location:
        try:
            sync_external_postings(db, limit_per_source=50, purge_placeholders=True)
        except Exception:
            pass

    filters = [Job.status == JobStatus.OPEN]
    if is_fresher is not None:
        filters.append(Job.is_fresher.is_(is_fresher))
    if experience_level:
        exp_clean = experience_level.strip().lower()
        if exp_clean != "all":
            filters.append(Job.experience_level.ilike(f"%{exp_clean}%"))
    if domain:
        d_clean = domain.strip().lower()
        if d_clean in ["software", "fullstack", "full_stack"]:
            filters.append(
                or_(
                    Job.title.ilike("%developer%"),
                    Job.title.ilike("%engineer%"),
                    Job.title.ilike("%software%"),
                    Job.title.ilike("%full stack%"),
                    Job.title.ilike("%fullstack%"),
                )
            )
        elif d_clean in ["python", "backend", "python_backend"]:
            filters.append(
                or_(
                    Job.title.ilike("%python%"),
                    Job.title.ilike("%backend%"),
                    Job.title.ilike("%django%"),
                    Job.title.ilike("%fastapi%"),
                    Job.title.ilike("%golang%"),
                    Job.title.ilike("%java%"),
                    Job.title.ilike("%node%"),
                )
            )
        elif d_clean in ["frontend", "react", "frontend_react"]:
            filters.append(
                or_(
                    Job.title.ilike("%react%"),
                    Job.title.ilike("%frontend%"),
                    Job.title.ilike("%front-end%"),
                    Job.title.ilike("%next%"),
                    Job.title.ilike("%angular%"),
                    Job.title.ilike("%vue%"),
                    Job.title.ilike("%web%"),
                )
            )
        elif d_clean in ["data", "ai", "data_ai", "ml"]:
            filters.append(
                or_(
                    Job.title.ilike("%data%"),
                    Job.title.ilike("%ai%"),
                    Job.title.ilike("%ml%"),
                    Job.title.ilike("%machine learning%"),
                    Job.title.ilike("%analyst%"),
                    Job.title.ilike("%analytics%"),
                    Job.title.ilike("%power bi%"),
                )
            )
        elif d_clean in ["qa", "testing", "qa_testing"]:
            filters.append(
                or_(
                    Job.title.ilike("%qa%"),
                    Job.title.ilike("%test%"),
                    Job.title.ilike("%sdet%"),
                    Job.title.ilike("%automation%"),
                    Job.title.ilike("%quality%"),
                )
            )
        elif d_clean in ["cloud", "devops", "cloud_devops"]:
            filters.append(
                or_(
                    Job.title.ilike("%cloud%"),
                    Job.title.ilike("%devops%"),
                    Job.title.ilike("%sre%"),
                    Job.title.ilike("%systems%"),
                    Job.title.ilike("%sysadmin%"),
                    Job.title.ilike("%infrastructure%"),
                )
            )
        elif d_clean in ["cyber", "security", "cyber_security"]:
            filters.append(
                or_(
                    Job.title.ilike("%cyber%"),
                    Job.title.ilike("%security%"),
                    Job.title.ilike("%infosec%"),
                    Job.title.ilike("%soc%"),
                )
            )
    if work_mode:
        wm_clean = work_mode.strip().lower()
        if wm_clean == "remote":
            filters.append(Job.location.ilike("%remote%"))
        elif wm_clean in ["onsite", "on-site"]:
            filters.append(~Job.location.ilike("%remote%"))
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
    if company_type:
        ct_clean = company_type.strip().lower()
        if ct_clean == "startup":
            startup_names = [
                "zepto", "meesho", "blinkit", "cred", "razorpay", "groww", "slice", "invideo",
                "jupiter", "postman", "jar", "urban company", "hasura", "plum", "khatabook",
                "clevertap", "ather", "apna", "browserstack", "swiggy", "zomato", "zerodha",
                "paytm", "physicswallah", "unacademy", "classplus", "cult.fit"
            ]
            startup_filters = [Job.company.ilike(f"%{s}%") for s in startup_names]
            startup_filters.extend([
                Job.source.ilike("%remoteok%"),
                Job.source.ilike("%weworkremotely%"),
                Job.source.ilike("%remotive%"),
                Job.source.ilike("%jobicy%"),
            ])
            filters.append(or_(*startup_filters))
        elif ct_clean in ["enterprise", "giant", "mnc"]:
            enterprise_names = [
                "tcs", "tata consultancy", "infosys", "wipro", "capgemini", "persistent",
                "thoughtworks", "accenture", "cisco", "dell", "amazon", "ltimindtree",
                "hcl", "cognizant"
            ]
            filters.append(or_(*[Job.company.ilike(f"%{e}%") for e in enterprise_names]))
    if source:
        source_clean = source.strip().lower()
        if source_clean == "external":
            filters.append(Job.is_external.is_(True))
        elif source_clean == "internal":
            filters.append(Job.is_external.is_(False))
        else:
            filters.append(Job.source.ilike(f"%{source}%"))

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


@router.get("/cron-sync", operation_id="cron_sync_jobs_get")
@router.post("/cron-sync", operation_id="cron_sync_jobs_post")
def cron_sync_jobs(
    secret: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Automated endpoint for daily scheduled cron syncs.
    Can be called by Render Cron, GitHub Actions, cron-job.org, or external pingers.
    Keeps Render free-tier warm and pulls new fresher & startup IT jobs daily.
    """
    configured_secret = os.environ.get("CRON_SECRET")
    if configured_secret:
        provided = secret or x_cron_secret
        if not provided and authorization and authorization.startswith("Bearer "):
            provided = authorization.replace("Bearer ", "").strip()
        if provided != configured_secret:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing cron secret.",
            )

    result = sync_external_postings(db, limit_per_source=30, purge_placeholders=False)
    return {
        "status": "success",
        "message": f"Daily sync completed: {result['imported']} imported, {result['updated']} updated.",
        "imported": result["imported"],
        "updated": result["updated"],
        "sources": result.get("sources", {}),
    }


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


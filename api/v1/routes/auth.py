from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from accounts.dependencies import get_current_user
from accounts.models import CandidateProfile, Notification, User, UserRole
from accounts.schemas import (
    CandidateProfileRead,
    CandidateProfileUpdate,
    NotificationRead,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserRead,
)
from accounts.security import create_access_token, hash_password, verify_password
from applications.resume_validator import read_and_validate_resume
from config.database import get_db
from config.settings import get_settings

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
def register(user_data: UserCreate, db: Session = Depends(get_db)) -> User:
    email = str(user_data.email).lower()
    existing_user = db.scalar(select(User).where(User.email == email))
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        email=email,
        hashed_password=hash_password(user_data.password),
        role=UserRole(user_data.role.value),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        ) from None
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(credentials: UserLogin, db: Session = Depends(get_db)) -> TokenResponse:
    email = str(credentials.email).lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(
        credentials.password,
        user.hashed_password,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserRead)
def get_profile(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user


@router.post("/me/resume", response_model=UserRead)
async def upload_candidate_resume(
    resume: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if current_user.role != UserRole.CANDIDATE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only candidates can save a profile resume",
        )

    content, filename, content_type = await read_and_validate_resume(resume)
    storage_key = f"{uuid4()}{Path(filename).suffix.lower()}"
    resume_path = get_settings().resume_storage_dir / storage_key
    resume_path.parent.mkdir(parents=True, exist_ok=True)
    resume_path.write_bytes(content)

    if current_user.resume_storage_key:
        old_path = get_settings().resume_storage_dir / current_user.resume_storage_key
        old_path.unlink(missing_ok=True)

    current_user.resume_storage_key = storage_key
    current_user.resume_filename = filename
    current_user.resume_content_type = content_type
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/me/resume")
def download_my_resume(
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    if not current_user.resume_storage_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No resume saved on your profile",
        )
    resume_path = get_settings().resume_storage_dir / current_user.resume_storage_key
    if not resume_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved resume file not found on disk",
        )
    return FileResponse(
        resume_path,
        media_type=current_user.resume_content_type or "application/octet-stream",
        filename=current_user.resume_filename or "resume.pdf",
    )


@router.delete("/me/resume", response_model=UserRead)
def delete_my_resume(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if current_user.resume_storage_key:
        old_path = get_settings().resume_storage_dir / current_user.resume_storage_key
        old_path.unlink(missing_ok=True)
    current_user.resume_storage_key = None
    current_user.resume_filename = None
    current_user.resume_content_type = None
    db.commit()
    db.refresh(current_user)
    return current_user


def compute_profile_completeness(profile: CandidateProfile) -> int:
    score = 0
    if profile.full_name and profile.full_name.strip():
        score += 15
    if profile.phone and profile.phone.strip():
        score += 10
    if profile.current_location and profile.current_location.strip():
        score += 10
    if profile.preferred_locations and profile.preferred_locations.strip():
        score += 10
    if profile.preferred_job_titles and profile.preferred_job_titles.strip():
        score += 10
    if profile.technical_skills and profile.technical_skills.strip():
        score += 15
    if profile.education and profile.education.strip():
        score += 10
    if profile.experience_level and profile.experience_level.strip():
        score += 10
    if (
        (profile.projects and profile.projects.strip())
        or (profile.internship_experience and profile.internship_experience.strip())
        or (profile.certifications and profile.certifications.strip())
    ):
        score += 10
    return min(score, 100)


@router.get("/me/profile", response_model=CandidateProfileRead)
def get_candidate_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CandidateProfile:
    profile = db.scalar(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    if profile is None:
        profile = CandidateProfile(
            user_id=current_user.id,
            experience_level="fresher",
            profile_completion_percentage=0,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.put("/me/profile", response_model=CandidateProfileRead)
def update_candidate_profile(
    profile_data: CandidateProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CandidateProfile:
    profile = db.scalar(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    if profile is None:
        profile = CandidateProfile(user_id=current_user.id)
        db.add(profile)

    updates = profile_data.model_dump(exclude_unset=True)
    for field, val in updates.items():
        setattr(profile, field, val)

    profile.profile_completion_percentage = compute_profile_completeness(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.delete("/me/profile/field/{field_name}", response_model=CandidateProfileRead)
def clear_candidate_profile_field(
    field_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CandidateProfile:
    profile = db.scalar(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    allowed_fields = {
        "phone", "current_location", "preferred_locations", "preferred_job_titles",
        "technical_skills", "education", "experience_level", "internship_experience",
        "projects", "certifications", "preferred_industries", "employment_type_preferences",
        "work_mode_preferences", "expected_salary_min", "expected_salary_max"
    }
    if field_name not in allowed_fields:
        raise HTTPException(status_code=400, detail=f"Cannot clear field: {field_name}")

    setattr(profile, field_name, None)
    profile.profile_completion_percentage = compute_profile_completeness(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/me/notifications", response_model=list[NotificationRead])
def get_user_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Notification]:
    return db.scalars(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    ).all()


@router.post("/me/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    notif = db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    db.commit()
    return {"status": "ok"}


@router.post("/me/notifications/read-all")
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    notifications = db.scalars(
        select(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
    ).all()
    for n in notifications:
        n.is_read = True
    db.commit()
    return {"status": "ok", "updated": str(len(notifications))}


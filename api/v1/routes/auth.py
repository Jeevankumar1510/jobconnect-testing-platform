from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from accounts.dependencies import get_current_user
from accounts.models import User, UserRole
from accounts.schemas import TokenResponse, UserCreate, UserLogin, UserRead
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

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from accounts.dependencies import get_current_user
from accounts.models import User, UserRole
from accounts.schemas import TokenResponse, UserCreate, UserLogin, UserRead
from accounts.security import create_access_token, hash_password, verify_password
from config.database import get_db

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

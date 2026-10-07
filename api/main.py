from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from pathlib import Path

from fastapi import FastAPI
from starlette.staticfiles import StaticFiles

from adminpanel.asgi import application as django_application
from accounts.models import User
from api.v1.routes.auth import router as auth_router
from api.v1.routes.applications import router as applications_router
from api.v1.routes.health import router as health_router
from api.v1.routes.jobs import router as jobs_router
from config.database import engine


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    User.__table__.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="JobConnect API",
    description="REST API for the JobConnect job portal.",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(health_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")
app.include_router(applications_router, prefix="/api/v1")
app.mount(
    "/static",
    StaticFiles(directory=Path(__file__).resolve().parent.parent / "staticfiles", check_dir=False),
    name="static",
)
app.mount("/", django_application, name="django")

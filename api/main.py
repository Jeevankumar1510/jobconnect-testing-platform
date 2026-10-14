import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from sqlalchemy import text
from starlette.staticfiles import StaticFiles

from accounts.models import User
from adminpanel.asgi import application as django_application
from api.v1.routes.applications import router as applications_router
from api.v1.routes.auth import router as auth_router
from api.v1.routes.health import router as health_router
from api.v1.routes.jobs import router as jobs_router
from config.database import SessionLocal, engine
from jobs.services.external_jobs import sync_external_postings

logger = logging.getLogger("jobconnect.scheduler")


async def automated_daily_job_sync_worker() -> None:
    """
    Automated background worker running inside the FastAPI process.
    Waits 20 seconds after startup to ensure health checks pass,
    runs the daily job ingestion in a worker thread, and repeats every 24 hours.
    """
    await asyncio.sleep(20)
    while True:
        try:
            logger.info("Executing automated daily job sync in background...")

            def _sync():
                with SessionLocal() as db:
                    return sync_external_postings(db, limit_per_source=30, purge_placeholders=False)

            result = await asyncio.to_thread(_sync)
            logger.info(
                "Daily sync completed successfully: %s imported, %s updated.",
                result.get("imported"),
                result.get("updated"),
            )
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Automated daily job sync encountered error: %s", exc, exc_info=True)

        try:
            # 86,400 seconds = 24 hours
            await asyncio.sleep(86400)
        except asyncio.CancelledError:
            break


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    User.__table__.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for stmt in [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_storage_key VARCHAR(41);",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_filename VARCHAR(255);",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_content_type VARCHAR(100);",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS headline VARCHAR(200);",
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT FALSE NOT NULL;",
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS external_url VARCHAR(500);",
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_logo VARCHAR(500);",
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source VARCHAR(50);",
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS experience_level VARCHAR(50) DEFAULT 'fresher' NOT NULL;",
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_fresher BOOLEAN DEFAULT TRUE NOT NULL;",
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS external_id VARCHAR(100);",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_jobs_external_id ON jobs(external_id) WHERE external_id IS NOT NULL;",
        ]:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass

    sync_task = asyncio.create_task(automated_daily_job_sync_worker())
    try:
        yield
    finally:
        sync_task.cancel()
        try:
            await sync_task
        except asyncio.CancelledError:
            pass


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

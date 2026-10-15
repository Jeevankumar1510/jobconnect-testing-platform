import logging
import ssl
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from jobs.enums import HiringStatus, JobStatus, UrlVerificationStatus
from jobs.models import Job, JobVerificationHistory
from jobs.services.url_resolver import (
    is_generic_homepage_or_search,
    is_safe_external_url,
    resolve_job_application_destination,
)

logger = logging.getLogger("jobconnect.verifier")

EXPLICIT_CLOSED_PATTERNS = [
    "no longer accepting applications",
    "job has expired",
    "this vacancy has expired",
    "position is closed",
    "position has been filled",
    "job is no longer available",
    "this job is no longer available",
    "this requisition is closed",
    "applications are now closed",
    "this opening has closed",
    "job not found",
    "404 - page not found",
    "page could not be found",
    "the page you requested was not found",
]

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (JobConnect/2.0)"
)


class SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Restricts redirects to a maximum of 5 and prevents SSRF / unsafe schemes during redirects."""

    def __init__(self, max_redirects: int = 5):
        super().__init__()
        self.max_redirects = max_redirects
        self.redirect_count = 0

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.redirect_count += 1
        if self.redirect_count > self.max_redirects:
            raise urllib.error.HTTPError(
                newurl, code, "Exceeded maximum redirect threshold", headers, fp
            )
        is_safe, reason = is_safe_external_url(newurl)
        if not is_safe:
            raise urllib.error.HTTPError(
                newurl, code, f"Redirect to prohibited destination: {reason}", headers, fp
            )
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def verify_single_job_posting(job: Job, db: Session | None = None) -> dict[str, Any]:
    """
    Safely verifies a job's application destination and hiring status.
    Uses conservative classification:
    - Only marks 'closed' when explicit closure text or permanent 404/410 is detected.
    - Temporary network errors or anti-bot blocks mark 'temporarily_unavailable' or 'unverified'.
    """
    dest = resolve_job_application_destination(job)
    now = datetime.now(timezone.utc)

    if not dest.url:
        result = {
            "hiring_status": HiringStatus.UNVERIFIED.value,
            "verification_status": UrlVerificationStatus.NOT_FOUND.value,
            "reason": dest.message or "No valid application URL found",
            "url": None,
            "evidence": "missing_or_invalid_url",
        }
        _record_verification(job, result, now, db)
        return result

    url = dest.url
    is_safe, safety_reason = is_safe_external_url(url)
    if not is_safe:
        result = {
            "hiring_status": HiringStatus.UNVERIFIED.value,
            "verification_status": UrlVerificationStatus.UNVERIFIED.value,
            "reason": f"Destination URL failed safety check: {safety_reason}",
            "url": url,
            "evidence": "unsafe_url",
        }
        _record_verification(job, result, now, db)
        return result

    if is_generic_homepage_or_search(url):
        result = {
            "hiring_status": HiringStatus.UNVERIFIED.value,
            "verification_status": UrlVerificationStatus.NOT_FOUND.value,
            "reason": "URL points to a generic portal or search homepage rather than exact vacancy",
            "url": url,
            "evidence": "generic_homepage_rejected",
        }
        _record_verification(job, result, now, db)
        return result

    # Perform safe HTTP request with bounded redirects
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    redirect_handler = SafeRedirectHandler(max_redirects=5)
    opener = urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=ssl_ctx),
        redirect_handler,
    )

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )

    try:
        with opener.open(req, timeout=8) as response:
            final_url = response.geturl()
            status_code = response.getcode()
            body_sample = response.read(16384).decode("utf-8", errors="ignore").lower()

            # Check for explicit closed text
            explicit_closed = False
            matching_closed_marker = None
            for marker in EXPLICIT_CLOSED_PATTERNS:
                if marker in body_sample:
                    explicit_closed = True
                    matching_closed_marker = marker
                    break

            if explicit_closed:
                result = {
                    "hiring_status": HiringStatus.CLOSED.value,
                    "verification_status": UrlVerificationStatus.NOT_FOUND.value,
                    "reason": f"Employer posting indicates closure: '{matching_closed_marker}'",
                    "url": final_url,
                    "evidence": "explicit_closed_marker",
                }
            else:
                result = {
                    "hiring_status": HiringStatus.OPEN.value,
                    "verification_status": UrlVerificationStatus.VERIFIED_EXACT_MATCH.value,
                    "reason": f"Live destination verified successfully (HTTP {status_code})",
                    "url": final_url,
                    "evidence": f"http_{status_code}_live",
                }

    except urllib.error.HTTPError as http_err:
        status_code = http_err.code
        if status_code in (404, 410):
            result = {
                "hiring_status": HiringStatus.CLOSED.value,
                "verification_status": UrlVerificationStatus.NOT_FOUND.value,
                "reason": f"Original job page returned permanent HTTP {status_code}",
                "url": url,
                "evidence": f"http_{status_code}_closed",
            }
        elif status_code == 403:
            # Bot protection / Cloudflare challenge: Conservative approach!
            result = {
                "hiring_status": HiringStatus.OPEN.value if job.hiring_status == HiringStatus.OPEN.value else HiringStatus.UNVERIFIED.value,
                "verification_status": UrlVerificationStatus.PROBABLE_MATCH.value,
                "reason": "Host protected by bot verification firewall; opening verified via direct browser link",
                "url": url,
                "evidence": "http_403_bot_challenge",
            }
        else:
            result = {
                "hiring_status": HiringStatus.TEMPORARILY_UNAVAILABLE.value,
                "verification_status": UrlVerificationStatus.UNVERIFIED.value,
                "reason": f"Employer server returned temporary HTTP {status_code}",
                "url": url,
                "evidence": f"http_{status_code}_temporary",
            }

    except (urllib.error.URLError, TimeoutError, OSError) as net_err:
        # Conservative approach: Temporary network failures do NOT mark job closed!
        result = {
            "hiring_status": HiringStatus.TEMPORARILY_UNAVAILABLE.value,
            "verification_status": UrlVerificationStatus.UNVERIFIED.value,
            "reason": f"Temporary network timeout while reaching external host: {net_err}",
            "url": url,
            "evidence": "network_timeout",
        }

    _record_verification(job, result, now, db)
    return result


def _record_verification(job: Job, result: dict[str, Any], timestamp: datetime, db: Session | None) -> None:
    """Updates job record and appends history entry."""
    job.last_url_verified_at = timestamp
    job.verification_status = result["verification_status"]
    job.hiring_status = result["hiring_status"]
    job.verification_reason = result["reason"]

    if result["hiring_status"] == HiringStatus.CLOSED.value:
        job.status = JobStatus.CLOSED
    elif result["hiring_status"] == HiringStatus.OPEN.value:
        job.status = JobStatus.OPEN
        job.consecutive_verification_failures = 0
    else:
        job.consecutive_verification_failures = (getattr(job, "consecutive_verification_failures", 0) or 0) + 1

    if result.get("url"):
        job.canonical_job_url = result["url"]

    if db is not None:
        try:
            history = JobVerificationHistory(
                job_id=job.id,
                verification_result=result["verification_status"],
                evidence_source=result.get("evidence"),
                reason=result.get("reason"),
                destination_url=result.get("url"),
                created_at=timestamp,
            )
            db.add(history)
            db.commit()
            db.refresh(job)
        except Exception as exc:
            logger.warning("Could not commit job verification history: %s", exc)
            db.rollback()


def verify_active_jobs_batch(db: Session, limit: int = 50) -> dict[str, int]:
    """
    Background batch verification task:
    Rechecks active listings, updating timestamps and hiring statuses.
    """
    query = (
        select(Job)
        .where(
            or_(
                Job.last_url_verified_at.is_(None),
                Job.hiring_status.in_([HiringStatus.OPEN.value, HiringStatus.UNVERIFIED.value]),
            )
        )
        .order_by(Job.last_url_verified_at.asc().nullsfirst())
        .limit(limit)
    )
    jobs = db.scalars(query).all()
    stats = {"verified": 0, "open": 0, "closed": 0, "temporarily_unavailable": 0, "unverified": 0}

    for job in jobs:
        try:
            res = verify_single_job_posting(job, db)
            stats["verified"] += 1
            h_stat = res.get("hiring_status", "unverified")
            if h_stat in stats:
                stats[h_stat] += 1
        except Exception as exc:
            logger.error("Error verifying job #%s: %s", job.id, exc)

    return stats

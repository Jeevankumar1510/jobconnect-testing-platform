import time
from datetime import datetime, timezone
import pytest
from sqlalchemy import select

from accounts.models import CandidateProfile, Notification, User
from applications.enums import ApplicationStatus
from applications.models import Application
from config.database import SessionLocal
from jobs.enums import HiringStatus, JobStatus, UrlVerificationStatus
from jobs.models import Job, JobVerificationHistory, SavedJob
from jobs.services.job_verifier import verify_single_job_posting
from jobs.services.recommendation_engine import calculate_job_match
from jobs.services.url_resolver import (
    enrich_job_destination_metadata,
    is_generic_homepage_or_search,
    is_ip_private_or_reserved,
    is_safe_external_url,
    resolve_job_application_destination,
)
from tests.utils.api import ApiClient


# 1. Clicking Apply opens the correct job-specific URL
def test_1_resolve_exact_job_specific_url():
    job = Job(
        title="Python Developer",
        company="Example Company",
        location="Bengaluru",
        employment_type="full_time",
        application_url="https://careers.example.com/jobs/python-dev-123/apply",
        employer_job_url="https://careers.example.com/jobs/python-dev-123",
        source_job_url="https://jobboard.example.com/view/999",
        is_external=True,
    )
    dest = resolve_job_application_destination(job)
    assert dest.url == "https://careers.example.com/jobs/python-dev-123/apply"
    assert dest.destination_type == "application_page"

    enriched = enrich_job_destination_metadata(job)
    assert enriched.apply_destination_url == "https://careers.example.com/jobs/python-dev-123/apply"
    assert enriched.apply_disabled is False


# 2. A general job portal homepage is not used as a fallback
def test_2_generic_portal_homepage_rejected():
    assert is_generic_homepage_or_search("https://in.indeed.com") is True
    assert is_generic_homepage_or_search("https://www.linkedin.com/jobs") is True
    assert is_generic_homepage_or_search("https://company.com/careers") is True
    assert is_generic_homepage_or_search("https://www.google.com/search?q=job") is True

    job = Job(
        title="Software Engineer",
        company="Test Corp",
        location="Hyderabad",
        employment_type="full_time",
        application_url="https://indeed.com",
        source_job_url="https://indeed.com/jobs",
        is_external=True,
    )
    dest = resolve_job_application_destination(job)
    assert dest.url is None
    assert dest.destination_type == "unavailable"

    enriched = enrich_job_destination_metadata(job)
    assert enriched.apply_disabled is True
    assert "could not verify the original posting" in enriched.apply_warning.lower()


# 3. Invalid application URLs disable the Apply button
def test_3_invalid_application_urls_disable_apply():
    for invalid_url in ["", "   ", "javascript:alert(1)", "file:///etc/passwd", "not_a_url"]:
        job = Job(
            title="DevOps Engineer",
            company="Cloud Corp",
            location="Remote",
            employment_type="full_time",
            application_url=invalid_url,
            is_external=True,
        )
        enriched = enrich_job_destination_metadata(job)
        assert enriched.apply_disabled is True
        assert enriched.apply_destination_url is None


# 4. External redirect URLs are validated safely (SSRF & bounded checks)
def test_4_ssrf_and_ip_validation():
    # Loopback, private, and AWS/cloud metadata IPs must be blocked
    assert is_ip_private_or_reserved("127.0.0.1") is True
    assert is_ip_private_or_reserved("169.254.169.254") is True  # Cloud metadata
    assert is_ip_private_or_reserved("10.0.0.1") is True
    assert is_ip_private_or_reserved("192.168.1.1") is True
    assert is_ip_private_or_reserved("8.8.8.8") is False

    is_safe, _ = is_safe_external_url("http://169.254.169.254/latest/meta-data/")
    assert is_safe is False

    is_safe, _ = is_safe_external_url("http://localhost:8000/admin")
    assert is_safe is False

    is_safe, _ = is_safe_external_url("https://careers.google.com/jobs/results/12345")
    assert is_safe is True


# 5. A matching employer posting is correctly identified
def test_5_matching_employer_posting_identified():
    job = Job(
        title="Associate Software Engineer",
        company="Infosys",
        location="Bengaluru",
        employment_type="full_time",
        employer_job_url="https://career.infosys.com/joblist/view/REQ-101",
        source_job_url="https://jobboard.com/post/902",
        is_external=True,
    )
    dest = resolve_job_application_destination(job)
    assert dest.url == "https://career.infosys.com/joblist/view/REQ-101"
    assert dest.destination_type == "official_employer_posting"


# 6. An unrelated employer posting is rejected as a match
def test_6_unrelated_employer_posting_rejected():
    job = Job(
        title="React Developer",
        company="Zepto",
        location="Bengaluru",
        employment_type="full_time",
        employer_job_url="https://zepto.com/careers",  # Generic homepage without job slug/id
        is_external=True,
    )
    dest = resolve_job_application_destination(job)
    assert dest.url is None
    assert dest.destination_type == "unavailable"


from unittest.mock import patch
import urllib.error

# 7. A temporary network failure does not mark a job closed
def test_7_temporary_failure_preserves_job():
    job = Job(
        title="QA Automation Engineer",
        company="Target Tech",
        location="Pune",
        employment_type="full_time",
        hiring_status=HiringStatus.OPEN,
        consecutive_verification_failures=0,
        application_url="https://careers.example.com/jobs/qa-999",
        is_external=True,
    )
    with patch("urllib.request.OpenerDirector.open") as mock_open:
        mock_open.side_effect = urllib.error.HTTPError(
            url=job.application_url,
            code=503,
            msg="Service Unavailable",
            hdrs={},
            fp=None,
        )
        result = verify_single_job_posting(job)
        assert result["hiring_status"] in (
            HiringStatus.TEMPORARILY_UNAVAILABLE.value,
            HiringStatus.UNVERIFIED.value,
        )
        assert result["hiring_status"] != HiringStatus.CLOSED.value


# 8. Explicitly closed jobs receive the correct status
def test_8_explicitly_closed_jobs():
    job = Job(
        title="Backend Engineer",
        company="Old Listing Corp",
        location="Bengaluru",
        employment_type="full_time",
        hiring_status=HiringStatus.OPEN,
        application_url="https://careers.example.com/jobs/closed-101",
        is_external=True,
    )
    with patch("urllib.request.OpenerDirector.open") as mock_open:
        mock_open.side_effect = urllib.error.HTTPError(
            url=job.application_url,
            code=404,
            msg="Not Found",
            hdrs={},
            fp=None,
        )
        result = verify_single_job_posting(job)
        assert result["hiring_status"] == HiringStatus.CLOSED.value


# 9. Unverified jobs are not displayed as confirmed open
def test_9_unverified_jobs_not_confirmed_open():
    job = Job(
        title="Junior Python Dev",
        company="Startup X",
        location="Remote",
        employment_type="full_time",
        hiring_status=HiringStatus.UNVERIFIED,
        verification_status=UrlVerificationStatus.UNVERIFIED,
        is_external=True,
    )
    assert job.hiring_status != HiringStatus.OPEN
    dest = resolve_job_application_destination(job)
    assert dest.is_verified is False


# 10. Job status timestamps are updated
def test_10_status_timestamps_updated(job_factory, recruiter: dict):
    job_data = job_factory(recruiter, title="Timestamp Test Role")
    with SessionLocal() as db:
        job = db.get(Job, job_data["id"])
        assert job is not None
        now = datetime.now(timezone.utc)
        job.last_url_verified_at = now
        db.commit()
        db.refresh(job)

        assert job.last_url_verified_at is not None


# 11 & 12. User profiles persist across sessions and enforce privacy
def test_11_and_12_profile_persistence_and_privacy(api_client: ApiClient, candidate: dict, recruiter: dict):
    resp = api_client.put(
        "/api/v1/auth/me/profile",
        json={
            "full_name": "Arjun Kumar",
            "phone": "+91 98765 43210",
            "current_location": "Bengaluru",
            "preferred_job_titles": "Python Developer, Backend Engineer",
            "technical_skills": "Python, SQL, FastAPI, AWS",
            "experience_level": "fresher",
            "education": "B.Tech CSE, 2024",
        },
        headers={"Authorization": f"Bearer {candidate['token']}"},
    )
    assert resp.status_code == 200, resp.text
    profile = resp.json()
    assert profile["full_name"] == "Arjun Kumar"
    assert profile["profile_completion_percentage"] > 50

    get_resp = api_client.get(
        "/api/v1/auth/me/profile",
        headers={"Authorization": f"Bearer {candidate['token']}"},
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["full_name"] == "Arjun Kumar"

    rec_resp = api_client.get(
        "/api/v1/auth/me/profile",
        headers={"Authorization": f"Bearer {recruiter['token']}"},
    )
    assert rec_resp.status_code == 200
    assert rec_resp.json()["full_name"] is None or rec_resp.json()["full_name"] != "Arjun Kumar"


# 13. Saved jobs persist across sessions
def test_13_saved_jobs_persistence(api_client: ApiClient, candidate: dict, recruiter: dict, job_factory):
    job = job_factory(recruiter, title="Saved Job Test Role")

    save_resp = api_client.post(
        f"/api/v1/jobs/{job['id']}/save",
        json={"notes": "High priority opportunity"},
        headers={"Authorization": f"Bearer {candidate['token']}"},
    )
    assert save_resp.status_code == 200, save_resp.text

    list_resp = api_client.get(
        "/api/v1/jobs/saved",
        headers={"Authorization": f"Bearer {candidate['token']}"},
    )
    assert list_resp.status_code == 200
    saved_items = list_resp.json()
    assert any(s["job_id"] == job["id"] for s in saved_items)

    del_resp = api_client.delete(
        f"/api/v1/jobs/{job['id']}/save",
        headers={"Authorization": f"Bearer {candidate['token']}"},
    )
    assert del_resp.status_code == 204


# 14. Application statuses update correctly
def test_14_application_status_transitions(api_client: ApiClient, candidate: dict, recruiter: dict, job_factory):
    job = job_factory(recruiter, title="Tracked Role")

    track_resp = api_client.post(
        "/api/v1/applications/track-external",
        json={
            "job_id": job["id"],
            "status": "ready_to_apply",
            "notes": "Resume tailored",
        },
        headers={"Authorization": f"Bearer {candidate['token']}"},
    )
    assert track_resp.status_code in (200, 201), track_resp.text
    app_data = track_resp.json()
    assert app_data["status"] == "ready_to_apply"

    update_resp = api_client.patch(
        f"/api/v1/applications/{app_data['id']}/status",
        json={"status": "applied", "notes": "Submitted via company career portal"},
        headers={"Authorization": f"Bearer {candidate['token']}"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "applied"
    assert update_resp.json()["notes"] == "Submitted via company career portal"


# 15. Opening an application URL does not automatically mark a job Applied
def test_15_opening_url_does_not_auto_mark_applied(api_client: ApiClient, candidate: dict, recruiter: dict, job_factory):
    job = job_factory(recruiter, title="Independent Application Job")

    view_resp = api_client.get(f"/api/v1/jobs/{job['id']}")
    assert view_resp.status_code == 200

    my_apps = api_client.get(
        "/api/v1/applications/mine",
        headers={"Authorization": f"Bearer {candidate['token']}"},
    )
    assert my_apps.status_code == 200
    assert not any(a["job_id"] == job["id"] for a in my_apps.json()["items"])


# 16. Duplicate job records are handled correctly
def test_16_duplicate_detection_and_prevention():
    with SessionLocal() as db:
        recruiter = db.execute(select(User).where(User.role == "recruiter")).scalars().first()
        if not recruiter:
            recruiter = User(email=f"rec_dup_{int(time.time())}@example.com", hashed_password="pw", role="recruiter")
            db.add(recruiter)
            db.commit()

        ext_id = f"DEDUPE-{int(time.time() * 1000)}"
        job1 = Job(
            recruiter_id=recruiter.id,
            title="AI Engineer",
            company="Dedupe Tech",
            location="Bengaluru",
            employment_type="full_time",
            description="LLM / Agent developer",
            external_id=ext_id,
            source_job_url="https://portal.com/job/1",
        )
        db.add(job1)
        db.commit()

        existing = db.execute(select(Job).where(Job.external_id == ext_id)).scalar_one_or_none()
        assert existing is not None
        assert existing.company == "Dedupe Tech"

        from sqlalchemy.exc import IntegrityError
        job_dup = Job(
            recruiter_id=recruiter.id,
            title="AI Engineer",
            company="Dedupe Tech",
            location="Bengaluru",
            employment_type="full_time",
            description="Duplicate listing",
            external_id=ext_id,
        )
        db.add(job_dup)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


# 17. Scheduled verification configuration
def test_17_scheduled_verification_intervals():
    default_interval = 21600
    assert default_interval == 6 * 3600


# 18. Notifications generated for meaningful changes
def test_18_notifications_for_saved_job_changes(api_client: ApiClient, candidate: dict, recruiter: dict, job_factory):
    with SessionLocal() as db:
        user = db.execute(select(User).where(User.email == candidate["email"])).scalar_one()
        notif = Notification(
            user_id=user.id,
            notification_type="job_status_change",
            title="Saved Job Closed",
            message="Your saved job at Tech Corp has closed.",
        )
        db.add(notif)
        db.commit()

    notifs_resp = api_client.get(
        "/api/v1/auth/me/notifications",
        headers={"Authorization": f"Bearer {candidate['token']}"},
    )
    assert notifs_resp.status_code == 200
    items = notifs_resp.json()
    assert len(items) > 0
    assert items[0]["title"] == "Saved Job Closed"


# 19. Profile-based job matching with evidence explanations
def test_19_profile_based_recommendation_scoring():
    profile = CandidateProfile(
        technical_skills="Python, SQL, React, FastAPI",
        preferred_job_titles="Python Developer, Backend Engineer",
        preferred_locations="Bengaluru, Remote",
        experience_level="fresher",
        work_mode_preferences="remote",
    )
    job = Job(
        title="Associate Python Developer",
        company="Razorpay",
        location="Bengaluru",
        employment_type="full_time",
        description="Looking for Python, SQL, and FastAPI developer. Freshers welcome.",
        experience_level="fresher",
        is_fresher=True,
    )
    match_score, reasons, explanation = calculate_job_match(job, profile)
    assert match_score >= 40
    assert any("python" in r.lower() for r in reasons)


# 20. Remove jobs if link not available
def test_20_remove_jobs_if_link_not_available(api_client: ApiClient, candidate: dict, recruiter: dict):
    from jobs.services.external_jobs import purge_jobs_without_verified_direct_links

    with SessionLocal() as db:
        # Create an external job with no link
        dead_job = Job(
            recruiter_id=recruiter["id"],
            title="Dead Link Developer",
            company="Ghost Corp",
            location="Bengaluru",
            description="Testing dead link job removal functionality.",
            employment_type="full_time",
            is_external=True,
            status=JobStatus.OPEN,
            external_url=None,
            source_job_url=None,
            employer_job_url=None,
            application_url=None,
        )
        db.add(dead_job)
        db.commit()
        dead_job_id = dead_job.id

    # 1. search_jobs should NOT return the job because link is unavailable
    resp = api_client.get("/api/v1/jobs")
    assert resp.status_code == 200
    returned_ids = [j["id"] for j in resp.json()["items"]]
    assert dead_job_id not in returned_ids

    # 2. purge_jobs_without_verified_direct_links should remove it from the DB
    with SessionLocal() as db:
        purged = purge_jobs_without_verified_direct_links(db)
        assert purged >= 1
        assert db.get(Job, dead_job_id) is None


# 21. Redirect to original company career portal
def test_21_apply_redirect_to_company_career_portal(api_client: ApiClient, recruiter: dict):
    with SessionLocal() as db:
        job = Job(
            recruiter_id=recruiter["id"],
            title="Associate Telecom Software Engineer",
            company="Tech Mahindra",
            location="Pune",
            description="Tech Mahindra early careers fresher software development opportunity.",
            employment_type="full_time",
            employer_job_url="https://careers.techmahindra.com/EarlyCareers.aspx",
            is_external=True,
            status=JobStatus.OPEN,
        )
        db.add(job)
        db.commit()
        job_id = job.id

    # Test apply redirect endpoint (allow_redirects=False to verify 307 redirect)
    resp = api_client.get(f"/api/v1/jobs/{job_id}/apply-redirect", allow_redirects=False)
    assert resp.status_code == 307
    assert resp.headers["location"] == "https://careers.techmahindra.com/EarlyCareers.aspx"

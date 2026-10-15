import ipaddress
import re
import socket
import urllib.parse
from dataclasses import dataclass
from typing import Any

DISALLOWED_SCHEMES = {"javascript", "file", "data", "blob", "ftp", "about", "vbscript"}
ALLOWED_SCHEMES = {"http", "https"}

GENERIC_HOMEPAGES_AND_SEARCH_PATTERNS = [
    r"^https?://([a-z0-9-]+\.)?indeed\.[a-z.]+(/?$|/jobs/?$|/promo|/hire)",
    r"^https?://([a-z0-9-]+\.)?glassdoor\.[a-z.]+(/?$|/index\.htm)",
    r"^https?://(www\.)?linkedin\.com(/?$|/jobs/?$|/feed)",
    r"^https?://(www\.)?naukri\.com(/?$|/browse-jobs)",
    r"^https?://(www\.)?monster\.[a-z.]+(/?$)",
    r"^https?://(www\.)?foundit\.[a-z.]+(/?$)",
    r"^https?://(www\.)?google\.[a-z.]+/search",
]

OFFICIAL_ATS_AND_PORTAL_DOMAINS = {
    "greenhouse.io",
    "lever.co",
    "ashbyhq.com",
    "smartrecruiters.com",
    "workday.com",
    "myworkdayjobs.com",
    "freshteam.com",
}


@dataclass
class ResolvedDestination:
    url: str | None
    is_verified: bool
    destination_type: str  # 'application_page' | 'employer_posting' | 'source_detail' | 'unavailable'
    status_label: str
    message: str | None = None
    warning: str | None = None


def is_ip_private_or_reserved(ip_str: str) -> bool:
    """Checks whether an IP address belongs to loopback, private, link-local, or cloud metadata ranges."""
    try:
        ip = ipaddress.ip_address(ip_str)
        return (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or str(ip).startswith("169.254.")  # AWS/GCP/Azure instance metadata
        )
    except ValueError:
        return True


def is_safe_external_url(url: str | None) -> tuple[bool, str]:
    """
    Validates external URL for safety:
    - Rejects empty, whitespace-only, or malformed URLs
    - Rejects unsafe schemes (javascript:, file:, data:)
    - Resolves hostname via DNS and prevents SSRF / internal IP access
    """
    if not url or not isinstance(url, str):
        return False, "URL is empty or missing"

    url = url.trim() if hasattr(url, "trim") else url.strip()
    if not url:
        return False, "URL is empty"

    try:
        parsed = urllib.parse.urlparse(url)
    except Exception as exc:
        return False, f"Malformed URL: {exc}"

    scheme = (parsed.scheme or "").lower()
    if scheme in DISALLOWED_SCHEMES or scheme not in ALLOWED_SCHEMES:
        return False, f"Unsafe URL scheme: '{scheme}'"

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        return False, "URL is missing a valid hostname"

    # Reject localhost names
    if hostname in {"localhost", "127.0.0.1", "::1", "metadata.google.internal"}:
        return False, "Internal and localhost addresses are prohibited"

    # DNS check to prevent SSRF against internal resources
    try:
        addr_info = socket.getaddrinfo(hostname, None)
        for _, _, _, _, sockaddr in addr_info:
            ip_addr = sockaddr[0]
            if is_ip_private_or_reserved(ip_addr):
                return False, f"Prohibited private/internal network destination: {ip_addr}"
    except (socket.gaierror, socket.error):
        # Could be an invalid DNS name or offline network
        pass

    return True, "URL is safe"


def is_company_career_portal(url: str) -> bool:
    """Returns True if the URL points to a company's official career portal or ATS vacancy."""
    try:
        parsed = urllib.parse.urlparse(url.lower().strip())
        host = parsed.hostname or ""
        path = parsed.path.rstrip("/")
        if any(host == ats or host.endswith("." + ats) for ats in OFFICIAL_ATS_AND_PORTAL_DOMAINS):
            return True
        if host.startswith("careers.") or host.startswith("career.") or host.startswith("jobs.") or host.startswith("job-openings."):
            return True
        career_keywords = ["/careers", "/jobs", "/entry-level", "/early-careers", "/campus", "/jobdesc", "/openings", "/students"]
        if any(keyword in path for keyword in career_keywords):
            return True
    except Exception:
        pass
    return False


def is_generic_homepage_or_search(url: str) -> bool:
    """Checks whether the URL is merely a generic job board homepage or broad search page."""
    u_lower = url.lower().strip()
    for pattern in GENERIC_HOMEPAGES_AND_SEARCH_PATTERNS:
        if re.search(pattern, u_lower):
            return True
    try:
        parsed = urllib.parse.urlparse(u_lower)
        path = parsed.path.rstrip("/")
        host = parsed.hostname or ""

        # Check if hosted on a recognized ATS (e.g. boards.greenhouse.io/postman, jobs.lever.co/zepto)
        is_ats = any(host == ats or host.endswith("." + ats) for ats in OFFICIAL_ATS_AND_PORTAL_DOMAINS)

        # Generic paths without specific job ID, deep vacancy path, or hash/query
        generic_paths = {"", "/", "/careers", "/jobs", "/en/careers", "/in-en/careers", "/search", "/search-jobs", "/find-jobs"}
        if path in generic_paths and not parsed.query and not parsed.fragment:
            if not (is_ats and path not in {"", "/"}):
                return True
    except Exception:
        pass
    return False


def resolve_job_application_destination(job: Any) -> ResolvedDestination:
    """
    Resolves the exact, verified application destination following strict priority:
    1. Verified application page for the exact vacancy (job.application_url)
    2. Verified official employer job posting for the exact vacancy (job.employer_job_url)
    3. Exact job detail page on the original job source (job.source_job_url or job.external_url)
    4. If none available, return 'unavailable' with disabled action.
    """
    candidate_urls = [
        ("application_page", getattr(job, "application_url", None)),
        ("official_employer_posting", getattr(job, "employer_job_url", None)),
        ("source_detail", getattr(job, "source_job_url", None) or getattr(job, "external_url", None)),
    ]

    for dest_type, candidate_url in candidate_urls:
        if not candidate_url or not isinstance(candidate_url, str):
            continue

        candidate_url = candidate_url.strip()
        if not candidate_url:
            continue

        # Check safety
        is_safe, safety_reason = is_safe_external_url(candidate_url)
        if not is_safe:
            continue

        # Reject generic portals / search pages
        if is_generic_homepage_or_search(candidate_url):
            continue

        # We have a candidate destination
        v_status = getattr(job, "verification_status", "unverified")
        h_status = getattr(job, "hiring_status", "open")

        is_verified = v_status in {"verified_exact_match", "verified", "open"}
        warning = None
        if h_status in {"closed", "expired"}:
            warning = "This posting is reported as closed or expired by the employer."
        elif not is_verified:
            warning = "Hiring status could not be independently confirmed. Check the original posting before applying."

        return ResolvedDestination(
            url=candidate_url,
            is_verified=is_verified,
            destination_type=dest_type,
            status_label="Verified Destination" if is_verified else "Source Detail Page",
            message=None,
            warning=warning,
        )

    return ResolvedDestination(
        url=None,
        is_verified=False,
        destination_type="unavailable",
        status_label="Application Destination Unavailable",
        message="Application link unavailable. We could not verify the original posting for this job.",
        warning="Apply action is temporarily disabled until a direct original posting is verified.",
    )


def enrich_job_destination_metadata(job: Any) -> Any:
    """Enriches a Job model instance with verified destination fields for schema serialization."""
    dest = resolve_job_application_destination(job)
    job.apply_destination_url = dest.url
    job.apply_destination_type = dest.destination_type
    job.is_destination_verified = dest.is_verified
    job.apply_warning = dest.message or dest.warning
    job.apply_disabled = not bool(dest.url)
    return job


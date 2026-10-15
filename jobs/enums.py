from enum import Enum


class EmploymentType(str, Enum):
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    INTERNSHIP = "internship"


class JobStatus(str, Enum):
    OPEN = "open"
    CLOSED = "closed"
    EXPIRED = "expired"
    UNVERIFIED = "unverified"
    TEMPORARILY_UNAVAILABLE = "temporarily_unavailable"
    REMOVED_FROM_SOURCE = "removed_from_source"


class HiringStatus(str, Enum):
    OPEN = "open"
    CLOSED = "closed"
    EXPIRED = "expired"
    UNVERIFIED = "unverified"
    TEMPORARILY_UNAVAILABLE = "temporarily_unavailable"
    REMOVED_FROM_SOURCE = "removed_from_source"


class UrlVerificationStatus(str, Enum):
    VERIFIED_EXACT_MATCH = "verified_exact_match"
    PROBABLE_MATCH = "probable_match"
    UNVERIFIED = "unverified"
    NOT_FOUND = "not_found"


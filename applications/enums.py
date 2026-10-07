from enum import Enum


class ApplicationStatus(str, Enum):
    SUBMITTED = "submitted"
    REVIEWING = "reviewing"
    INTERVIEW = "interview"
    REJECTED = "rejected"
    ACCEPTED = "accepted"

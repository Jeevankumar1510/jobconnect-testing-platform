from enum import Enum


class ApplicationStatus(str, Enum):
    INTERESTED = "interested"
    READY_TO_APPLY = "ready_to_apply"
    SUBMITTED = "submitted"
    APPLIED = "applied"
    REVIEWING = "reviewing"
    ASSESSMENT = "assessment"
    INTERVIEW = "interview"
    OFFER = "offer"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


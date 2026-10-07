from enum import Enum


class EmploymentType(str, Enum):
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    INTERNSHIP = "internship"


class JobStatus(str, Enum):
    OPEN = "open"
    CLOSED = "closed"

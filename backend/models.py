from enum import Enum
from typing import Optional

from pydantic import BaseModel


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"


class JobRecord(BaseModel):
    job_id: str
    status: JobStatus
    source_filename: str
    model: str
    error: Optional[str] = None
    stems: Optional[list[str]] = None

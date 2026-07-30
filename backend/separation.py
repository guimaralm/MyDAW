import shutil
import threading
import uuid
from pathlib import Path
from typing import Optional

from demucs.separate import main as demucs_main

from models import JobRecord, JobStatus

STORAGE_DIR = Path(__file__).resolve().parent / "storage"
UPLOADS_DIR = STORAGE_DIR / "uploads"
JOBS_DIR = STORAGE_DIR / "jobs"

DEFAULT_MODEL = "htdemucs"
STEM_NAMES = ["vocals", "drums", "bass", "other"]

_jobs: dict[str, JobRecord] = {}
_lock = threading.Lock()


def create_job(source_filename: str, model: str = DEFAULT_MODEL) -> str:
    job_id = str(uuid.uuid4())
    with _lock:
        _jobs[job_id] = JobRecord(
            job_id=job_id, status=JobStatus.QUEUED, source_filename=source_filename, model=model
        )
    return job_id


def get_job(job_id: str) -> Optional[JobRecord]:
    with _lock:
        return _jobs.get(job_id)


def save_upload(job_id: str, filename: str, content: bytes) -> Path:
    upload_dir = UPLOADS_DIR / job_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / filename
    dest.write_bytes(content)
    return dest


def run_separation(job_id: str, input_path: Path) -> None:
    with _lock:
        job = _jobs[job_id]
        job.status = JobStatus.PROCESSING

    try:
        out_dir = JOBS_DIR / job_id
        out_dir.mkdir(parents=True, exist_ok=True)

        demucs_main(["-n", job.model, "-d", "cpu", "-o", str(out_dir), str(input_path)])

        stems_dir = out_dir / job.model / input_path.stem
        produced = []
        for stem_name in STEM_NAMES:
            src = stems_dir / f"{stem_name}.wav"
            if src.exists():
                dest = out_dir / f"{stem_name}.wav"
                shutil.move(str(src), str(dest))
                produced.append(stem_name)
        shutil.rmtree(out_dir / job.model, ignore_errors=True)

        with _lock:
            job.status = JobStatus.DONE
            job.stems = produced

        # The uploaded original is redundant once stems exist — the user already has the
        # source file on their own disk (it came from Suno), so don't keep a second copy.
        shutil.rmtree(input_path.parent, ignore_errors=True)
    except Exception as exc:
        with _lock:
            job.status = JobStatus.ERROR
            job.error = str(exc)


def delete_job(job_id: str) -> bool:
    with _lock:
        if job_id not in _jobs:
            return False
        del _jobs[job_id]
    shutil.rmtree(JOBS_DIR / job_id, ignore_errors=True)
    shutil.rmtree(UPLOADS_DIR / job_id, ignore_errors=True)
    return True


def get_stem_path(job_id: str, stem_name: str) -> Optional[Path]:
    path = JOBS_DIR / job_id / f"{stem_name}.wav"
    return path if path.exists() else None

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

import separation
from models import JobRecord

app = FastAPI(title="MyDAW stem-separation service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/separate", response_model=JobRecord)
async def separate(background_tasks: BackgroundTasks, file: UploadFile = File(...)) -> JobRecord:
    content = await file.read()
    job_id = separation.create_job(source_filename=file.filename or "upload")
    input_path = separation.save_upload(job_id, file.filename or "upload", content)
    background_tasks.add_task(separation.run_separation, job_id, input_path)
    job = separation.get_job(job_id)
    assert job is not None
    return job


@app.get("/jobs/{job_id}", response_model=JobRecord)
def get_job_status(job_id: str) -> JobRecord:
    job = separation.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/jobs/{job_id}/stems/{stem_name}")
def get_stem(job_id: str, stem_name: str) -> FileResponse:
    path = separation.get_stem_path(job_id, stem_name)
    if not path:
        raise HTTPException(status_code=404, detail="Stem not found")
    return FileResponse(path, media_type="audio/wav")


@app.delete("/jobs/{job_id}", status_code=204)
def delete_job(job_id: str) -> None:
    if not separation.delete_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")

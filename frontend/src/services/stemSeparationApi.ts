// Locally the backend is the FastAPI service next to the dev server. A deployed frontend has no
// backend beside it, so point it at one with VITE_API_BASE (no trailing slash).
const API_BASE: string = import.meta.env.VITE_API_BASE?.replace(/\/$/, '') ?? 'http://localhost:8000'

/** fetch against the backend, turning a bare "Failed to fetch" into something actionable. */
async function request(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, init)
  } catch {
    throw new Error(`Can't reach the separation service at ${API_BASE}. Is the backend running?`)
  }
}

export type JobStatus = 'queued' | 'processing' | 'done' | 'error'

export interface JobRecord {
  job_id: string
  status: JobStatus
  source_filename: string
  model: string
  error: string | null
  stems: string[] | null
}

export async function submitSeparationJob(file: File): Promise<JobRecord> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await request('/separate', { method: 'POST', body: formData })
  if (!res.ok) throw new Error(`Couldn't send the file to the backend (${res.status})`)
  return res.json()
}

export async function getJobStatus(jobId: string): Promise<JobRecord> {
  const res = await request(`/jobs/${jobId}`)
  if (!res.ok) throw new Error(`Couldn't check the separation job (${res.status})`)
  return res.json()
}

export function getStemUrl(jobId: string, stemName: string): string {
  return `${API_BASE}/jobs/${jobId}/stems/${stemName}`
}

export async function pollJobUntilDone(
  jobId: string,
  options: { intervalMs?: number; onUpdate?: (job: JobRecord) => void } = {},
): Promise<JobRecord> {
  const { intervalMs = 1000, onUpdate } = options
  for (;;) {
    const job = await getJobStatus(jobId)
    onUpdate?.(job)
    if (job.status === 'done' || job.status === 'error') return job
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

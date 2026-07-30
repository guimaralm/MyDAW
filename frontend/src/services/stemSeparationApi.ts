const API_BASE = 'http://localhost:8000'

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
  const res = await fetch(`${API_BASE}/separate`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error(`No se pudo enviar el archivo al backend (${res.status})`)
  return res.json()
}

export async function getJobStatus(jobId: string): Promise<JobRecord> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`)
  if (!res.ok) throw new Error(`No se pudo consultar el estado del job (${res.status})`)
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

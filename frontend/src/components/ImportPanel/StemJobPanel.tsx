import type { StemJob } from '../../stores/stemJobStore'

const STATUS_LABEL: Record<StemJob['status'], string> = {
  uploading: 'Subiendo…',
  queued: 'En cola…',
  processing: 'Separando (voz/batería/bajo/otros)…',
  done: 'Listo',
  error: 'Error',
}

export function StemJobPanel({ jobs }: { jobs: StemJob[] }) {
  if (jobs.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      {jobs.map((job) => (
        <div
          key={job.id}
          className="flex items-center justify-between rounded bg-neutral-900 px-3 py-2 text-xs"
        >
          <span className="text-neutral-300">{job.fileName}</span>
          <span className={job.status === 'error' ? 'text-red-400' : 'text-neutral-500'}>
            {job.status === 'error' && job.error ? job.error : STATUS_LABEL[job.status]}
          </span>
        </div>
      ))}
    </div>
  )
}

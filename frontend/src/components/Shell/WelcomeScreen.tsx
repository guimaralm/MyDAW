import { useRef, useState, type DragEvent } from 'react'
import type { StemJob } from '../../stores/stemJobStore'

interface WelcomeScreenProps {
  jobs: StemJob[]
  onFilesSelected: (files: File[]) => void
}

const STATUS_LABEL: Record<StemJob['status'], string> = {
  uploading: 'Uploading…',
  queued: 'Queued…',
  processing: 'Separating into vocals, drums, bass and other…',
  done: 'Done',
  error: 'Error',
}

/**
 * First run is a single decision: bring in a song. Everything else (mastering chain, export,
 * projects) stays out of the way until there's audio to work on.
 */
export function WelcomeScreen({ jobs, onFilesSelected }: WelcomeScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const busy = jobs.some((j) => j.status !== 'error')

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length) onFilesSelected(files)
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Master your track</h1>
        <p className="mt-1.5 text-[13px] text-[var(--text-dim)]">
          Drop a song and it's split into vocals, drums, bass and other — ready to edit and master.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex w-full max-w-xl cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-8 py-14 transition-colors ${
          isDragging
            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
            : 'border-[var(--border-strong)] bg-[var(--bg-panel)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-raised)]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp3"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length) onFilesSelected(files)
            e.target.value = ''
          }}
        />
        <span className="text-[15px] font-medium text-[var(--text)]">Drop an audio file</span>
        <span className="text-xs text-[var(--text-faint)]">or click to browse · MP3 or WAV</span>
      </div>

      {busy && (
        <div className="flex w-full max-w-xl flex-col gap-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-3"
            >
              <span className="truncate text-xs text-[var(--text)]">{job.fileName}</span>
              <span
                className={`shrink-0 text-[11px] ${job.status === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text-dim)]'}`}
              >
                {job.status === 'error' && job.error ? job.error : STATUS_LABEL[job.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

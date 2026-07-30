import { useState } from 'react'

interface ExportDialogProps {
  onExportWav: () => Promise<void>
  onExportMp3: () => Promise<void>
  disabled: boolean
}

export function ExportDialog({ onExportWav, onExportMp3, disabled }: ExportDialogProps) {
  const [busy, setBusy] = useState<'wav' | 'mp3' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(format: 'wav' | 'mp3', fn: () => Promise<void>) {
    setBusy(format)
    setError(null)
    try {
      await fn()
    } catch (err) {
      if (err instanceof Error) setError(err.message)
      else if (err instanceof ErrorEvent) setError(err.message)
      else setError(String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-2 rounded bg-neutral-900 px-4 py-2">
      <span className="text-xs text-neutral-500">Exportar mezcla:</span>
      <button
        type="button"
        disabled={disabled || busy !== null}
        onClick={() => run('wav', onExportWav)}
        className="rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
      >
        {busy === 'wav' ? 'Renderizando…' : 'WAV'}
      </button>
      <button
        type="button"
        disabled={disabled || busy !== null}
        onClick={() => run('mp3', onExportMp3)}
        className="rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
      >
        {busy === 'mp3' ? 'Codificando…' : 'MP3'}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'

interface TransportBarProps {
  isPlaying: boolean
  currentTime: number
  duration: number
  loopEnabled: boolean
  onTogglePlay: () => void
  onSeek: (seconds: number) => void
  onToggleLoop: () => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Parse "m:ss", "ss", or a decimal number of seconds into seconds; null if unparseable. */
function parseTime(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (trimmed.includes(':')) {
    const [m, s] = trimmed.split(':')
    const mins = Number(m)
    const secs = Number(s)
    if (Number.isNaN(mins) || Number.isNaN(secs)) return null
    return mins * 60 + secs
  }
  const n = Number(trimmed)
  return Number.isNaN(n) ? null : n
}

export function TransportBar({
  isPlaying,
  currentTime,
  duration,
  loopEnabled,
  onTogglePlay,
  onSeek,
  onToggleLoop,
}: TransportBarProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // While not editing, the field mirrors the live playhead. Once focused it holds the user's
  // typed value so the 60fps playhead updates don't overwrite what they're typing.
  useEffect(() => {
    if (!editing) setDraft(formatTime(currentTime))
  }, [currentTime, editing])

  function commit() {
    const parsed = parseTime(draft)
    if (parsed !== null) onSeek(Math.max(0, parsed))
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-2 rounded bg-neutral-900 px-4 py-2">
      <button
        type="button"
        onClick={() => onSeek(0)}
        className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700"
        title="Volver al inicio"
      >
        ⏮
      </button>
      <button
        type="button"
        onClick={onTogglePlay}
        className="rounded bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-500"
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <span className="ml-1 font-mono text-xs text-neutral-400">
        <input
          ref={inputRef}
          value={draft}
          onFocus={() => {
            setEditing(true)
            setDraft(formatTime(currentTime))
            requestAnimationFrame(() => inputRef.current?.select())
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
              inputRef.current?.blur()
            } else if (e.key === 'Escape') {
              setEditing(false)
              setDraft(formatTime(currentTime))
              inputRef.current?.blur()
            }
          }}
          className="w-12 rounded bg-neutral-800 px-1 py-0.5 text-right text-neutral-200 focus:outline-none focus:ring-1 focus:ring-purple-400"
          title="Editá la posición (m:ss) y Enter para saltar ahí"
        />
        {' / '}
        {formatTime(duration)}
      </span>
      <button
        type="button"
        onClick={onToggleLoop}
        className={`ml-auto rounded px-3 py-1.5 text-sm ${
          loopEnabled ? 'bg-purple-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
        }`}
        title="Reproducir en bucle la región de loop"
      >
        🔁 Loop
      </button>
    </div>
  )
}

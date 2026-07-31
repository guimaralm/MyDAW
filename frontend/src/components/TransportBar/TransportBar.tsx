import { useEffect, useRef, useState } from 'react'
import { Button, ToolbarDivider } from '../ui/Button'

interface TransportBarProps {
  isPlaying: boolean
  currentTime: number
  duration: number
  loopEnabled: boolean
  hasLoopRegion: boolean
  onTogglePlay: () => void
  onSeek: (seconds: number) => void
  onToggleLoop: () => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Accepts "m:ss", bare seconds, or a decimal. Returns null when unparseable. */
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
  hasLoopRegion,
  onTogglePlay,
  onSeek,
  onToggleLoop,
}: TransportBarProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // While not editing the field mirrors the live playhead; once focused it holds what the
  // user typed so 60fps updates don't overwrite it mid-keystroke.
  useEffect(() => {
    if (!editing) setDraft(formatTime(currentTime))
  }, [currentTime, editing])

  function commit() {
    const parsed = parseTime(draft)
    if (parsed !== null) onSeek(Math.max(0, parsed))
    setEditing(false)
  }

  return (
    <footer className="flex h-14 shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-panel)] px-3">
      <Button variant="ghost" onClick={() => onSeek(0)} title="Back to start (Home)">
        ⏮
      </Button>
      <button
        type="button"
        onClick={onTogglePlay}
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent)] text-white transition-colors hover:bg-[var(--accent-hover)]"
      >
        {isPlaying ? (
          <span className="flex gap-[3px]">
            <span className="block h-3.5 w-[3px] rounded-[1px] bg-current" />
            <span className="block h-3.5 w-[3px] rounded-[1px] bg-current" />
          </span>
        ) : (
          <span className="ml-[2px] block h-0 w-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-current" />
        )}
      </button>

      <div className="ml-1 flex items-baseline gap-1.5">
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
          className="tnum w-16 rounded-md bg-[var(--bg-app)] px-2 py-1 text-right text-base text-[var(--text)] focus:outline focus:outline-1 focus:outline-[var(--accent)]"
          title="Type a position (m:ss) and press Enter"
        />
        <span className="tnum text-xs text-[var(--text-faint)]">/ {formatTime(duration)}</span>
      </div>

      <ToolbarDivider />
      <Button
        variant="default"
        size="sm"
        active={loopEnabled}
        onClick={onToggleLoop}
        title={hasLoopRegion ? 'Loop the marked region' : 'Shift+drag on the timeline to mark a loop region'}
      >
        Loop
      </Button>
      {!hasLoopRegion && loopEnabled && (
        <span className="text-[10px] text-[var(--text-faint)]">shift+drag to set a region</span>
      )}
    </footer>
  )
}

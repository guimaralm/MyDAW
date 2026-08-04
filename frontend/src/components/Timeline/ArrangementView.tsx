import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LoopRegion } from '../../App'
import { describeTrack } from '../../lib/stemColors'
import { startCoalescedDrag } from '../../stores/projectStore'
import type { Clip, Track } from '../../types/project'
import { Button, ToolbarDivider } from '../ui/Button'
import { ClipBox } from './ClipBox'

const LANE_H = 84
const RULER_H = 26
const HEADER_W = 190

export interface RangeSelection {
  clipId: string
  start: number
  end: number
}

interface ArrangementViewProps {
  tracks: Track[]
  clips: Clip[]
  currentTime: number
  isPlaying: boolean
  selectedClipId: string | null
  selection: RangeSelection | null
  loop: LoopRegion
  onClipClick: (clipId: string, timeAtClick: number) => void
  onSelectRange: (clipId: string, a: number, b: number) => void
  onClipContextMenu: (clipId: string, timeAtClick: number, clientX: number, clientY: number) => void
  onSeek: (seconds: number) => void
  onScrubStart: () => void
  onScrubEnd: () => void
  onCutAtPlayhead: () => void
  onTrimLeft: (clipId: string, newBufferOffset: number) => void
  onTrimRight: (clipId: string, newBufferEnd: number) => void
  onFade: (clipId: string, fade: { fadeIn?: number; fadeOut?: number }) => void
  onDeleteClip: (clipId: string) => void
  onVolumeChange: (trackId: string, volume: number) => void
  onPanChange: (trackId: string, pan: number) => void
  onToggleMute: (trackId: string) => void
  onToggleSolo: (trackId: string) => void
  onRemoveTrack: (trackId: string) => void
  onLoopChange: (loop: LoopRegion) => void
  onClearSelection: () => void
  onCropToSelection: () => void
  onCropAllSong: () => void
}

const linToDb = (lin: number) => (lin <= 0.001 ? -60 : 20 * Math.log10(lin))
const dbToLin = (db: number) => (db <= -60 ? 0 : Math.pow(10, db / 20))

function formatTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Time ruler with a major/minor tick density chosen to suit the current zoom. */
function Ruler({ duration, pps, width }: { duration: number; pps: number; width: number }) {
  const major = pps >= 120 ? 1 : pps >= 60 ? 2 : pps >= 25 ? 5 : pps >= 12 ? 10 : 30
  const minor = major / (major >= 5 ? 5 : 2)
  const ticks: { t: number; major: boolean }[] = []
  for (let t = 0; t <= duration + major; t += minor) {
    ticks.push({ t, major: Math.abs(t / major - Math.round(t / major)) < 1e-6 })
  }
  return (
    <div className="relative" style={{ width, height: RULER_H }}>
      {ticks.map(({ t, major: isMajor }) => (
        <div
          key={t}
          className="absolute bottom-0"
          style={{
            left: t * pps,
            height: isMajor ? 10 : 5,
            width: 1,
            background: isMajor ? 'var(--border-strong)' : 'var(--border)',
          }}
        >
          {isMajor && (
            <span className="tnum absolute -top-[13px] left-1 whitespace-nowrap text-[9px] text-[var(--text-faint)]">
              {formatTime(t)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function TrackHeader({
  track,
  silenced,
  onVolumeChange,
  onPanChange,
  onToggleMute,
  onToggleSolo,
  onRemove,
}: {
  track: Track
  silenced: boolean
  onVolumeChange: (v: number) => void
  onPanChange: (v: number) => void
  onToggleMute: () => void
  onToggleSolo: () => void
  onRemove: () => void
}) {
  const { title, subtitle, color } = describeTrack(track.name)
  const db = linToDb(track.volume)

  return (
    <div
      className={`group relative flex flex-col justify-center gap-1.5 border-b border-r border-[var(--border)] bg-[var(--bg-panel)] pl-3 pr-2 ${
        silenced ? 'opacity-50' : ''
      }`}
      style={{ height: LANE_H, width: HEADER_W }}
    >
      {/* Colour spine ties the lane header to its waveform colour. */}
      <div className="absolute left-0 top-0 h-full w-[3px]" style={{ background: color }} />

      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-xs font-medium text-[var(--text)]" title={track.name}>
          {title}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleMute}
            title="Mute"
            className={`h-[18px] w-[18px] rounded text-[10px] font-semibold transition-colors ${
              track.muted
                ? 'bg-[var(--danger)] text-white'
                : 'bg-[var(--bg-raised)] text-[var(--text-faint)] hover:text-[var(--text)]'
            }`}
          >
            M
          </button>
          <button
            type="button"
            onClick={onToggleSolo}
            title="Solo"
            className={`h-[18px] w-[18px] rounded text-[10px] font-semibold transition-colors ${
              track.soloed
                ? 'bg-[var(--warn)] text-black'
                : 'bg-[var(--bg-raised)] text-[var(--text-faint)] hover:text-[var(--text)]'
            }`}
          >
            S
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Remove track"
            className="text-[11px] text-[var(--text-faint)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="range"
          min={-60}
          max={6}
          step={0.5}
          value={db}
          onPointerDown={startCoalescedDrag}
          onChange={(e) => onVolumeChange(dbToLin(Number(e.target.value)))}
          onDoubleClick={() => onVolumeChange(1)}
          className="w-full"
          style={{ accentColor: color }}
          title="Volume (double-click for 0 dB)"
        />
        <span className="tnum w-8 shrink-0 text-right text-[10px] text-[var(--text-faint)]">
          {db <= -60 ? '−∞' : db.toFixed(0)}
        </span>
      </div>

      {/* Pan replaces the source label on hover, so the header stays calm at rest. */}
      <div className="relative h-3">
        <span className="absolute inset-0 truncate text-[10px] text-[var(--text-faint)] transition-opacity group-hover:opacity-0">
          {subtitle}
        </span>
        <div className="absolute inset-0 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="text-[9px] uppercase text-[var(--text-faint)]">pan</span>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={track.pan ?? 0}
            onPointerDown={startCoalescedDrag}
            onChange={(e) => onPanChange(Number(e.target.value))}
            onDoubleClick={() => onPanChange(0)}
            className="h-1 w-full"
            style={{ accentColor: 'var(--text-dim)' }}
            title="Pan (double-click to centre)"
          />
        </div>
      </div>
    </div>
  )
}

export function ArrangementView(props: ArrangementViewProps) {
  const { tracks, clips, currentTime, isPlaying, selectedClipId, selection, loop } = props
  const [pps, setPps] = useState(40)
  const [follow, setFollow] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const zoomAnchor = useRef<{ time: number; cursorX: number } | null>(null)

  const duration = clips.reduce((m, c) => Math.max(m, c.timelineStart + c.duration), 0)
  const lanesWidth = Math.max(600, (duration + 4) * pps)
  const contentHeight = RULER_H + tracks.length * LANE_H
  const anySolo = tracks.some((t) => t.soloed)

  // Keep the playhead in view while playing.
  useEffect(() => {
    if (!follow || !isPlaying || !scrollRef.current) return
    const el = scrollRef.current
    const x = HEADER_W + currentTime * pps
    if (x < el.scrollLeft + HEADER_W + 60 || x > el.scrollLeft + el.clientWidth - 60) {
      el.scrollLeft = x - el.clientWidth / 2
    }
  }, [currentTime, follow, isPlaying, pps])

  // After zooming, pin the time that was under the cursor back under the cursor.
  useLayoutEffect(() => {
    if (!zoomAnchor.current || !scrollRef.current) return
    const { time, cursorX } = zoomAnchor.current
    scrollRef.current.scrollLeft = time * pps + HEADER_W - cursorX
    zoomAnchor.current = null
  }, [pps])

  /** Absolute timeline seconds for a viewport x coordinate. */
  function timeFromClientX(clientX: number): number {
    const el = scrollRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, (clientX - rect.left + el.scrollLeft - HEADER_W) / pps)
  }

  function isOverHeaders(clientX: number): boolean {
    const el = scrollRef.current
    if (!el) return false
    return clientX - el.getBoundingClientRect().left < HEADER_W
  }

  function handleWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const el = scrollRef.current
    if (!el) return
    const cursorX = e.clientX - el.getBoundingClientRect().left
    const time = (el.scrollLeft + cursorX - HEADER_W) / pps
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    zoomAnchor.current = { time, cursorX }
    setPps(Math.max(6, Math.min(300, pps * factor)))
  }

  /** Snap to the grid, other clip edges, or the playhead when within a few pixels. */
  function snap(time: number): number {
    const threshold = 8 / pps
    const grid = pps >= 60 ? 0.5 : pps >= 20 ? 1 : 5
    const candidates = [Math.round(time / grid) * grid, currentTime]
    for (const c of clips) candidates.push(c.timelineStart, c.timelineStart + c.duration)
    let best = time
    let bestDist = threshold
    for (const cand of candidates) {
      const d = Math.abs(cand - time)
      if (d < bestDist) {
        bestDist = d
        best = cand
      }
    }
    return Math.max(0, best)
  }

  function handleBackgroundPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || isOverHeaders(e.clientX)) return
    // Shift+drag marks the loop region; a plain click seeks and clears the selection.
    if (e.shiftKey) {
      const start = timeFromClientX(e.clientX)
      props.onLoopChange({ enabled: true, start, end: start })
      const onMoveEvt = (ev: PointerEvent) => {
        const t = timeFromClientX(ev.clientX)
        props.onLoopChange({ enabled: true, start: Math.min(start, t), end: Math.max(start, t) })
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMoveEvt)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMoveEvt)
      window.addEventListener('pointerup', onUp)
      return
    }
    props.onSeek(timeFromClientX(e.clientX))
    props.onClearSelection()
  }

  function startPlayheadDrag(e: React.PointerEvent) {
    e.stopPropagation()
    props.onScrubStart()
    const onMoveEvt = (ev: PointerEvent) => props.onSeek(timeFromClientX(ev.clientX))
    const onUp = () => {
      window.removeEventListener('pointermove', onMoveEvt)
      window.removeEventListener('pointerup', onUp)
      props.onScrubEnd()
    }
    window.addEventListener('pointermove', onMoveEvt)
    window.addEventListener('pointerup', onUp)
  }

  const playheadX = HEADER_W + currentTime * pps

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Edit toolbar — grouped by intent so actions, toggles and destructive commands differ. */}
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3">
        <Button size="sm" onClick={props.onCutAtPlayhead} title="Split every track at the cursor (⌘E)">
          Cut at cursor
        </Button>
        <Button size="sm" disabled={!selection} onClick={props.onCropToSelection} title="Crop the song to the selection">
          Crop
        </Button>
        <Button size="sm" onClick={props.onCropAllSong} title="Trim the start and end of the whole song">
          Crop all song
        </Button>
        <ToolbarDivider />
        <Button
          size="sm"
          variant="danger"
          disabled={!selectedClipId}
          onClick={() => selectedClipId && props.onDeleteClip(selectedClipId)}
        >
          Delete piece
        </Button>

        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" active={follow} onClick={() => setFollow((v) => !v)} title="Keep the playhead in view">
            Follow
          </Button>
          <ToolbarDivider />
          <Button variant="ghost" size="sm" onClick={() => setPps((p) => Math.max(6, p / 1.3))} title="Zoom out">
            −
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPps((p) => Math.min(300, p * 1.3))} title="Zoom in">
            +
          </Button>
        </div>
      </div>

      {/* One scroller for both axes: headers stick left, ruler sticks top. */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto bg-[var(--bg-lane)]" onWheel={handleWheel}>
        <div
          className="relative min-w-full"
          style={{ width: HEADER_W + lanesWidth, height: contentHeight }}
          onPointerDown={handleBackgroundPointerDown}
        >
          <div className="sticky top-0 z-30 flex" style={{ height: RULER_H }}>
            <div
              className="sticky left-0 z-40 shrink-0 border-b border-r border-[var(--border)] bg-[var(--bg-panel)]"
              style={{ width: HEADER_W }}
            />
            {/* flex-1 so the ruler and lanes still span the window when the song is short. */}
            <div className="flex-1 border-b border-[var(--border)] bg-[var(--bg-panel)]" style={{ minWidth: lanesWidth }}>
              <Ruler duration={duration} pps={pps} width={lanesWidth} />
            </div>
            {/* Time badge lives in the ruler row so it paints above the ticks but is still
                clipped by the sticky header column when scrolled. */}
            <div
              className="tnum pointer-events-none absolute top-0 -translate-x-1/2 rounded-b px-1 text-[9px] font-medium text-white"
              // Nudged so it isn't sliced in half by the sticky header column at time 0.
              style={{ left: Math.max(playheadX, HEADER_W + 16), background: 'var(--accent)' }}
            >
              {formatTime(currentTime)}
            </div>
          </div>

          {tracks.map((track) => {
            const silenced = track.muted || (anySolo && !track.soloed)
            return (
              <div key={track.id} className="flex" style={{ height: LANE_H }}>
                <div className="sticky left-0 z-20 shrink-0">
                  <TrackHeader
                    track={track}
                    silenced={silenced}
                    onVolumeChange={(v) => props.onVolumeChange(track.id, v)}
                    onPanChange={(v) => props.onPanChange(track.id, v)}
                    onToggleMute={() => props.onToggleMute(track.id)}
                    onToggleSolo={() => props.onToggleSolo(track.id)}
                    onRemove={() => props.onRemoveTrack(track.id)}
                  />
                </div>
                <div
                  className={`relative flex-1 border-b border-[var(--border)] ${silenced ? 'opacity-40' : ''}`}
                  style={{ minWidth: lanesWidth, height: LANE_H }}
                >
                  {clips
                    .filter((c) => c.trackId === track.id)
                    .map((clip) => (
                      <ClipBox
                        key={clip.id}
                        clip={clip}
                        pps={pps}
                        height={LANE_H}
                        selected={clip.id === selectedClipId}
                        color={describeTrack(track.name).color}
                        snap={snap}
                        selectionRange={
                          selection && selection.clipId === clip.id
                            ? { start: selection.start, end: selection.end }
                            : null
                        }
                        onClipClick={props.onClipClick}
                        onSelectRange={props.onSelectRange}
                        onContextMenu={props.onClipContextMenu}
                        onTrimLeft={props.onTrimLeft}
                        onTrimRight={props.onTrimRight}
                        onFade={props.onFade}
                      />
                    ))}
                </div>
              </div>
            )
          })}

          {loop.end - loop.start > 0.01 && (
            <div
              className={`pointer-events-none absolute top-0 z-10 border-x ${
                loop.enabled ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border-strong)] bg-white/[0.03]'
              }`}
              style={{
                left: HEADER_W + loop.start * pps,
                width: (loop.end - loop.start) * pps,
                height: contentHeight,
              }}
            />
          )}

          {/* Playhead: above clips, below the sticky lane headers and ruler. */}
          <div
            onPointerDown={startPlayheadDrag}
            className="group absolute top-0 z-[15]"
            style={{ left: playheadX - 5, width: 11, height: contentHeight, cursor: 'ew-resize' }}
            title="Drag to move the playhead"
          >
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/90 transition-colors group-hover:bg-[var(--accent)]" />
          </div>
        </div>
      </div>
    </div>
  )
}

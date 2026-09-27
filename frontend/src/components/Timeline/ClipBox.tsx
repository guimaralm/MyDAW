import { memo, useEffect, useRef, useState } from 'react'
import { bufferCache } from '../../audio-engine/bufferCache'
import { getCachedPeaks, normalizationScale } from '../../audio-engine/waveformPeaks'
import { startCoalescedDrag } from '../../stores/projectStore'
import type { Clip } from '../../types/project'

interface ClipBoxProps {
  clip: Clip
  pps: number
  height: number
  selected: boolean
  /** Lane colour, derived from the stem kind. */
  color: string
  snap: (time: number) => number
  /** Active range selection, if it belongs to this clip (absolute timeline seconds). */
  selectionRange: { start: number; end: number } | null
  onClipClick: (clipId: string, timeAtClick: number) => void
  onSelectRange: (clipId: string, a: number, b: number) => void
  /** Alt+drag committed a new position for the whole piece. */
  onMoveInTime: (clipId: string, newTimelineStart: number) => void
  onContextMenu: (clipId: string, timeAtClick: number, clientX: number, clientY: number) => void
  onTrimLeft: (clipId: string, newBufferOffset: number) => void
  onTrimRight: (clipId: string, newBufferEnd: number) => void
  onFade: (clipId: string, fade: { fadeIn?: number; fadeOut?: number }) => void
}

const EDGE_PX = 6
const CLICK_THRESHOLD_PX = 3

type DragMode = 'none' | 'trimL' | 'trimR' | 'select' | 'moveTime'

function ClipBoxImpl({
  clip,
  pps,
  height,
  selected,
  color,
  snap,
  selectionRange,
  onClipClick,
  onSelectRange,
  onMoveInTime,
  onContextMenu,
  onTrimLeft,
  onTrimRight,
  onFade,
}: ClipBoxProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [deltaSec, setDeltaSec] = useState(0)
  const [dragMode, setDragMode] = useState<DragMode>('none')
  const [dragSel, setDragSel] = useState<{ a: number; b: number } | null>(null)

  const width = Math.max(1, clip.duration * pps)

  useEffect(() => {
    const canvas = canvasRef.current
    const buffer = bufferCache.get(clip.bufferId)
    if (!canvas || !buffer) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.floor(width))
    const h = height
    canvas.width = w * dpr
    canvas.height = h * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const peaks = getCachedPeaks(clip.bufferId, buffer, clip.bufferOffset, clip.duration, w)
    // Separated stems peak far below full scale, so raw amplitude draws as a flat line.
    // Normalizing to the clip's own peak is what makes the audio readable.
    const scale = normalizationScale(peaks.peak)
    const mid = h / 2
    const inset = 6 // keep the waveform off the clip's border
    const half = Math.max(2, mid - inset)

    const waveColor = clip.muted ? '#5a5a63' : color
    const gradient = ctx.createLinearGradient(0, mid - half, 0, mid + half)
    gradient.addColorStop(0, waveColor)
    gradient.addColorStop(0.5, waveColor)
    gradient.addColorStop(1, waveColor)
    ctx.fillStyle = gradient
    ctx.globalAlpha = clip.muted ? 0.5 : 0.95

    for (let x = 0; x < w; x++) {
      const hi = Math.max(-1, Math.min(1, peaks.max[x] * scale))
      const lo = Math.max(-1, Math.min(1, peaks.min[x] * scale))
      const top = mid - hi * half
      const bottom = mid - lo * half
      ctx.fillRect(x, top, 1, Math.max(1, bottom - top))
    }

    // Centre axis, so silence still reads as a line rather than an empty box.
    ctx.globalAlpha = 0.25
    ctx.fillStyle = waveColor
    ctx.fillRect(0, mid, w, 1)
    ctx.globalAlpha = 1
  }, [clip.bufferId, clip.bufferOffset, clip.duration, clip.muted, color, width, height])

  function timeAtClientX(clientX: number): number {
    const rect = boxRef.current!.getBoundingClientRect()
    return clip.timelineStart + (clientX - rect.left) / pps
  }

  function beginDrag(e: React.PointerEvent, mode: DragMode) {
    e.stopPropagation()
    const startX = e.clientX
    const startTime = timeAtClientX(startX)
    setDragMode(mode)
    if (mode === 'select') setDragSel({ a: startTime, b: startTime })

    function onMoveEvt(ev: PointerEvent) {
      const dSec = (ev.clientX - startX) / pps
      if (mode === 'select') setDragSel({ a: startTime, b: timeAtClientX(ev.clientX) })
      else setDeltaSec(dSec)
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMoveEvt)
      window.removeEventListener('pointerup', onUp)
      const dPx = ev.clientX - startX
      const dSec = dPx / pps
      setDragMode('none')
      setDeltaSec(0)
      setDragSel(null)

      if (mode === 'moveTime') {
        if (Math.abs(dPx) >= CLICK_THRESHOLD_PX) {
          onMoveInTime(clip.id, snap(Math.max(0, clip.timelineStart + dSec)))
        }
      } else if (mode === 'select') {
        if (Math.abs(dPx) < CLICK_THRESHOLD_PX) {
          onClipClick(clip.id, startTime)
        } else {
          const a = snap(Math.min(startTime, timeAtClientX(ev.clientX)))
          const b = snap(Math.max(startTime, timeAtClientX(ev.clientX)))
          onSelectRange(clip.id, a, b)
        }
      } else if (mode === 'trimL') {
        onTrimLeft(clip.id, clip.bufferOffset + dSec)
      } else if (mode === 'trimR') {
        onTrimRight(clip.id, clip.bufferOffset + clip.duration + dSec)
      }
    }
    window.addEventListener('pointermove', onMoveEvt)
    window.addEventListener('pointerup', onUp)
  }

  function beginFadeDrag(e: React.PointerEvent, side: 'in' | 'out') {
    e.stopPropagation()
    // A fade drag fires on every move; coalesce it into one undo step.
    startCoalescedDrag()
    function onMoveEvt(ev: PointerEvent) {
      const rect = boxRef.current!.getBoundingClientRect()
      const localSec = (ev.clientX - rect.left) / pps
      if (side === 'in') onFade(clip.id, { fadeIn: Math.max(0, Math.min(clip.duration, localSec)) })
      else onFade(clip.id, { fadeOut: Math.max(0, Math.min(clip.duration, clip.duration - localSec)) })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMoveEvt)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMoveEvt)
    window.addEventListener('pointerup', onUp)
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return // let right-click go to onContextMenu
    const rect = boxRef.current!.getBoundingClientRect()
    const localX = e.clientX - rect.left
    // Alt+drag slides the whole piece in time; a plain drag selects a range.
    if (e.altKey) beginDrag(e, 'moveTime')
    else if (localX <= EDGE_PX) beginDrag(e, 'trimL')
    else if (localX >= rect.width - EDGE_PX) beginDrag(e, 'trimR')
    else beginDrag(e, 'select')
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu(clip.id, timeAtClientX(e.clientX), e.clientX, e.clientY)
  }

  let renderLeft = clip.timelineStart * pps
  let renderWidth = width
  if (dragMode === 'moveTime') {
    renderLeft = Math.max(0, clip.timelineStart + deltaSec) * pps
  } else if (dragMode === 'trimL') {
    renderLeft = (clip.timelineStart + deltaSec) * pps
    renderWidth = Math.max(2, (clip.duration - deltaSec) * pps)
  } else if (dragMode === 'trimR') {
    renderWidth = Math.max(2, (clip.duration + deltaSec) * pps)
  }

  const fadeInPx = Math.min(width, clip.fadeIn * pps)
  const fadeOutPx = Math.min(width, clip.fadeOut * pps)
  const showFadeHandles = !clip.muted

  // Selection band: live draft while dragging, otherwise the committed selection for this clip.
  const band = dragSel
    ? { start: Math.min(dragSel.a, dragSel.b), end: Math.max(dragSel.a, dragSel.b) }
    : selectionRange
  const bandLeft = band ? (band.start - clip.timelineStart) * pps : 0
  const bandWidth = band ? (band.end - band.start) * pps : 0

  return (
    <div
      ref={boxRef}
      onPointerDown={handlePointerDown}
      onContextMenu={handleContextMenu}
      style={{ left: renderLeft, width: renderWidth, height, cursor: 'text' }}
      className={`group absolute top-0 overflow-hidden rounded-md border transition-colors ${
        selected ? 'border-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/40' : 'border-[var(--border-strong)]'
      } ${clip.muted ? 'bg-[var(--bg-app)]/70' : 'bg-[var(--bg-raised)]/60'}`}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {(fadeInPx > 1 || fadeOutPx > 1) && (
        <svg className="pointer-events-none absolute inset-0" width="100%" height="100%">
          {fadeInPx > 1 && <polygon points={`0,${height} 0,0 ${fadeInPx},0`} fill="rgba(0,0,0,0.55)" />}
          {fadeOutPx > 1 && (
            <polygon points={`${renderWidth - fadeOutPx},0 ${renderWidth},0 ${renderWidth},${height}`} fill="rgba(0,0,0,0.55)" />
          )}
        </svg>
      )}

      {band && bandWidth > 0 && (
        <div
          className="pointer-events-none absolute top-0 border-x border-[var(--accent)] bg-[var(--accent)]/25"
          style={{ left: bandLeft, width: bandWidth, height }}
        />
      )}

      {/* Fade handles only on hover — at rest they read as stray dots on the waveform. */}
      {showFadeHandles && (
        <>
          <div
            onPointerDown={(e) => beginFadeDrag(e, 'in')}
            className="absolute top-1 z-10 h-2.5 w-2.5 -translate-x-1/2 cursor-ew-resize rounded-full border border-white/80 bg-white/90 opacity-0 transition-opacity group-hover:opacity-100"
            style={{ left: Math.max(5, fadeInPx) }}
            title="Fade in"
          />
          <div
            onPointerDown={(e) => beginFadeDrag(e, 'out')}
            className="absolute top-1 z-10 h-2.5 w-2.5 -translate-x-1/2 cursor-ew-resize rounded-full border border-white/80 bg-white/90 opacity-0 transition-opacity group-hover:opacity-100"
            style={{ left: Math.min(renderWidth - 5, renderWidth - fadeOutPx) }}
            title="Fade out"
          />
        </>
      )}

      {clip.muted && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1 text-[10px] text-[var(--text-faint)]">
          Silenced
        </span>
      )}
    </div>
  )
}

export const ClipBox = memo(ClipBoxImpl)

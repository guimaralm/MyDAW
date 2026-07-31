import { useEffect, useRef, useState } from 'react'
import { bufferCache } from '../../audio-engine/bufferCache'
import { computeCompositePeaks, normalizationScale } from '../../audio-engine/waveformPeaks'
import type { Clip } from '../../types/project'

interface CropModalProps {
  clips: Clip[]
  duration: number
  currentTime: number
  isPlaying: boolean
  onPlayFrom: (seconds: number) => void
  onStop: () => void
  onApply: (start: number, end: number) => void
  onClose: () => void
}

const WAVE_W = 720
const WAVE_H = 140

function format(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function parse(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  if (t.includes(':')) {
    const [m, s] = t.split(':')
    const mm = Number(m)
    const ss = Number(s)
    return Number.isNaN(mm) || Number.isNaN(ss) ? null : mm * 60 + ss
  }
  const n = Number(t)
  return Number.isNaN(n) ? null : n
}

export function CropModal({
  clips,
  duration,
  currentTime,
  isPlaying,
  onPlayFrom,
  onStop,
  onApply,
  onClose,
}: CropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(duration)
  const [startText, setStartText] = useState(format(0))

  const pps = WAVE_W / Math.max(0.001, duration)

  useEffect(() => {
    setStartText(format(start))
  }, [start])

  // Draw the whole-song composite waveform once.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = WAVE_W * dpr
    canvas.height = WAVE_H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, WAVE_W, WAVE_H)
    const peaks = computeCompositePeaks(clips, duration, WAVE_W, (id) => bufferCache.get(id))
    const scale = normalizationScale(peaks.peak)
    ctx.fillStyle = '#c084fc'
    const mid = WAVE_H / 2
    const half = mid - 8
    for (let x = 0; x < WAVE_W; x++) {
      const hi = Math.max(-1, Math.min(1, peaks.max[x] * scale))
      const lo = Math.max(-1, Math.min(1, peaks.min[x] * scale))
      const top = mid - hi * half
      const bottom = mid - lo * half
      ctx.fillRect(x, top, 1, Math.max(1, bottom - top))
    }
  }, [clips, duration])

  function beginHandleDrag(e: React.PointerEvent, which: 'start' | 'end') {
    e.preventDefault()
    e.stopPropagation()
    function onMove(ev: PointerEvent) {
      const rect = trackRef.current!.getBoundingClientRect()
      const t = Math.max(0, Math.min(duration, (ev.clientX - rect.left) / pps))
      if (which === 'start') setStart(Math.min(t, end - 0.05))
      else setEnd(Math.max(t, start + 0.05))
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function commitStartText() {
    const parsed = parse(startText)
    if (parsed !== null) setStart(Math.max(0, Math.min(parsed, end - 0.05)))
    else setStartText(format(start))
  }

  const startPx = start * pps
  const endPx = end * pps
  const playheadPx = Math.max(0, Math.min(WAVE_W, currentTime * pps))

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onPointerDown={onClose}>
      <div
        className="flex flex-col gap-4 rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-200">Recortar canción</h2>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-300">
            ✕
          </button>
        </div>

        <div ref={trackRef} className="relative select-none" style={{ width: WAVE_W, height: WAVE_H }}>
          <canvas ref={canvasRef} style={{ width: WAVE_W, height: WAVE_H, display: 'block' }} className="rounded bg-neutral-950" />

          {/* Dim the cropped-out regions. */}
          <div className="pointer-events-none absolute top-0 h-full bg-black/60" style={{ left: 0, width: startPx }} />
          <div className="pointer-events-none absolute top-0 h-full bg-black/60" style={{ left: endPx, width: WAVE_W - endPx }} />

          {/* Kept region outline. */}
          <div
            className="pointer-events-none absolute top-0 h-full border-x-2 border-purple-400"
            style={{ left: startPx, width: endPx - startPx }}
          />

          {/* Start / end draggers. */}
          <div
            onPointerDown={(e) => beginHandleDrag(e, 'start')}
            className="absolute top-0 h-full w-3 -translate-x-1/2 cursor-ew-resize"
            style={{ left: startPx }}
            title="Inicio"
          >
            <div className="mx-auto h-full w-1 bg-purple-400" />
          </div>
          <div
            onPointerDown={(e) => beginHandleDrag(e, 'end')}
            className="absolute top-0 h-full w-3 -translate-x-1/2 cursor-ew-resize"
            style={{ left: endPx }}
            title="Fin"
          >
            <div className="mx-auto h-full w-1 bg-purple-400" />
          </div>

          {/* Preview playhead. */}
          <div className="pointer-events-none absolute top-0 h-full w-px bg-white" style={{ left: playheadPx }} />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400">
          <button
            type="button"
            onClick={() => (isPlaying ? onStop() : onPlayFrom(start))}
            className="rounded bg-purple-600 px-3 py-1.5 font-medium text-white hover:bg-purple-500"
          >
            {isPlaying ? 'Detener' : '▶ Reproducir desde el inicio'}
          </button>
          <label className="flex items-center gap-1">
            Inicio
            <input
              value={startText}
              onChange={(e) => setStartText(e.target.value)}
              onBlur={commitStartText}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitStartText()
              }}
              className="w-16 rounded bg-neutral-800 px-1 py-0.5 text-center font-mono text-neutral-200"
              title="Inicio (m:ss)"
            />
          </label>
          <span className="font-mono text-neutral-500">
            Fin {format(end)} · dura {format(end - start)}
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onApply(start, end)}
            className="rounded bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500"
          >
            Aplicar recorte
          </button>
        </div>
      </div>
    </div>
  )
}

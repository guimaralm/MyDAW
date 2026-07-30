import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LoopRegion } from '../../App'
import type { Clip, Track } from '../../types/project'
import { ClipBox } from './ClipBox'

const LANE_H = 88
const RULER_H = 24
const HEADER_W = 184

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

function Ruler({ duration, pps }: { duration: number; pps: number }) {
  const step = pps >= 60 ? 1 : pps >= 20 ? 5 : 10
  const ticks: number[] = []
  for (let t = 0; t <= duration + step; t += step) ticks.push(t)
  return (
    <div className="relative border-b border-neutral-700" style={{ height: RULER_H }}>
      {ticks.map((t) => (
        <div key={t} className="absolute top-0 h-full border-l border-neutral-700" style={{ left: t * pps }}>
          <span className="ml-1 text-[9px] text-neutral-500">
            {Math.floor(t / 60)}:{(t % 60).toString().padStart(2, '0')}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ArrangementView(props: ArrangementViewProps) {
  const { tracks, clips, currentTime, isPlaying, selectedClipId, selection, loop } = props
  const [pps, setPps] = useState(40)
  const [follow, setFollow] = useState(true)
  const innerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const zoomAnchor = useRef<{ time: number; cursorX: number } | null>(null)

  const duration = clips.reduce((m, c) => Math.max(m, c.timelineStart + c.duration), 0)
  const totalWidth = Math.max(400, (duration + 4) * pps)
  const totalHeight = RULER_H + tracks.length * LANE_H
  const anySolo = tracks.some((t) => t.soloed)

  useEffect(() => {
    if (!follow || !isPlaying || !scrollRef.current) return
    const el = scrollRef.current
    const x = currentTime * pps
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 40) {
      el.scrollLeft = x - el.clientWidth / 2
    }
  }, [currentTime, follow, isPlaying, pps])

  useLayoutEffect(() => {
    if (!zoomAnchor.current || !scrollRef.current) return
    const { time, cursorX } = zoomAnchor.current
    scrollRef.current.scrollLeft = time * pps - cursorX
    zoomAnchor.current = null
  }, [pps])

  function handleWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const el = scrollRef.current
    if (!el) return
    const cursorX = e.clientX - el.getBoundingClientRect().left
    const time = (el.scrollLeft + cursorX) / pps
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const next = Math.max(10, Math.min(300, pps * factor))
    zoomAnchor.current = { time, cursorX }
    setPps(next)
  }

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

  function timeFromEvent(clientX: number): number {
    const rect = innerRef.current!.getBoundingClientRect()
    return Math.max(0, (clientX - rect.left) / pps)
  }

  function handleBackgroundPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || !innerRef.current) return
    // Shift+drag sets the loop region; a plain click seeks and clears the selection.
    if (e.shiftKey) {
      const start = timeFromEvent(e.clientX)
      props.onLoopChange({ enabled: true, start, end: start })
      function onMoveEvt(ev: PointerEvent) {
        const t = timeFromEvent(ev.clientX)
        props.onLoopChange({ enabled: true, start: Math.min(start, t), end: Math.max(start, t) })
      }
      function onUp() {
        window.removeEventListener('pointermove', onMoveEvt)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMoveEvt)
      window.addEventListener('pointerup', onUp)
      return
    }
    props.onSeek(timeFromEvent(e.clientX))
    props.onClearSelection()
  }

  function startPlayheadDrag(e: React.PointerEvent) {
    e.stopPropagation()
    props.onScrubStart()
    function onMoveEvt(ev: PointerEvent) {
      props.onSeek(timeFromEvent(ev.clientX))
    }
    function onUp() {
      window.removeEventListener('pointermove', onMoveEvt)
      window.removeEventListener('pointerup', onUp)
      props.onScrubEnd()
    }
    window.addEventListener('pointermove', onMoveEvt)
    window.addEventListener('pointerup', onUp)
  }

  if (tracks.length === 0) {
    return (
      <p className="rounded bg-neutral-900 px-4 py-6 text-center text-xs text-neutral-500">
        Todavía no hay pistas. Importá una o más canciones/stems arriba.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={props.onCutAtPlayhead}
          className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
          title="Cortar todas las pistas en el cursor (⌘E)"
        >
          Cortar en cursor
        </button>
        <button
          type="button"
          disabled={!selectedClipId}
          onClick={() => selectedClipId && props.onDeleteClip(selectedClipId)}
          className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700 disabled:opacity-40"
        >
          Borrar pieza
        </button>
        <button
          type="button"
          disabled={!selection}
          onClick={props.onCropToSelection}
          className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700 disabled:opacity-40"
          title="Recortar la canción a la selección actual"
        >
          Crop
        </button>
        <button
          type="button"
          onClick={props.onCropAllSong}
          className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
          title="Recortar inicio/fin de toda la canción"
        >
          Crop all song
        </button>
        <button
          type="button"
          onClick={() => setFollow((v) => !v)}
          className={`rounded px-2 py-1 text-xs ${follow ? 'bg-purple-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
          title="Seguir el cursor de reproducción"
        >
          Seguir
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPps((p) => Math.max(10, p - 10))}
            className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
          >
            −
          </button>
          <span className="text-[10px] text-neutral-500">zoom</span>
          <button
            type="button"
            onClick={() => setPps((p) => Math.min(300, p + 10))}
            className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex">
        <div className="shrink-0" style={{ width: HEADER_W }}>
          <div style={{ height: RULER_H }} />
          {tracks.map((track) => {
            const silenced = track.muted || (anySolo && !track.soloed)
            return (
              <div
                key={track.id}
                className={`flex flex-col justify-center gap-1 border-b border-neutral-800 bg-neutral-800/40 px-2 ${silenced ? 'opacity-50' : ''}`}
                style={{ height: LANE_H }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-xs text-neutral-200">{track.name}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => props.onToggleMute(track.id)}
                      className={`rounded px-1.5 text-[10px] ${track.muted ? 'bg-red-500 text-white' : 'bg-neutral-700 text-neutral-300'}`}
                      title="Mute"
                    >
                      M
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onToggleSolo(track.id)}
                      className={`rounded px-1.5 text-[10px] ${track.soloed ? 'bg-yellow-400 text-black' : 'bg-neutral-700 text-neutral-300'}`}
                      title="Solo"
                    >
                      S
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onRemoveTrack(track.id)}
                      className="rounded px-1 text-[10px] text-neutral-500 hover:text-red-400"
                      title="Quitar pista"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="range"
                    min={-60}
                    max={6}
                    step={0.5}
                    value={linToDb(track.volume)}
                    onChange={(e) => props.onVolumeChange(track.id, dbToLin(Number(e.target.value)))}
                    onDoubleClick={() => props.onVolumeChange(track.id, 1)}
                    className="w-full accent-purple-500"
                    title="Volumen (doble-click = 0dB)"
                  />
                  <span className="w-10 shrink-0 text-right font-mono text-[9px] text-neutral-500">
                    {linToDb(track.volume) <= -60 ? '-∞' : linToDb(track.volume).toFixed(0)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[8px] uppercase text-neutral-600">pan</span>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={track.pan ?? 0}
                    onChange={(e) => props.onPanChange(track.id, Number(e.target.value))}
                    onDoubleClick={() => props.onPanChange(track.id, 0)}
                    className="w-full accent-sky-500"
                    title="Panorama (doble-click = centro)"
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex-1 overflow-x-auto" ref={scrollRef} onWheel={handleWheel}>
          <div ref={innerRef} className="relative" style={{ width: totalWidth }} onPointerDown={handleBackgroundPointerDown}>
            <Ruler duration={duration} pps={pps} />
            {tracks.map((track) => {
              const silenced = track.muted || (anySolo && !track.soloed)
              return (
                <div key={track.id} className={`relative border-b border-neutral-800 ${silenced ? 'opacity-40' : ''}`} style={{ height: LANE_H }}>
                  {clips
                    .filter((c) => c.trackId === track.id)
                    .map((clip) => (
                      <ClipBox
                        key={clip.id}
                        clip={clip}
                        pps={pps}
                        height={LANE_H}
                        selected={clip.id === selectedClipId}
                        snap={snap}
                        selectionRange={selection && selection.clipId === clip.id ? { start: selection.start, end: selection.end } : null}
                        onClipClick={props.onClipClick}
                        onSelectRange={props.onSelectRange}
                        onContextMenu={props.onClipContextMenu}
                        onTrimLeft={props.onTrimLeft}
                        onTrimRight={props.onTrimRight}
                        onFade={props.onFade}
                      />
                    ))}
                </div>
              )
            })}

            {loop.end - loop.start > 0.01 && (
              <div
                className={`pointer-events-none absolute top-0 z-10 border-x ${loop.enabled ? 'border-purple-400 bg-purple-500/10' : 'border-neutral-600 bg-neutral-500/5'}`}
                style={{ left: loop.start * pps, width: (loop.end - loop.start) * pps, height: totalHeight }}
              />
            )}

            <div
              onPointerDown={startPlayheadDrag}
              className="group absolute top-0 z-20"
              style={{ left: currentTime * pps - 4, width: 9, height: totalHeight, cursor: 'ew-resize' }}
              title="Arrastrá para mover la línea de reproducción"
            >
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white group-hover:bg-purple-300" />
              <div className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rotate-45 bg-white group-hover:bg-purple-300" style={{ marginTop: -1 }} />
            </div>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-neutral-600">
        Arrastrar sobre un clip = seleccionar trozo · click derecho = acciones · Espacio = play · ⌘E = cortar en cursor · Supr = borrar · Shift+arrastrar = loop · ⌘/pinch+scroll = zoom
      </p>
    </div>
  )
}

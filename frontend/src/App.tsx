import { useEffect, useRef, useState } from 'react'
import { audioEngine } from './audio-engine/AudioEngine'
import { bufferCache } from './audio-engine/bufferCache'
import { renderMix } from './audio-engine/offlineRender'
import { ExportDialog } from './components/ExportDialog/ExportDialog'
import { ImportPanel } from './components/ImportPanel/ImportPanel'
import { StemJobPanel } from './components/ImportPanel/StemJobPanel'
import { MasteringPanel } from './components/MasteringPanel/MasteringPanel'
import { ProjectPanel } from './components/ProjectPanel/ProjectPanel'
import { ArrangementView, type RangeSelection } from './components/Timeline/ArrangementView'
import { ClipInspector } from './components/Timeline/ClipInspector'
import { ContextMenu, type MenuItem } from './components/Timeline/ContextMenu'
import { CropModal } from './components/Timeline/CropModal'
import { TransportBar } from './components/TransportBar/TransportBar'
import { audioBufferToMp3Blob, audioBufferToWavBlob, downloadBlob } from './services/exportEncoders'
import { deleteProject, listProjects, loadProject, saveProject } from './services/persistence'
import { getStemUrl, pollJobUntilDone, submitSeparationJob } from './services/stemSeparationApi'
import { useMasteringStore } from './stores/masteringStore'
import { useProjectStore } from './stores/projectStore'
import { useStemJobStore } from './stores/stemJobStore'

const CUT_MARGIN = 0.05

export interface LoopRegion {
  enabled: boolean
  start: number
  end: number
}

function App() {
  const tracks = useProjectStore((s) => s.tracks)
  const clips = useProjectStore((s) => s.clips)
  const addTrackWithClip = useProjectStore((s) => s.addTrackWithClip)
  const removeTrack = useProjectStore((s) => s.removeTrack)
  const setTrackVolume = useProjectStore((s) => s.setTrackVolume)
  const setTrackPan = useProjectStore((s) => s.setTrackPan)
  const toggleTrackMute = useProjectStore((s) => s.toggleTrackMute)
  const toggleTrackSolo = useProjectStore((s) => s.toggleTrackSolo)
  const trimClipLeft = useProjectStore((s) => s.trimClipLeft)
  const trimClipRight = useProjectStore((s) => s.trimClipRight)
  const setClipFade = useProjectStore((s) => s.setClipFade)
  const setClipGainDb = useProjectStore((s) => s.setClipGainDb)
  const setClipMuted = useProjectStore((s) => s.setClipMuted)
  const splitClip = useProjectStore((s) => s.splitClip)
  const splitClipsAtTime = useProjectStore((s) => s.splitClipsAtTime)
  const silenceRange = useProjectStore((s) => s.silenceRange)
  const deleteRange = useProjectStore((s) => s.deleteRange)
  const moveRangeToNewTrack = useProjectStore((s) => s.moveRangeToNewTrack)
  const removeClip = useProjectStore((s) => s.removeClip)
  const moveClipToNewTrack = useProjectStore((s) => s.moveClipToNewTrack)
  const cropSong = useProjectStore((s) => s.cropSong)

  const stemJobs = useStemJobStore((s) => s.jobs)
  const addStemJob = useStemJobStore((s) => s.addJob)
  const updateStemJob = useStemJobStore((s) => s.updateJob)
  const removeStemJob = useStemJobStore((s) => s.removeJob)

  const mastering = useMasteringStore()

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [momentaryLufs, setMomentaryLufs] = useState(-Infinity)
  const [shortTermLufs, setShortTermLufs] = useState(-Infinity)
  const [integratedLufs, setIntegratedLufs] = useState(-Infinity)
  const [reduction, setReduction] = useState({ compressor: 0, limiter: 0 })
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [selection, setSelection] = useState<RangeSelection | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string; time: number } | null>(null)
  const [bypassed, setBypassed] = useState(false)
  const [loop, setLoop] = useState<LoopRegion>({ enabled: false, start: 0, end: 0 })
  const [showImport, setShowImport] = useState(true)
  const [showCropModal, setShowCropModal] = useState(false)

  const rafRef = useRef<number | null>(null)
  const loopRef = useRef(loop)
  loopRef.current = loop

  const selectedClip = clips.find((c) => c.id === selectedClipId) ?? null

  useEffect(() => {
    audioEngine.setClips(clips)
    setDuration(audioEngine.getDuration())
  }, [clips])

  // Collapse the big import dropzone once there's material to work on; the timeline is king.
  useEffect(() => {
    if (tracks.length > 0) setShowImport(false)
  }, [tracks.length])

  async function addTrackFromStem(fileNameLabel: string, stemFile: File) {
    const buffer = await audioEngine.decodeFile(stemFile)
    const bufferId = crypto.randomUUID()
    const trackId = crypto.randomUUID()
    bufferCache.set(bufferId, buffer)
    audioEngine.addTrack(trackId, 1, 0)
    addTrackWithClip(
      { id: trackId, name: fileNameLabel, volume: 1, muted: false, soloed: false, pan: 0 },
      {
        id: crypto.randomUUID(),
        trackId,
        bufferId,
        timelineStart: 0,
        bufferOffset: 0,
        duration: buffer.duration,
        fadeIn: 0,
        fadeOut: 0,
        gainDb: 0,
        muted: false,
      },
    )
  }

  async function handleFilesSelected(files: File[]) {
    for (const file of files) {
      const localJobId = crypto.randomUUID()
      addStemJob({ id: localJobId, fileName: file.name, status: 'uploading' })
      try {
        const job = await submitSeparationJob(file)
        updateStemJob(localJobId, { status: job.status })
        const finalJob = await pollJobUntilDone(job.job_id, {
          onUpdate: (j) => updateStemJob(localJobId, { status: j.status }),
        })
        if (finalJob.status === 'error') {
          updateStemJob(localJobId, { status: 'error', error: finalJob.error ?? 'error desconocido' })
          continue
        }
        for (const stemName of finalJob.stems ?? []) {
          const res = await fetch(getStemUrl(finalJob.job_id, stemName))
          const blob = await res.blob()
          const stemFile = new File([blob], `${stemName}.wav`, { type: 'audio/wav' })
          await addTrackFromStem(`${file.name} · ${stemName}`, stemFile)
        }
        removeStemJob(localJobId)
      } catch (err) {
        updateStemJob(localJobId, { status: 'error', error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  function handleSeek(seconds: number) {
    audioEngine.seek(seconds)
    setCurrentTime(audioEngine.getCurrentTime())
  }

  const wasPlayingBeforeScrub = useRef(false)
  function handleScrubStart() {
    wasPlayingBeforeScrub.current = audioEngine.isPlaying()
    if (audioEngine.isPlaying()) {
      audioEngine.pause()
      setIsPlaying(false)
    }
  }
  function handleScrubEnd() {
    if (wasPlayingBeforeScrub.current) startPlayback()
  }

  function startPlayback() {
    audioEngine.onEnded(() => {
      setIsPlaying(false)
      setCurrentTime(audioEngine.getCurrentTime())
    })
    audioEngine.resetIntegratedLufs()
    audioEngine.play()
    setIsPlaying(true)
  }

  function handleTogglePlay() {
    if (audioEngine.isPlaying()) {
      audioEngine.pause()
      setIsPlaying(false)
      setReduction({ compressor: 0, limiter: 0 })
    } else {
      startPlayback()
    }
  }

  function handleVolumeChange(trackId: string, volume: number) {
    setTrackVolume(trackId, volume)
  }

  function handleCutAtPlayhead() {
    const t = audioEngine.getCurrentTime()
    const cuts = clips
      .filter((c) => c.timelineStart + CUT_MARGIN < t && t < c.timelineStart + c.duration - CUT_MARGIN)
      .map((c) => ({ clipId: c.id, newClipId: crypto.randomUUID() }))
    if (cuts.length) splitClipsAtTime(t, cuts)
  }

  // Click on a clip (no drag): move the playhead there and select the clip for the inspector.
  function handleClipClick(clipId: string, timeAtClick: number) {
    handleSeek(timeAtClick)
    setSelectedClipId(clipId)
    setSelection(null)
  }

  function handleSelectRange(clipId: string, a: number, b: number) {
    setSelectedClipId(clipId)
    setSelection({ clipId, start: a, end: b })
  }

  // --- Actions invoked from the right-click context menu ---

  function actSilenceRange(clipId: string, a: number, b: number) {
    const clip = clips.find((c) => c.id === clipId)
    if (clip) silenceRange(clip.trackId, a, b, [crypto.randomUUID(), crypto.randomUUID()])
    setSelection(null)
  }

  function actDeleteRange(clipId: string, a: number, b: number) {
    const clip = clips.find((c) => c.id === clipId)
    if (clip) deleteRange(clip.trackId, a, b, [crypto.randomUUID(), crypto.randomUUID()])
    setSelection(null)
  }

  function actMoveRangeToNewTrack(clipId: string, a: number, b: number) {
    const clip = clips.find((c) => c.id === clipId)
    if (!clip) return
    const source = tracks.find((t) => t.id === clip.trackId)
    const newTrackId = crypto.randomUUID()
    audioEngine.addTrack(newTrackId, source?.volume ?? 1, source?.pan ?? 0)
    moveRangeToNewTrack(clip.trackId, a, b, newTrackId, source ? `${source.name} (movido)` : 'movido', [
      crypto.randomUUID(),
      crypto.randomUUID(),
    ])
    setSelection(null)
  }

  function actSplitAt(clipId: string, time: number) {
    splitClip(clipId, time, crypto.randomUUID())
  }

  function actMoveClipToNewTrack(clipId: string) {
    const clip = clips.find((c) => c.id === clipId)
    if (!clip) return
    const source = tracks.find((t) => t.id === clip.trackId)
    const newTrackId = crypto.randomUUID()
    audioEngine.addTrack(newTrackId, source?.volume ?? 1, source?.pan ?? 0)
    // Same time position on a fresh lane.
    moveClipToNewTrack(clipId, newTrackId, source ? `${source.name} (movido)` : 'movido', clip.timelineStart)
  }

  function buildContextMenuItems(clipId: string, time: number): MenuItem[] {
    const clip = clips.find((c) => c.id === clipId)
    const items: MenuItem[] = []
    if (selection && selection.clipId === clipId && selection.end - selection.start > 0.01) {
      const { start, end } = selection
      items.push(
        { label: 'Mover selección a pista nueva', onClick: () => actMoveRangeToNewTrack(clipId, start, end) },
        { label: 'Silenciar selección', onClick: () => actSilenceRange(clipId, start, end) },
        { label: 'Borrar selección', onClick: () => actDeleteRange(clipId, start, end), danger: true },
      )
    }
    items.push(
      { label: 'Dividir aquí', onClick: () => actSplitAt(clipId, time) },
      { label: 'Mover pieza a pista nueva', onClick: () => actMoveClipToNewTrack(clipId) },
      {
        label: clip?.muted ? 'Activar sonido de la pieza' : 'Silenciar pieza',
        onClick: () => setClipMuted(clipId, !clip?.muted),
      },
      { label: 'Borrar pieza', onClick: () => handleDeleteClip(clipId), danger: true },
    )
    return items
  }

  function handleClipContextMenu(clipId: string, time: number, clientX: number, clientY: number) {
    setContextMenu({ x: clientX, y: clientY, clipId, time })
  }

  // Crop the whole song to a [start,end] region (re-based to 0) across all tracks.
  function applyCrop(start: number, end: number) {
    cropSong(start, end)
    setSelection(null)
    setSelectedClipId(null)
    audioEngine.stop()
    setIsPlaying(false)
    setCurrentTime(0)
    setShowCropModal(false)
  }

  function handleCropToSelection() {
    if (selection && selection.end - selection.start > 0.01) applyCrop(selection.start, selection.end)
  }

  function handlePlayFrom(seconds: number) {
    handleSeek(seconds)
    startPlayback()
  }

  function handleDeleteClip(clipId: string) {
    removeClip(clipId)
    if (selectedClipId === clipId) setSelectedClipId(null)
    if (selection?.clipId === clipId) setSelection(null)
  }

  function handleRemoveTrack(trackId: string) {
    const trackClips = clips.filter((c) => c.trackId === trackId)
    audioEngine.removeTrack(trackId)
    removeTrack(trackId)
    if (selectedClip && selectedClip.trackId === trackId) setSelectedClipId(null)
    const remaining = new Set(clips.filter((c) => c.trackId !== trackId).map((c) => c.bufferId))
    for (const c of trackClips) if (!remaining.has(c.bufferId)) bufferCache.delete(c.bufferId)
  }

  function handleToggleBypass() {
    const next = !bypassed
    setBypassed(next)
    audioEngine.setChainBypass(next)
  }

  function handleMasterGainChange(db: number) {
    mastering.setMasterGainDb(db)
    audioEngine.setMasterGainDb(db)
  }

  // Per-frame loop: advance the playhead readout, wrap at the loop point, and poll meters.
  useEffect(() => {
    function tick() {
      if (audioEngine.isPlaying()) {
        const t = audioEngine.getCurrentTime()
        const lp = loopRef.current
        if (lp.enabled && lp.end - lp.start > 0.05 && t >= lp.end) {
          audioEngine.seek(lp.start)
          setCurrentTime(lp.start)
        } else {
          setCurrentTime(t)
        }
        setReduction(audioEngine.getReductionDb())
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  useEffect(() => {
    audioEngine.onLufsUpdate((reading) => {
      setMomentaryLufs(reading.momentaryLufs)
      setShortTermLufs(reading.shortTermLufs)
      setIntegratedLufs(reading.integratedLufs)
    })
    return () => audioEngine.onLufsUpdate(null)
  }, [])

  // Push effective per-track gain (volume folded with mute/solo) and pan to the engine.
  useEffect(() => {
    const anySolo = tracks.some((t) => t.soloed)
    for (const t of tracks) {
      const silenced = t.muted || (anySolo && !t.soloed)
      audioEngine.setTrackVolume(t.id, silenced ? 0 : t.volume)
      audioEngine.setTrackPan(t.id, t.pan ?? 0)
    }
  }, [tracks])

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const mod = e.metaKey || e.ctrlKey
      if (e.code === 'Space') {
        e.preventDefault()
        handleTogglePlay()
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) useProjectStore.temporal.getState().redo()
        else useProjectStore.temporal.getState().undo()
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        handleCutAtPlayhead()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Prefer deleting the range selection; otherwise the whole selected piece.
        if (selection && selection.end - selection.start > 0.01) {
          e.preventDefault()
          actDeleteRange(selection.clipId, selection.start, selection.end)
        } else if (selectedClipId) {
          e.preventDefault()
          handleDeleteClip(selectedClipId)
        }
      } else if (e.key === 'Home') {
        e.preventDefault()
        handleSeek(0)
      } else if (e.key === 'Escape') {
        setSelection(null)
        setContextMenu(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, selectedClipId, selection, isPlaying])

  async function handleExportWav() {
    const buffer = await renderMix(tracks, clips, mastering)
    downloadBlob(audioBufferToWavBlob(buffer), 'mezcla.wav')
  }

  async function handleExportMp3() {
    const buffer = await renderMix(tracks, clips, mastering)
    const blob = await audioBufferToMp3Blob(buffer)
    downloadBlob(blob, 'mezcla.mp3')
  }

  async function handleSaveProject(name: string) {
    const bufferIds = Array.from(new Set(clips.map((c) => c.bufferId)))
    const buffers = new Map<string, AudioBuffer>()
    for (const id of bufferIds) {
      const buf = bufferCache.get(id)
      if (buf) buffers.set(id, buf)
    }
    await saveProject(
      {
        id: crypto.randomUUID(),
        name,
        savedAt: Date.now(),
        tracks,
        clips,
        mastering: {
          eqLowDb: mastering.eqLowDb,
          eqMidDb: mastering.eqMidDb,
          eqHighDb: mastering.eqHighDb,
          compressorThreshold: mastering.compressorThreshold,
          compressorRatio: mastering.compressorRatio,
          limiterCeilingDb: mastering.limiterCeilingDb,
          masterGainDb: mastering.masterGainDb,
        },
        bufferIds,
      },
      buffers,
    )
  }

  async function handleLoadProject(id: string) {
    const result = await loadProject(id)
    if (!result) return

    audioEngine.stop()
    setIsPlaying(false)
    setSelectedClipId(null)
    for (const t of tracks) audioEngine.removeTrack(t.id)

    for (const [bufferId, buffer] of result.buffers) bufferCache.set(bufferId, buffer)
    for (const track of result.record.tracks) audioEngine.addTrack(track.id, track.volume, track.pan ?? 0)

    useProjectStore.setState({ tracks: result.record.tracks, clips: result.record.clips })
    useProjectStore.temporal.getState().clear()

    const m = { masterGainDb: 0, ...result.record.mastering }
    useMasteringStore.setState(m)
    audioEngine.setEqGainDb('low', m.eqLowDb)
    audioEngine.setEqGainDb('mid', m.eqMidDb)
    audioEngine.setEqGainDb('high', m.eqHighDb)
    audioEngine.setCompressorParams({ threshold: m.compressorThreshold, ratio: m.compressorRatio })
    audioEngine.setLimiterCeilingDb(m.limiterCeilingDb)
    audioEngine.setMasterGainDb(m.masterGainDb)

    setSelection(null)
    setContextMenu(null)
    setCurrentTime(0)
  }

  async function handleDeleteProject(id: string) {
    await deleteProject(id)
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-3 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium text-neutral-200">DAU — mastering DAW</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            className="rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
          >
            + Importar
          </button>
          <button
            type="button"
            onClick={() => useProjectStore.temporal.getState().undo()}
            className="rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
            title="Deshacer (⌘Z)"
          >
            Deshacer
          </button>
          <button
            type="button"
            onClick={() => useProjectStore.temporal.getState().redo()}
            className="rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
            title="Rehacer (⇧⌘Z)"
          >
            Rehacer
          </button>
        </div>
      </div>

      {showImport && (
        <>
          <ImportPanel onFilesSelected={handleFilesSelected} />
          <StemJobPanel jobs={stemJobs} />
        </>
      )}
      {!showImport && stemJobs.length > 0 && <StemJobPanel jobs={stemJobs} />}

      <ArrangementView
        tracks={tracks}
        clips={clips}
        currentTime={currentTime}
        isPlaying={isPlaying}
        selectedClipId={selectedClipId}
        selection={selection}
        loop={loop}
        onClipClick={handleClipClick}
        onSelectRange={handleSelectRange}
        onClipContextMenu={handleClipContextMenu}
        onSeek={handleSeek}
        onScrubStart={handleScrubStart}
        onScrubEnd={handleScrubEnd}
        onCutAtPlayhead={handleCutAtPlayhead}
        onTrimLeft={trimClipLeft}
        onTrimRight={trimClipRight}
        onFade={setClipFade}
        onDeleteClip={handleDeleteClip}
        onVolumeChange={handleVolumeChange}
        onPanChange={setTrackPan}
        onToggleMute={toggleTrackMute}
        onToggleSolo={toggleTrackSolo}
        onRemoveTrack={handleRemoveTrack}
        onLoopChange={setLoop}
        onClearSelection={() => setSelection(null)}
        onCropToSelection={handleCropToSelection}
        onCropAllSong={() => setShowCropModal(true)}
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextMenuItems(contextMenu.clipId, contextMenu.time)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {showCropModal && (
        <CropModal
          clips={clips}
          duration={duration}
          currentTime={currentTime}
          isPlaying={isPlaying}
          onPlayFrom={handlePlayFrom}
          onStop={() => {
            audioEngine.pause()
            setIsPlaying(false)
          }}
          onApply={applyCrop}
          onClose={() => setShowCropModal(false)}
        />
      )}

      {selectedClip && (
        <ClipInspector
          clip={selectedClip}
          onFadeChange={(fade) => setClipFade(selectedClip.id, fade)}
          onGainChange={(db) => setClipGainDb(selectedClip.id, db)}
          onToggleMuted={() => setClipMuted(selectedClip.id, !selectedClip.muted)}
        />
      )}

      <TransportBar
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        loopEnabled={loop.enabled}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
        onToggleLoop={() => setLoop((l) => ({ ...l, enabled: !l.enabled }))}
      />

      <MasteringPanel
        eqLowDb={mastering.eqLowDb}
        eqMidDb={mastering.eqMidDb}
        eqHighDb={mastering.eqHighDb}
        compressorThreshold={mastering.compressorThreshold}
        compressorRatio={mastering.compressorRatio}
        limiterCeilingDb={mastering.limiterCeilingDb}
        masterGainDb={mastering.masterGainDb}
        bypassed={bypassed}
        momentaryLufs={momentaryLufs}
        shortTermLufs={shortTermLufs}
        integratedLufs={integratedLufs}
        compressorReductionDb={reduction.compressor}
        limiterReductionDb={reduction.limiter}
        onToggleBypass={handleToggleBypass}
        onMasterGainChange={handleMasterGainChange}
        onEqLowChange={(v) => {
          mastering.setEqLowDb(v)
          audioEngine.setEqGainDb('low', v)
        }}
        onEqMidChange={(v) => {
          mastering.setEqMidDb(v)
          audioEngine.setEqGainDb('mid', v)
        }}
        onEqHighChange={(v) => {
          mastering.setEqHighDb(v)
          audioEngine.setEqGainDb('high', v)
        }}
        onCompressorThresholdChange={(v) => {
          mastering.setCompressorThreshold(v)
          audioEngine.setCompressorParams({ threshold: v })
        }}
        onCompressorRatioChange={(v) => {
          mastering.setCompressorRatio(v)
          audioEngine.setCompressorParams({ ratio: v })
        }}
        onLimiterCeilingChange={(v) => {
          mastering.setLimiterCeilingDb(v)
          audioEngine.setLimiterCeilingDb(v)
        }}
      />

      <ExportDialog onExportWav={handleExportWav} onExportMp3={handleExportMp3} disabled={clips.length === 0} />

      <ProjectPanel
        onSave={handleSaveProject}
        onLoad={handleLoadProject}
        onDelete={handleDeleteProject}
        listProjects={listProjects}
        disabled={clips.length === 0}
      />
    </div>
  )
}

export default App

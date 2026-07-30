import { bufferCache } from './bufferCache'
import { createMasterChain, type MasterChain } from './masterChain'
import type { Clip } from '../types/project'

export interface LufsReading {
  momentaryLufs: number
  shortTermLufs: number
  integratedLufs: number
}

interface EngineTrackNode {
  id: string
  gainNode: GainNode
  pannerNode: StereoPannerNode
}

interface ActiveSource {
  source: AudioBufferSourceNode
  clipGain: GainNode
}

type PlaybackState =
  | { playing: false; pausedAt: number }
  | { playing: true; contextStartTime: number; timelineStartOffset: number }

/**
 * Owns the single AudioContext shared by every track. All clip sources for a given play()
 * call are started relative to the same ctx.currentTime snapshot, which is what keeps
 * multiple tracks/clips sample-accurate relative to each other — the audio clock (not
 * requestAnimationFrame/setTimeout) is the only source of truth for playhead position.
 *
 * Clips are non-destructive: they only reference a bufferId + offset/duration into it, so
 * trimming/splitting never touches the decoded AudioBuffer itself.
 */
class AudioEngine {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private masterChain: MasterChain | null = null
  private trackNodes = new Map<string, EngineTrackNode>()
  private clips: Clip[] = []
  private activeSources: ActiveSource[] = []
  private state: PlaybackState = { playing: false, pausedAt: 0 }
  private onEndedCallback: (() => void) | null = null
  private lufsCallback: ((reading: LufsReading) => void) | null = null
  private limiterReductionDb = 0
  private bypassed = false

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext()
      this.masterGain = this.context.createGain()
      // Temporary direct passthrough to destination until the async mastering chain (which
      // needs to load AudioWorklet modules) finishes initializing — see initMasterChain().
      this.masterGain.connect(this.context.destination)
      void this.initMasterChain()
    }
    if (this.context.state === 'suspended') {
      void this.context.resume()
    }
    return this.context
  }

  private async initMasterChain(): Promise<void> {
    const ctx = this.context!
    const chain = await createMasterChain(ctx)
    this.masterGain!.disconnect()
    this.masterGain!.connect(chain.input)
    chain.lufsMeter.port.onmessage = (event: MessageEvent<LufsReading>) => {
      this.lufsCallback?.(event.data)
    }
    chain.limiter.port.onmessage = (event: MessageEvent<{ reductionDb?: number }>) => {
      if (typeof event.data.reductionDb === 'number') this.limiterReductionDb = event.data.reductionDb
    }
    this.masterChain = chain
    if (this.bypassed) this.applyBypass()
  }

  /** Master output trim (pre-chain), in dB. Affects how hard the mix hits the mastering chain. */
  setMasterGainDb(db: number): void {
    if (!this.masterGain) return
    this.masterGain.gain.setTargetAtTime(Math.pow(10, db / 20), this.ensureContext().currentTime, 0.01)
  }

  setChainBypass(bypassed: boolean): void {
    this.bypassed = bypassed
    this.applyBypass()
  }

  isChainBypassed(): boolean {
    return this.bypassed
  }

  private applyBypass(): void {
    const chain = this.masterChain
    if (!chain) return
    try {
      chain.input.disconnect()
    } catch {
      // nothing connected yet
    }
    if (this.bypassed) {
      chain.input.connect(chain.output)
    } else {
      chain.input.connect(chain.eqLow)
    }
  }

  /** Current gain reduction in dB (negative = attenuating) for the compressor and limiter. */
  getReductionDb(): { compressor: number; limiter: number } {
    return { compressor: this.masterChain?.compressor.reduction ?? 0, limiter: this.limiterReductionDb }
  }

  /** Restart the integrated-LUFS measurement (call when playback starts from a new point). */
  resetIntegratedLufs(): void {
    this.masterChain?.lufsMeter.port.postMessage({ resetIntegrated: true })
  }

  setEqGainDb(band: 'low' | 'mid' | 'high', gainDb: number): void {
    if (!this.masterChain) return
    const node =
      band === 'low' ? this.masterChain.eqLow : band === 'mid' ? this.masterChain.eqMid : this.masterChain.eqHigh
    node.gain.setTargetAtTime(gainDb, this.ensureContext().currentTime, 0.01)
  }

  setCompressorParams(params: { threshold?: number; ratio?: number }): void {
    if (!this.masterChain) return
    const now = this.ensureContext().currentTime
    if (params.threshold !== undefined) this.masterChain.compressor.threshold.setTargetAtTime(params.threshold, now, 0.01)
    if (params.ratio !== undefined) this.masterChain.compressor.ratio.setTargetAtTime(params.ratio, now, 0.01)
  }

  setLimiterCeilingDb(ceilingDb: number): void {
    this.masterChain?.limiter.port.postMessage({ ceilingDb })
  }

  onLufsUpdate(callback: ((reading: LufsReading) => void) | null): void {
    this.lufsCallback = callback
  }

  getAnalyser(): AnalyserNode | null {
    return this.masterChain?.analyser ?? null
  }

  async decodeFile(file: File): Promise<AudioBuffer> {
    const ctx = this.ensureContext()
    const arrayBuffer = await file.arrayBuffer()
    return ctx.decodeAudioData(arrayBuffer)
  }

  addTrack(id: string, volume = 1, pan = 0): void {
    const ctx = this.ensureContext()
    const gainNode = ctx.createGain()
    gainNode.gain.value = volume
    const pannerNode = ctx.createStereoPanner()
    pannerNode.pan.value = pan
    gainNode.connect(pannerNode).connect(this.masterGain!)
    this.trackNodes.set(id, { id, gainNode, pannerNode })
  }

  removeTrack(id: string): void {
    const track = this.trackNodes.get(id)
    if (!track) return
    track.gainNode.disconnect()
    track.pannerNode.disconnect()
    this.trackNodes.delete(id)
  }

  setTrackVolume(id: string, volume: number): void {
    const track = this.trackNodes.get(id)
    if (!track) return
    track.gainNode.gain.setTargetAtTime(volume, this.ensureContext().currentTime, 0.01)
  }

  setTrackPan(id: string, pan: number): void {
    const track = this.trackNodes.get(id)
    if (!track) return
    track.pannerNode.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), this.ensureContext().currentTime, 0.01)
  }

  /** Replaces the full clip list. Takes effect on the next play() call, not live mid-playback. */
  setClips(clips: Clip[]): void {
    this.clips = clips
  }

  getDuration(): number {
    let max = 0
    for (const clip of this.clips) max = Math.max(max, clip.timelineStart + clip.duration)
    return max
  }

  isPlaying(): boolean {
    return this.state.playing
  }

  /** Current playhead position in seconds, derived from the audio clock while playing. */
  getCurrentTime(): number {
    if (!this.state.playing) return this.state.pausedAt
    const ctx = this.ensureContext()
    const elapsed = this.state.timelineStartOffset + (ctx.currentTime - this.state.contextStartTime)
    return Math.min(elapsed, this.getDuration())
  }

  play(fromSeconds?: number): void {
    const ctx = this.ensureContext()
    const atEnd = this.getCurrentTime() >= this.getDuration() - 0.01
    const startOffset = fromSeconds ?? (atEnd ? 0 : this.getCurrentTime())
    this.stopAllSources()

    const startAt = ctx.currentTime + 0.05
    let longestEndTime = -Infinity
    let longestSource: AudioBufferSourceNode | null = null

    for (const clip of this.clips) {
      if (clip.muted) continue
      const clipTimelineEnd = clip.timelineStart + clip.duration
      if (clipTimelineEnd <= startOffset) continue

      const track = this.trackNodes.get(clip.trackId)
      const buffer = bufferCache.get(clip.bufferId)
      if (!track || !buffer) continue

      const clipRelativeStart = Math.max(0, startOffset - clip.timelineStart)
      const when = startAt + Math.max(0, clip.timelineStart - startOffset)
      const bufferOffsetToPlay = clip.bufferOffset + clipRelativeStart
      const playDuration = clip.duration - clipRelativeStart
      if (playDuration <= 0) continue

      const clipGain = ctx.createGain()
      clipGain.connect(track.gainNode)
      const peakGain = Math.pow(10, (clip.gainDb ?? 0) / 20)
      applyClipEnvelope(clipGain.gain, when, clipRelativeStart, playDuration, clip, peakGain)

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(clipGain)
      source.start(when, bufferOffsetToPlay, playDuration)
      this.activeSources.push({ source, clipGain })

      const endTime = when + playDuration
      if (endTime > longestEndTime) {
        longestEndTime = endTime
        longestSource = source
      }
    }

    // Only the source that ends last is used to detect natural end of playback, so shorter
    // clips finishing early don't flip the transport to "stopped".
    if (longestSource) {
      const trackedSource = longestSource
      trackedSource.onended = () => {
        if (this.activeSources.some((a) => a.source === trackedSource)) {
          this.state = { playing: false, pausedAt: this.getDuration() }
          this.onEndedCallback?.()
        }
      }
    }

    this.state = { playing: true, contextStartTime: startAt, timelineStartOffset: startOffset }
  }

  pause(): void {
    if (!this.state.playing) return
    const current = this.getCurrentTime()
    this.stopAllSources()
    this.state = { playing: false, pausedAt: current }
  }

  seek(seconds: number): void {
    const clamped = Math.min(Math.max(0, seconds), this.getDuration())
    if (this.state.playing) {
      this.play(clamped)
    } else {
      this.state = { playing: false, pausedAt: clamped }
    }
  }

  stop(): void {
    this.stopAllSources()
    this.state = { playing: false, pausedAt: 0 }
  }

  private stopAllSources(): void {
    for (const active of this.activeSources) {
      active.source.onended = null
      try {
        active.source.stop()
      } catch {
        // already stopped
      }
      active.source.disconnect()
      active.clipGain.disconnect()
    }
    this.activeSources = []
  }

  onEnded(callback: (() => void) | null): void {
    this.onEndedCallback = callback
  }
}

/**
 * Schedules the clip's fade-in/fade-out gain envelope, accounting for playback starting
 * partway through the clip (e.g. after a seek) rather than always from the clip's own start.
 */
export function applyClipEnvelope(
  gainParam: AudioParam,
  when: number,
  clipRelativeStart: number,
  playDuration: number,
  clip: Clip,
  peakGain = 1,
): void {
  const fadeIn = Math.max(0, clip.fadeIn)
  const fadeOut = Math.max(0, clip.fadeOut)
  const clipEndRelative = clipRelativeStart + playDuration

  gainParam.cancelScheduledValues(when)

  if (fadeIn > 0 && clipRelativeStart < fadeIn) {
    const startGain = (clipRelativeStart / fadeIn) * peakGain
    gainParam.setValueAtTime(startGain, when)
    gainParam.linearRampToValueAtTime(peakGain, when + (fadeIn - clipRelativeStart))
  } else {
    gainParam.setValueAtTime(peakGain, when)
  }

  const fadeOutStartRelative = clip.duration - fadeOut
  if (fadeOut > 0 && clipEndRelative > fadeOutStartRelative) {
    const fadeOutStartTime = when + Math.max(0, fadeOutStartRelative - clipRelativeStart)
    gainParam.setValueAtTime(peakGain, Math.max(fadeOutStartTime, when))
    gainParam.linearRampToValueAtTime(0, when + playDuration)
  }
}

export const audioEngine = new AudioEngine()

if (import.meta.env.DEV) {
  ;(window as unknown as { __audioEngine: AudioEngine }).__audioEngine = audioEngine
}

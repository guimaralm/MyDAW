import { applyClipEnvelope } from './AudioEngine'
import { bufferCache } from './bufferCache'
import { createMasterChain } from './masterChain'
import type { Clip, Track } from '../types/project'

export interface RenderMasteringSettings {
  eqLowDb: number
  eqMidDb: number
  eqHighDb: number
  compressorThreshold: number
  compressorRatio: number
  limiterCeilingDb: number
  masterGainDb: number
}

/**
 * Renders the full arrangement (tracks + clips + mastering chain) offline, as fast as
 * possible rather than in realtime, mirroring the exact graph used for live playback so
 * the export matches what was heard.
 */
export async function renderMix(
  tracks: Track[],
  clips: Clip[],
  mastering: RenderMasteringSettings,
): Promise<AudioBuffer> {
  const duration = clips.reduce((max, c) => Math.max(max, c.timelineStart + c.duration), 0)
  if (duration <= 0) throw new Error('No hay nada para exportar')

  const sampleRate = 44100
  // Small trailing margin so the limiter's lookahead delay and compressor release tail
  // aren't cut off at the very end of the render.
  const tailSeconds = 0.2
  const ctx = new OfflineAudioContext({
    numberOfChannels: 2,
    length: Math.ceil((duration + tailSeconds) * sampleRate),
    sampleRate,
  })

  const chain = await createMasterChain(ctx)
  // Pre-chain master trim, mirroring the live masterGain node.
  const masterGain = ctx.createGain()
  masterGain.gain.value = Math.pow(10, (mastering.masterGainDb ?? 0) / 20)
  masterGain.connect(chain.input)
  chain.eqLow.gain.value = mastering.eqLowDb
  chain.eqMid.gain.value = mastering.eqMidDb
  chain.eqHigh.gain.value = mastering.eqHighDb
  chain.compressor.threshold.value = mastering.compressorThreshold
  chain.compressor.ratio.value = mastering.compressorRatio
  chain.limiter.port.postMessage({ ceilingDb: mastering.limiterCeilingDb })

  // Mirror the live mute/solo/pan logic so the export matches what was heard.
  const anySolo = tracks.some((t) => t.soloed)
  const trackGains = new Map<string, GainNode>()
  for (const track of tracks) {
    const silenced = track.muted || (anySolo && !track.soloed)
    const gainNode = ctx.createGain()
    gainNode.gain.value = silenced ? 0 : track.volume
    const panner = ctx.createStereoPanner()
    panner.pan.value = track.pan ?? 0
    gainNode.connect(panner).connect(masterGain)
    trackGains.set(track.id, gainNode)
  }

  for (const clip of clips) {
    if (clip.muted) continue
    const buffer = bufferCache.get(clip.bufferId)
    const trackGain = trackGains.get(clip.trackId)
    if (!buffer || !trackGain) continue

    const clipGain = ctx.createGain()
    clipGain.connect(trackGain)
    const peakGain = Math.pow(10, (clip.gainDb ?? 0) / 20)
    applyClipEnvelope(clipGain.gain, clip.timelineStart, 0, clip.duration, clip, peakGain)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(clipGain)
    source.start(clip.timelineStart, clip.bufferOffset, clip.duration)
  }

  return ctx.startRendering()
}

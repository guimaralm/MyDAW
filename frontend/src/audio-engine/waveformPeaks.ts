export interface Peaks {
  min: Float32Array
  max: Float32Array
  /** Largest absolute excursion in the analysed range — used to normalize the drawing. */
  peak: number
}

interface CompositeClip {
  bufferId: string
  timelineStart: number
  bufferOffset: number
  duration: number
  muted: boolean
}

/**
 * Below this peak we treat the material as silence and stop normalizing, so room tone and
 * dither noise aren't blown up into a solid wall of "audio" that isn't there.
 */
const SILENCE_FLOOR = 0.02
/** Never magnify more than this, so a near-silent clip stays visibly quiet. */
const MAX_GAIN = 12

/**
 * Display gain for a waveform with the given peak. Separated stems are far quieter than a
 * full mix (a vocal stem often peaks near 0.05), so drawing raw amplitude renders them as a
 * flat line. Normalizing per clip is what makes the audio actually readable.
 */
export function normalizationScale(peak: number): number {
  if (peak <= SILENCE_FLOOR) return 1
  return Math.min(MAX_GAIN, 1 / peak)
}

/**
 * Build a single "whole song" silhouette over [0, duration] by compositing every clip's peaks
 * into shared column arrays (taking the widest excursion per column). Used for the crop
 * overview, where the song is shown as one waveform rather than broken into stems.
 */
export function computeCompositePeaks(
  clips: CompositeClip[],
  duration: number,
  numColumns: number,
  getBuffer: (bufferId: string) => AudioBuffer | undefined,
): Peaks {
  const min = new Float32Array(numColumns)
  const max = new Float32Array(numColumns)
  if (numColumns <= 0 || duration <= 0) return { min, max, peak: 0 }
  const colsPerSec = numColumns / duration
  let peak = 0

  for (const clip of clips) {
    if (clip.muted) continue
    const buffer = getBuffer(clip.bufferId)
    if (!buffer) continue
    const startCol = Math.max(0, Math.floor(clip.timelineStart * colsPerSec))
    const endCol = Math.min(numColumns, Math.ceil((clip.timelineStart + clip.duration) * colsPerSec))
    const span = endCol - startCol
    if (span <= 0) continue
    const clipPeaks = computePeaks(buffer, clip.bufferOffset, clip.duration, span)
    for (let i = 0; i < span; i++) {
      const col = startCol + i
      if (clipPeaks.min[i] < min[col]) min[col] = clipPeaks.min[i]
      if (clipPeaks.max[i] > max[col]) max[col] = clipPeaks.max[i]
    }
    if (clipPeaks.peak > peak) peak = clipPeaks.peak
  }
  return { min, max, peak }
}

/**
 * Compute per-column min/max peaks for a slice of an AudioBuffer, mixing all channels to
 * mono. Used to draw a clip's waveform on a canvas at a given pixel width.
 */
export function computePeaks(
  buffer: AudioBuffer,
  startSec: number,
  durationSec: number,
  numColumns: number,
): Peaks {
  const min = new Float32Array(numColumns)
  const max = new Float32Array(numColumns)
  if (numColumns <= 0) return { min, max, peak: 0 }

  const sr = buffer.sampleRate
  const channels: Float32Array[] = []
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch))

  const startSample = Math.max(0, Math.floor(startSec * sr))
  const endSample = Math.min(buffer.length, Math.ceil((startSec + durationSec) * sr))
  const totalSamples = Math.max(1, endSample - startSample)
  const samplesPerColumn = totalSamples / numColumns
  let peak = 0

  for (let col = 0; col < numColumns; col++) {
    const from = startSample + Math.floor(col * samplesPerColumn)
    const to = Math.min(endSample, startSample + Math.floor((col + 1) * samplesPerColumn))
    let lo = 0
    let hi = 0
    for (let i = from; i < to; i++) {
      let sum = 0
      for (let ch = 0; ch < channels.length; ch++) sum += channels[ch][i]
      const v = sum / channels.length
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    min[col] = lo
    max[col] = hi
    if (-lo > peak) peak = -lo
    if (hi > peak) peak = hi
  }
  return { min, max, peak }
}

// Scanning a multi-minute buffer per redraw is expensive, and redraws happen on every zoom,
// scroll and selection change. Cache by the exact slice + pixel width being drawn.
const peaksCache = new Map<string, Peaks>()
const MAX_CACHE_ENTRIES = 200

/** Cached `computePeaks` for a clip's slice. `bufferId` identifies the source buffer. */
export function getCachedPeaks(
  bufferId: string,
  buffer: AudioBuffer,
  startSec: number,
  durationSec: number,
  numColumns: number,
): Peaks {
  const key = `${bufferId}|${startSec.toFixed(4)}|${durationSec.toFixed(4)}|${numColumns}`
  const hit = peaksCache.get(key)
  if (hit) return hit
  const computed = computePeaks(buffer, startSec, durationSec, numColumns)
  if (peaksCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = peaksCache.keys().next().value
    if (oldest !== undefined) peaksCache.delete(oldest)
  }
  peaksCache.set(key, computed)
  return computed
}

export function clearPeaksCache(): void {
  peaksCache.clear()
}

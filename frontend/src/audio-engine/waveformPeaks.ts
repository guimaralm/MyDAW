export interface Peaks {
  min: Float32Array
  max: Float32Array
}

interface CompositeClip {
  bufferId: string
  timelineStart: number
  bufferOffset: number
  duration: number
  muted: boolean
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
  if (numColumns <= 0 || duration <= 0) return { min, max }
  const colsPerSec = numColumns / duration

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
  }
  return { min, max }
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
  if (numColumns <= 0) return { min, max }

  const sr = buffer.sampleRate
  const channels: Float32Array[] = []
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch))

  const startSample = Math.max(0, Math.floor(startSec * sr))
  const endSample = Math.min(buffer.length, Math.ceil((startSec + durationSec) * sr))
  const totalSamples = Math.max(1, endSample - startSample)
  const samplesPerColumn = totalSamples / numColumns

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
  }
  return { min, max }
}

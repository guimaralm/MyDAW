export interface Track {
  id: string
  name: string
  volume: number
  muted: boolean
  soloed: boolean
  /** Stereo pan, -1 (left) .. 0 (center) .. 1 (right). */
  pan: number
}

export interface Clip {
  id: string
  trackId: string
  bufferId: string
  /** Position on the shared arrangement timeline, in seconds. */
  timelineStart: number
  /** Where in the source buffer this clip starts, in seconds (enables non-destructive trim). */
  bufferOffset: number
  duration: number
  fadeIn: number
  fadeOut: number
  /** Per-clip gain trim in dB (0 = unchanged) — fix a too-loud/too-quiet piece locally. */
  gainDb: number
  /** When true this piece plays silent — used to "silence a part" of a track in place. */
  muted: boolean
}

export interface DecodedAudio {
  id: string
  fileName: string
  buffer: AudioBuffer
}

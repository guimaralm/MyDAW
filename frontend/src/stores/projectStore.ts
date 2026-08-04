import { create } from 'zustand'
import { temporal } from 'zundo'
import type { Track, Clip } from '../types/project'

const MIN_CLIP_DURATION = 0.05

// Continuous controls (volume, pan, clip gain, fade handles) fire on every pointer move, so a
// single fader drag used to push dozens of history entries — making Undo look broken, since it
// stepped back one imperceptible increment at a time. During a coalesced session we keep only
// the state from *before* the drag started, so one drag == one undo step.
let coalescing = false
let coalescedThisSession = false

/** Call on pointerdown of a continuous control; ends automatically on pointerup. */
export function startCoalescedDrag(): void {
  coalescing = true
  coalescedThisSession = false
  const end = () => {
    coalescing = false
    coalescedThisSession = false
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
  }
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
}

interface ProjectState {
  tracks: Track[]
  clips: Clip[]
  addTrackWithClip: (track: Track, clip: Clip) => void
  removeTrack: (trackId: string) => void
  setTrackVolume: (trackId: string, volume: number) => void
  setTrackPan: (trackId: string, pan: number) => void
  toggleTrackMute: (trackId: string) => void
  toggleTrackSolo: (trackId: string) => void
  /** Drag the region's left edge: newBufferOffset must stay within [0, clip's current end). */
  trimClipLeft: (clipId: string, newBufferOffset: number) => void
  /** Drag the region's right edge: newBufferEnd must stay after the clip's current start. */
  trimClipRight: (clipId: string, newBufferEnd: number) => void
  setClipFade: (clipId: string, fade: { fadeIn?: number; fadeOut?: number }) => void
  setClipGainDb: (clipId: string, gainDb: number) => void
  /** Split a clip at an absolute timeline position (seconds) into two adjacent clips. */
  splitClip: (clipId: string, atTimelineSeconds: number, newClipId: string) => void
  /** Split every clip crossing `atTimelineSeconds` in one undo step (keeps stems aligned). */
  splitClipsAtTime: (atTimelineSeconds: number, cuts: { clipId: string; newClipId: string }[]) => void
  /** Silence a time range [a,b] in place: split at both edges, mute the middle piece. */
  silenceRange: (trackId: string, a: number, b: number, newIds: [string, string]) => void
  /** Delete a time range [a,b] in place: split at both edges, remove the middle piece (leaves silence). */
  deleteRange: (trackId: string, a: number, b: number, newIds: [string, string]) => void
  /** Copy a time range [a,b] onto a new lane at the same position, leaving the original intact. */
  duplicateRangeToNewTrack: (
    trackId: string,
    a: number,
    b: number,
    newTrackId: string,
    newName: string,
    newClipId: string,
  ) => void
  /** Extract a time range [a,b] to a brand-new track lane at the same timeline position. */
  moveRangeToNewTrack: (
    trackId: string,
    a: number,
    b: number,
    newTrackId: string,
    newName: string,
    newIds: [string, string],
  ) => void
  setClipMuted: (clipId: string, muted: boolean) => void
  /** Crop the whole song to [start,end] across all tracks, re-basing so it begins at 0. */
  cropSong: (start: number, end: number) => void
  removeClip: (clipId: string) => void
  /** Move a clip onto a brand-new track lane at a new timeline position (never overlaps siblings). */
  moveClipToNewTrack: (clipId: string, newTrackId: string, newName: string, newTimelineStart: number) => void
}

export const useProjectStore = create<ProjectState>()(
  temporal(
    (set) => ({
      tracks: [],
      clips: [],

      addTrackWithClip: (track, clip) =>
        set((s) => ({ tracks: [...s.tracks, track], clips: [...s.clips, clip] })),

      removeTrack: (trackId) =>
        set((s) => ({
          tracks: s.tracks.filter((t) => t.id !== trackId),
          clips: s.clips.filter((c) => c.trackId !== trackId),
        })),

      setTrackVolume: (trackId, volume) =>
        set((s) => ({ tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, volume } : t)) })),

      setTrackPan: (trackId, pan) =>
        set((s) => ({
          tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, pan: Math.max(-1, Math.min(1, pan)) } : t)),
        })),

      toggleTrackMute: (trackId) =>
        set((s) => ({ tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)) })),

      toggleTrackSolo: (trackId) =>
        set((s) => ({ tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, soloed: !t.soloed } : t)) })),

      trimClipLeft: (clipId, newBufferOffset) =>
        set((s) => ({
          clips: s.clips.map((c) => {
            if (c.id !== clipId) return c
            const currentEnd = c.bufferOffset + c.duration
            const clamped = Math.min(Math.max(0, newBufferOffset), currentEnd - MIN_CLIP_DURATION)
            const delta = clamped - c.bufferOffset
            // Trimming the left edge also moves where the clip sits on the timeline.
            return { ...c, bufferOffset: clamped, timelineStart: c.timelineStart + delta, duration: currentEnd - clamped }
          }),
        })),

      trimClipRight: (clipId, newBufferEnd) =>
        set((s) => ({
          clips: s.clips.map((c) => {
            if (c.id !== clipId) return c
            const clamped = Math.max(newBufferEnd, c.bufferOffset + MIN_CLIP_DURATION)
            return { ...c, duration: clamped - c.bufferOffset }
          }),
        })),

      setClipFade: (clipId, fade) =>
        set((s) => ({ clips: s.clips.map((c) => (c.id === clipId ? { ...c, ...fade } : c)) })),

      setClipGainDb: (clipId, gainDb) =>
        set((s) => ({ clips: s.clips.map((c) => (c.id === clipId ? { ...c, gainDb } : c)) })),

      splitClip: (clipId, atTimelineSeconds, newClipId) =>
        set((s) => ({ clips: splitOne(s.clips, clipId, atTimelineSeconds, newClipId) })),

      splitClipsAtTime: (atTimelineSeconds, cuts) =>
        set((s) => {
          let next = s.clips
          for (const { clipId, newClipId } of cuts) {
            next = splitOne(next, clipId, atTimelineSeconds, newClipId)
          }
          return { clips: next }
        }),

      silenceRange: (trackId, a, b, newIds) =>
        set((s) => {
          const res = splitInThree(s.clips, trackId, a, b, newIds[0], newIds[1])
          if (!res) return s
          return { clips: res.list.map((c) => (c.id === newIds[0] ? { ...c, muted: true } : c)) }
        }),

      deleteRange: (trackId, a, b, newIds) =>
        set((s) => {
          const res = splitInThree(s.clips, trackId, a, b, newIds[0], newIds[1])
          if (!res) return s
          return { clips: res.list.filter((c) => c.id !== newIds[0]) }
        }),

      // Layering, not splitting: the source clip is untouched and the copy plays on top at the
      // same time position, so stems stay aligned and nothing overlaps on the original lane.
      duplicateRangeToNewTrack: (trackId, a, b, newTrackId, newName, newClipId) =>
        set((s) => {
          const lo = Math.min(a, b)
          const hi = Math.max(a, b)
          if (hi - lo < MIN_CLIP_DURATION) return s
          const clip = s.clips.find(
            (c) => c.trackId === trackId && c.timelineStart <= lo && c.timelineStart + c.duration >= hi,
          )
          if (!clip) return s
          const source = s.tracks.find((t) => t.id === trackId)
          const newTrack: Track = {
            id: newTrackId,
            name: newName,
            volume: source?.volume ?? 1,
            muted: false,
            soloed: false,
            pan: source?.pan ?? 0,
          }
          const copy: Clip = {
            ...clip,
            id: newClipId,
            trackId: newTrackId,
            timelineStart: lo,
            bufferOffset: clip.bufferOffset + (lo - clip.timelineStart),
            duration: hi - lo,
            fadeIn: 0,
            fadeOut: 0,
            muted: false,
          }
          return { tracks: [...s.tracks, newTrack], clips: [...s.clips, copy] }
        }),

      moveRangeToNewTrack: (trackId, a, b, newTrackId, newName, newIds) =>
        set((s) => {
          const res = splitInThree(s.clips, trackId, a, b, newIds[0], newIds[1])
          if (!res) return s
          const source = s.tracks.find((t) => t.id === trackId)
          const newTrack: Track = {
            id: newTrackId,
            name: newName,
            volume: source?.volume ?? 1,
            muted: false,
            soloed: false,
            pan: source?.pan ?? 0,
          }
          return {
            tracks: [...s.tracks, newTrack],
            clips: res.list.map((c) => (c.id === newIds[0] ? { ...c, trackId: newTrackId } : c)),
          }
        }),

      setClipMuted: (clipId, muted) =>
        set((s) => ({ clips: s.clips.map((c) => (c.id === clipId ? { ...c, muted } : c)) })),

      cropSong: (start, end) =>
        set((s) => {
          const lo = Math.max(0, Math.min(start, end))
          const hi = Math.max(start, end)
          if (hi - lo < MIN_CLIP_DURATION) return s
          const clips: Clip[] = []
          for (const c of s.clips) {
            const cs = c.timelineStart
            const ce = c.timelineStart + c.duration
            const ns = Math.max(cs, lo)
            const ne = Math.min(ce, hi)
            if (ne - ns < MIN_CLIP_DURATION) continue // clip falls entirely outside the crop
            const trimmedLeft = ns - cs
            clips.push({
              ...c,
              timelineStart: ns - lo, // re-base so the crop starts at 0
              bufferOffset: c.bufferOffset + trimmedLeft,
              duration: ne - ns,
              // Keep a fade only if that edge of the clip survived the crop.
              fadeIn: ns === cs ? c.fadeIn : 0,
              fadeOut: ne === ce ? c.fadeOut : 0,
            })
          }
          return { clips }
        }),

      removeClip: (clipId) => set((s) => ({ clips: s.clips.filter((c) => c.id !== clipId) })),

      moveClipToNewTrack: (clipId, newTrackId, newName, newTimelineStart) =>
        set((s) => {
          const clip = s.clips.find((c) => c.id === clipId)
          if (!clip) return s
          const source = s.tracks.find((t) => t.id === clip.trackId)
          const newTrack: Track = {
            id: newTrackId,
            name: newName,
            volume: source?.volume ?? 1,
            muted: false,
            soloed: false,
            pan: source?.pan ?? 0,
          }
          return {
            tracks: [...s.tracks, newTrack],
            clips: s.clips.map((c) =>
              c.id === clipId ? { ...c, trackId: newTrackId, timelineStart: Math.max(0, newTimelineStart) } : c,
            ),
          }
        }),
    }),
    {
      limit: 50,
      handleSet: (handleSet) => (pastState, replace) => {
        if (coalescing) {
          if (coalescedThisSession) return
          coalescedThisSession = true
        }
        handleSet(pastState, replace)
      },
    },
  ),
)

/** Split one clip in a clip list at an absolute timeline position, returning a new list. */
function splitOne(clips: Clip[], clipId: string, atTimelineSeconds: number, newClipId: string): Clip[] {
  const clip = clips.find((c) => c.id === clipId)
  if (!clip) return clips
  const offsetIntoClip = atTimelineSeconds - clip.timelineStart
  if (offsetIntoClip <= MIN_CLIP_DURATION || offsetIntoClip >= clip.duration - MIN_CLIP_DURATION) return clips
  const first: Clip = { ...clip, duration: offsetIntoClip, fadeOut: 0 }
  const second: Clip = {
    ...clip,
    id: newClipId,
    timelineStart: atTimelineSeconds,
    bufferOffset: clip.bufferOffset + offsetIntoClip,
    duration: clip.duration - offsetIntoClip,
    fadeIn: 0,
  }
  return clips.flatMap((c) => (c.id === clipId ? [first, second] : [c]))
}

/**
 * Split the clip covering [a,b] on a track into up to three pieces (left / middle / right),
 * giving the middle piece id `midId`. Returns the new clip list, or null if no clip covers
 * the range or it's too small. Callers decide the middle piece's fate (mute / delete / move).
 */
function splitInThree(
  clips: Clip[],
  trackId: string,
  a: number,
  b: number,
  midId: string,
  rightId: string,
): { list: Clip[] } | null {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  if (hi - lo < MIN_CLIP_DURATION) return null
  const clip = clips.find(
    (c) => c.trackId === trackId && c.timelineStart <= lo && c.timelineStart + c.duration >= hi,
  )
  if (!clip) return null

  const startOff = lo - clip.timelineStart
  const endOff = hi - clip.timelineStart
  const pieces: Clip[] = []
  if (startOff > MIN_CLIP_DURATION) {
    pieces.push({ ...clip, duration: startOff, fadeOut: 0 })
  }
  pieces.push({
    ...clip,
    id: midId,
    timelineStart: lo,
    bufferOffset: clip.bufferOffset + Math.max(0, startOff),
    duration: Math.min(hi, clip.timelineStart + clip.duration) - lo,
    fadeIn: 0,
    fadeOut: 0,
  })
  if (clip.duration - endOff > MIN_CLIP_DURATION) {
    pieces.push({
      ...clip,
      id: rightId,
      timelineStart: hi,
      bufferOffset: clip.bufferOffset + endOff,
      duration: clip.duration - endOff,
      fadeIn: 0,
    })
  }
  return { list: clips.flatMap((c) => (c.id === clip.id ? pieces : [c])) }
}

export interface StemLabel {
  /** Short display name for the lane, e.g. "Vocals". */
  title: string
  /** Where it came from, shown small underneath, e.g. "my-song.wav". */
  subtitle: string
  /** Waveform / accent colour for the lane. */
  color: string
}

const STEM_STYLES: Record<string, { title: string; color: string }> = {
  vocals: { title: 'Vocals', color: '#f0a868' },
  drums: { title: 'Drums', color: '#f07f8e' },
  bass: { title: 'Bass', color: '#7aa2f7' },
  other: { title: 'Other', color: '#9ece6a' },
}

const DEFAULT_COLOR = '#c084fc'

/**
 * Tracks are named "<file> · <stem>" when they come from separation (see addTrackFromStem),
 * and moved pieces get "<name> (moved)". Split that into a bold stem title plus a quiet
 * source subtitle, and give each stem kind its own colour — four lanes all reading
 * "my-song.wav …" truncated are impossible to tell apart at a glance.
 */
export function describeTrack(name: string): StemLabel {
  const [source, ...rest] = name.split(' · ')
  const tail = rest.join(' · ')
  if (!tail) return { title: name, subtitle: '', color: DEFAULT_COLOR }

  // Derived lanes carry a suffix like "(moved)" or "(copy)"; keep it but colour by stem kind.
  const SUFFIX = /\s*\((moved|movido|copy)\)/i
  const movedSuffix = tail.match(SUFFIX)?.[0] ?? ''
  const kind = tail.replace(SUFFIX, '').trim().toLowerCase()
  const style = STEM_STYLES[kind]
  return {
    title: (style?.title ?? kind.charAt(0).toUpperCase() + kind.slice(1)) + movedSuffix,
    subtitle: source,
    color: style?.color ?? DEFAULT_COLOR,
  }
}

export function trackColor(name: string): string {
  return describeTrack(name).color
}

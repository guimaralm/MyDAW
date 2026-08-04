import { startCoalescedDrag } from '../../stores/projectStore'
import type { Clip } from '../../types/project'
import { Button } from '../ui/Button'

interface ClipInspectorProps {
  clip: Clip
  onFadeChange: (fade: { fadeIn?: number; fadeOut?: number }) => void
  onGainChange: (gainDb: number) => void
  onToggleMuted: () => void
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-dim)]">
      {label}
      <input
        type="number"
        min={0}
        step={0.1}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="tnum w-14 rounded bg-[var(--bg-app)] px-1.5 py-0.5 text-[var(--text)]"
      />
    </label>
  )
}

/** Thin contextual strip for the selected piece — it sits just above the transport. */
export function ClipInspector({ clip, onFadeChange, onGainChange, onToggleMuted }: ClipInspectorProps) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-4 border-t border-[var(--border)] bg-[var(--bg-panel)] px-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">Piece</span>
      <NumberField label="Fade in" value={clip.fadeIn} onChange={(v) => onFadeChange({ fadeIn: v })} />
      <NumberField label="Fade out" value={clip.fadeOut} onChange={(v) => onFadeChange({ fadeOut: v })} />
      <label className="flex items-center gap-2 text-[11px] text-[var(--text-dim)]">
        Gain
        <input
          type="range"
          min={-24}
          max={12}
          step={0.5}
          value={clip.gainDb ?? 0}
          onPointerDown={startCoalescedDrag}
          onChange={(e) => onGainChange(Number(e.target.value))}
          onDoubleClick={() => onGainChange(0)}
          className="w-28"
          style={{ accentColor: 'var(--accent)' }}
          title="Clip gain (double-click to reset)"
        />
        <span className="tnum w-12 text-right text-[var(--text)]">{(clip.gainDb ?? 0).toFixed(1)}dB</span>
      </label>
      <Button size="sm" variant={clip.muted ? 'default' : 'ghost'} active={clip.muted} onClick={onToggleMuted}>
        {clip.muted ? 'Unmute' : 'Silence'}
      </Button>
    </div>
  )
}

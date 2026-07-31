interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  /** Value the control snaps back to on double-click, and where the detent tick is drawn. */
  resetTo?: number
  /** Fraction digits in the readout. */
  precision?: number
  accent?: string
  onChange: (value: number) => void
}

/**
 * Compact labelled fader. Deliberately narrow — a ±12 dB control stretched across 960px
 * (as the EQ used to be) gives absurd resolution and no sense of where centre is, so a
 * detent tick marks the neutral value and the readout uses tabular figures.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = '',
  resetTo,
  precision = 1,
  accent = 'var(--accent)',
  onChange,
}: SliderProps) {
  const detentPct = resetTo === undefined ? null : ((resetTo - min) / (max - min)) * 100

  return (
    <div className="flex items-center gap-2">
      <span className="w-[68px] shrink-0 text-[11px] text-[var(--text-dim)]">{label}</span>
      <div className="relative flex-1">
        {detentPct !== null && (
          <div
            className="pointer-events-none absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-[var(--border-strong)]"
            style={{ left: `${detentPct}%` }}
          />
        )}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onDoubleClick={() => resetTo !== undefined && onChange(resetTo)}
          className="relative w-full"
          style={{ accentColor: accent }}
          title={resetTo !== undefined ? 'Double-click to reset' : undefined}
        />
      </div>
      <span className="tnum w-[52px] shrink-0 text-right text-[11px] text-[var(--text)]">
        {value.toFixed(precision)}
        {unit}
      </span>
    </div>
  )
}

/** Horizontal gain-reduction meter: fills leftward as reduction (negative dB) deepens. */
export function ReductionMeter({ label, reductionDb, max = 20 }: { label: string; reductionDb: number; max?: number }) {
  const amount = Math.min(max, Math.max(0, -reductionDb))
  return (
    <div className="flex items-center gap-2">
      <span className="w-[68px] shrink-0 text-[10px] text-[var(--text-faint)]">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-app)]">
        <div
          className="absolute right-0 top-0 h-full rounded-full bg-[var(--warn)] transition-[width] duration-75"
          style={{ width: `${(amount / max) * 100}%` }}
        />
      </div>
      <span className="tnum w-[52px] shrink-0 text-right text-[10px] text-[var(--text-faint)]">
        −{amount.toFixed(1)}dB
      </span>
    </div>
  )
}

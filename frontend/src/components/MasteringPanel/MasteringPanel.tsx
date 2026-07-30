interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  resetTo?: number
  onChange: (value: number) => void
}

function SliderRow({ label, value, min, max, step, unit, resetTo, onChange }: SliderRowProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-400">
      <span className="w-24 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => resetTo !== undefined && onChange(resetTo)}
        className="w-full accent-purple-500"
      />
      <span className="w-16 shrink-0 text-right font-mono text-neutral-300">
        {value.toFixed(1)}
        {unit}
      </span>
    </label>
  )
}

// Below this, we're measuring float rounding noise on digital silence, not real signal —
// BS.1770's own absolute gate (-70 LUFS) is a reasonable floor for a useful display.
const SILENCE_FLOOR_LUFS = -70

function formatLufs(value: number): string {
  if (!Number.isFinite(value) || value < SILENCE_FLOOR_LUFS) return '-∞'
  return value.toFixed(1)
}

/** Gain-reduction meter: a bar growing left as reduction (a negative dB value) deepens. */
function ReductionMeter({ label, reductionDb }: { label: string; reductionDb: number }) {
  const amount = Math.min(20, Math.max(0, -reductionDb))
  const pct = (amount / 20) * 100
  return (
    <div className="flex items-center gap-2 text-[10px] text-neutral-500">
      <span className="w-24 shrink-0">{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded bg-neutral-800">
        <div className="absolute right-0 top-0 h-full bg-amber-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right font-mono text-neutral-300">−{amount.toFixed(1)}dB</span>
    </div>
  )
}

interface MasteringPanelProps {
  eqLowDb: number
  eqMidDb: number
  eqHighDb: number
  compressorThreshold: number
  compressorRatio: number
  limiterCeilingDb: number
  masterGainDb: number
  bypassed: boolean
  momentaryLufs: number
  shortTermLufs: number
  integratedLufs: number
  compressorReductionDb: number
  limiterReductionDb: number
  onToggleBypass: () => void
  onMasterGainChange: (v: number) => void
  onEqLowChange: (v: number) => void
  onEqMidChange: (v: number) => void
  onEqHighChange: (v: number) => void
  onCompressorThresholdChange: (v: number) => void
  onCompressorRatioChange: (v: number) => void
  onLimiterCeilingChange: (v: number) => void
}

export function MasteringPanel({
  eqLowDb,
  eqMidDb,
  eqHighDb,
  compressorThreshold,
  compressorRatio,
  limiterCeilingDb,
  masterGainDb,
  bypassed,
  momentaryLufs,
  shortTermLufs,
  integratedLufs,
  compressorReductionDb,
  limiterReductionDb,
  onToggleBypass,
  onMasterGainChange,
  onEqLowChange,
  onEqMidChange,
  onEqHighChange,
  onCompressorThresholdChange,
  onCompressorRatioChange,
  onLimiterCeilingChange,
}: MasteringPanelProps) {
  return (
    <div className={`flex flex-col gap-4 rounded bg-neutral-900 p-4 ${bypassed ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Masterización</h2>
          <button
            type="button"
            onClick={onToggleBypass}
            className={`rounded px-2 py-1 text-[10px] uppercase ${
              bypassed ? 'bg-amber-500 text-black' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
            title="Comparar procesado vs. original (A/B)"
          >
            {bypassed ? 'Bypass ON (original)' : 'Bypass'}
          </button>
        </div>
        <div className="flex gap-4 font-mono text-xs text-neutral-300">
          <span>M: {formatLufs(momentaryLufs)}</span>
          <span>S: {formatLufs(shortTermLufs)}</span>
          <span className="text-purple-300">
            Int: {formatLufs(integratedLufs)} LUFS
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[10px] uppercase text-neutral-600">EQ</p>
        <SliderRow label="Graves (120Hz)" value={eqLowDb} min={-12} max={12} step={0.5} unit="dB" resetTo={0} onChange={onEqLowChange} />
        <SliderRow label="Medios (1kHz)" value={eqMidDb} min={-12} max={12} step={0.5} unit="dB" resetTo={0} onChange={onEqMidChange} />
        <SliderRow label="Agudos (8kHz)" value={eqHighDb} min={-12} max={12} step={0.5} unit="dB" resetTo={0} onChange={onEqHighChange} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[10px] uppercase text-neutral-600">Compresor</p>
        <SliderRow label="Umbral" value={compressorThreshold} min={-60} max={0} step={1} unit="dB" resetTo={-24} onChange={onCompressorThresholdChange} />
        <SliderRow label="Ratio" value={compressorRatio} min={1} max={20} step={0.5} unit=":1" resetTo={3} onChange={onCompressorRatioChange} />
        <ReductionMeter label="Reducción comp." reductionDb={compressorReductionDb} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[10px] uppercase text-neutral-600">Limitador</p>
        <SliderRow label="Techo" value={limiterCeilingDb} min={-6} max={0} step={0.1} unit="dB" resetTo={-1} onChange={onLimiterCeilingChange} />
        <ReductionMeter label="Reducción lim." reductionDb={limiterReductionDb} />
      </div>

      <div className="flex flex-col gap-2 border-t border-neutral-800 pt-3">
        <p className="text-[10px] uppercase text-neutral-600">Master</p>
        <SliderRow label="Ganancia master" value={masterGainDb} min={-24} max={12} step={0.5} unit="dB" resetTo={0} onChange={onMasterGainChange} />
      </div>
    </div>
  )
}

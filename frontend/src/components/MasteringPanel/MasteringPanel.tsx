import { Button } from '../ui/Button'
import { ReductionMeter, Slider } from '../ui/Slider'

// Below this we're measuring float noise on digital silence, not signal — BS.1770's own
// absolute gate (-70 LUFS) is a sensible floor for the display.
const SILENCE_FLOOR_LUFS = -70
/** Streaming platforms normalize to roughly this; it's the number worth aiming at. */
const TARGET_LUFS = -14

function formatLufs(value: number): string {
  if (!Number.isFinite(value) || value < SILENCE_FLOOR_LUFS) return '−∞'
  return value.toFixed(1)
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-[var(--border)] px-3 py-3 last:border-0">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{title}</h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  )
}

function LoudnessReadout({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  const off = Number.isFinite(value) && value >= SILENCE_FLOOR_LUFS ? value - TARGET_LUFS : null
  return (
    <div className="flex flex-col items-center rounded-md bg-[var(--bg-app)] px-2 py-1.5">
      <span className="text-[9px] uppercase tracking-wide text-[var(--text-faint)]">{label}</span>
      <span className={`tnum text-[13px] font-medium ${highlight ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
        {formatLufs(value)}
      </span>
      {highlight && off !== null && (
        <span className="tnum text-[9px] text-[var(--text-faint)]">
          {off >= 0 ? '+' : ''}
          {off.toFixed(1)} vs −14
        </span>
      )}
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

export function MasteringPanel(props: MasteringPanelProps) {
  const { bypassed } = props
  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-panel)]">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Mastering</h2>
        <Button
          size="sm"
          variant={bypassed ? 'default' : 'ghost'}
          active={bypassed}
          onClick={props.onToggleBypass}
          title="Compare processed vs. original (A/B)"
        >
          {bypassed ? 'Bypassed' : 'Bypass'}
        </Button>
      </div>

      <div className={`flex-1 overflow-y-auto ${bypassed ? 'opacity-45' : ''}`}>
        <div className="grid grid-cols-3 gap-1.5 px-3 py-3">
          <LoudnessReadout label="Mom" value={props.momentaryLufs} />
          <LoudnessReadout label="Short" value={props.shortTermLufs} />
          <LoudnessReadout label="Integrated" value={props.integratedLufs} highlight />
        </div>

        <Section title="EQ">
          <Slider label="Low" value={props.eqLowDb} min={-12} max={12} step={0.5} unit="dB" resetTo={0} onChange={props.onEqLowChange} />
          <Slider label="Mid" value={props.eqMidDb} min={-12} max={12} step={0.5} unit="dB" resetTo={0} onChange={props.onEqMidChange} />
          <Slider label="High" value={props.eqHighDb} min={-12} max={12} step={0.5} unit="dB" resetTo={0} onChange={props.onEqHighChange} />
        </Section>

        <Section title="Compressor">
          <Slider
            label="Threshold"
            value={props.compressorThreshold}
            min={-60}
            max={0}
            step={1}
            unit="dB"
            resetTo={-24}
            precision={0}
            onChange={props.onCompressorThresholdChange}
          />
          <Slider
            label="Ratio"
            value={props.compressorRatio}
            min={1}
            max={20}
            step={0.5}
            unit=":1"
            resetTo={3}
            onChange={props.onCompressorRatioChange}
          />
          <ReductionMeter label="Reduction" reductionDb={props.compressorReductionDb} />
        </Section>

        <Section title="Limiter">
          <Slider
            label="Ceiling"
            value={props.limiterCeilingDb}
            min={-6}
            max={0}
            step={0.1}
            unit="dB"
            resetTo={-1}
            onChange={props.onLimiterCeilingChange}
          />
          <ReductionMeter label="Reduction" reductionDb={props.limiterReductionDb} />
        </Section>

        <Section title="Master">
          <Slider
            label="Gain"
            value={props.masterGainDb}
            min={-24}
            max={12}
            step={0.5}
            unit="dB"
            resetTo={0}
            onChange={props.onMasterGainChange}
          />
        </Section>
      </div>
    </aside>
  )
}

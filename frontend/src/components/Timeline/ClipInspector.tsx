import type { Clip } from '../../types/project'

interface ClipInspectorProps {
  clip: Clip
  onFadeChange: (fade: { fadeIn?: number; fadeOut?: number }) => void
  onGainChange: (gainDb: number) => void
  onToggleMuted: () => void
}

export function ClipInspector({ clip, onFadeChange, onGainChange, onToggleMuted }: ClipInspectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded bg-neutral-900 px-4 py-2 text-xs text-neutral-400">
      <span className="text-neutral-500">Pieza seleccionada</span>
      <label className="flex items-center gap-1">
        fade in
        <input
          type="number"
          min={0}
          step={0.1}
          value={clip.fadeIn}
          onChange={(e) => onFadeChange({ fadeIn: Math.max(0, Number(e.target.value)) })}
          className="w-14 rounded bg-neutral-800 px-1 py-0.5 text-neutral-200"
        />
      </label>
      <label className="flex items-center gap-1">
        fade out
        <input
          type="number"
          min={0}
          step={0.1}
          value={clip.fadeOut}
          onChange={(e) => onFadeChange({ fadeOut: Math.max(0, Number(e.target.value)) })}
          className="w-14 rounded bg-neutral-800 px-1 py-0.5 text-neutral-200"
        />
      </label>
      <label className="flex items-center gap-2">
        gain
        <input
          type="range"
          min={-24}
          max={12}
          step={0.5}
          value={clip.gainDb ?? 0}
          onChange={(e) => onGainChange(Number(e.target.value))}
          onDoubleClick={() => onGainChange(0)}
          className="w-24 accent-purple-500"
        />
        <span className="w-12 text-right font-mono text-neutral-300">{(clip.gainDb ?? 0).toFixed(1)}dB</span>
      </label>
      <button
        type="button"
        onClick={onToggleMuted}
        className={`rounded px-2 py-1 ${
          clip.muted ? 'bg-red-500 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
        }`}
      >
        {clip.muted ? 'Activar sonido' : 'Silenciar pieza'}
      </button>
    </div>
  )
}

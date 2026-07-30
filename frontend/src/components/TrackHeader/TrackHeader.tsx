interface TrackHeaderProps {
  name: string
  volume: number
  fadeIn: number
  fadeOut: number
  onVolumeChange: (volume: number) => void
  onFadeChange: (fade: { fadeIn?: number; fadeOut?: number }) => void
  onRemove: () => void
}

export function TrackHeader({
  name,
  volume,
  fadeIn,
  fadeOut,
  onVolumeChange,
  onFadeChange,
  onRemove,
}: TrackHeaderProps) {
  return (
    <div className="flex w-44 shrink-0 flex-col justify-center gap-1.5 rounded bg-neutral-800 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="truncate text-xs font-medium text-neutral-200">{name}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-neutral-500 hover:text-red-400"
          title="Quitar pista"
        >
          ✕
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={1.5}
        step={0.01}
        value={volume}
        onChange={(e) => onVolumeChange(Number(e.target.value))}
        className="w-full accent-purple-500"
        title="Volumen"
      />
      <div className="flex items-center gap-2 text-[10px] text-neutral-500">
        <label className="flex items-center gap-1">
          fade in
          <input
            type="number"
            min={0}
            step={0.1}
            value={fadeIn}
            onChange={(e) => onFadeChange({ fadeIn: Math.max(0, Number(e.target.value)) })}
            className="w-12 rounded bg-neutral-900 px-1 py-0.5 text-neutral-200"
          />
        </label>
        <label className="flex items-center gap-1">
          out
          <input
            type="number"
            min={0}
            step={0.1}
            value={fadeOut}
            onChange={(e) => onFadeChange({ fadeOut: Math.max(0, Number(e.target.value)) })}
            className="w-12 rounded bg-neutral-900 px-1 py-0.5 text-neutral-200"
          />
        </label>
      </div>
    </div>
  )
}

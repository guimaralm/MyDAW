const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'Space', label: 'Play / pause' },
  { keys: 'Home', label: 'Back to start' },
  { keys: '⌘E', label: 'Cut all tracks at the cursor' },
  { keys: '⌘D', label: 'Duplicate the selection onto a new lane' },
  { keys: 'Delete', label: 'Delete selection, or the selected piece' },
  { keys: '⌘Z / ⇧⌘Z', label: 'Undo / redo' },
  { keys: 'Esc', label: 'Clear selection' },
  { keys: 'Drag on a clip', label: 'Select a range' },
  { keys: 'Right-click', label: 'Actions for the piece or selection' },
  { keys: 'Drag clip edges', label: 'Trim' },
  { keys: 'Alt + drag', label: 'Slide a piece in time' },
  { keys: 'Shift + drag', label: 'Set the loop region' },
  { keys: '⌘ + scroll', label: 'Zoom at the pointer' },
]

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onPointerDown={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-[var(--border-strong)] bg-[var(--bg-panel)] p-5 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text)]">Keyboard &amp; mouse</h2>
          <button type="button" onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text)]">
            ✕
          </button>
        </div>
        <dl className="flex flex-col">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between gap-4 border-b border-[var(--border)] py-1.5 last:border-0">
              <dt className="text-xs text-[var(--text-dim)]">{s.label}</dt>
              <dd className="shrink-0 rounded border border-[var(--border)] bg-[var(--bg-raised)] px-1.5 py-0.5 text-[10px] text-[var(--text)]">
                {s.keys}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

import { Button, ToolbarDivider } from '../ui/Button'

interface TopBarProps {
  hasAudio: boolean
  exporting: 'wav' | 'mp3' | null
  masteringOpen: boolean
  onImport: () => void
  onUndo: () => void
  onRedo: () => void
  onExportWav: () => void
  onExportMp3: () => void
  onToggleMastering: () => void
  onOpenProjects: () => void
  onShowShortcuts: () => void
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2 pr-1">
      <div
        className="grid h-6 w-6 place-items-center rounded-[7px] text-[11px] font-bold text-white"
        style={{ background: 'linear-gradient(140deg, #c084fc, #7c3aed)' }}
      >
        M
      </div>
      <span className="text-[13px] font-semibold tracking-tight text-[var(--text)]">MyDAW</span>
    </div>
  )
}

export function TopBar({
  hasAudio,
  exporting,
  masteringOpen,
  onImport,
  onUndo,
  onRedo,
  onExportWav,
  onExportMp3,
  onToggleMastering,
  onOpenProjects,
  onShowShortcuts,
}: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3">
      <Wordmark />
      <ToolbarDivider />

      <Button variant="default" onClick={onImport} title="Import a song and split it into stems">
        Import
      </Button>

      <ToolbarDivider />
      <Button variant="ghost" size="sm" onClick={onUndo} title="Undo (⌘Z)">
        Undo
      </Button>
      <Button variant="ghost" size="sm" onClick={onRedo} title="Redo (⇧⌘Z)">
        Redo
      </Button>

      <div className="ml-auto flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={onShowShortcuts} title="Keyboard shortcuts">
          ?
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenProjects} title="Save or open a project">
          Projects
        </Button>
        <ToolbarDivider />
        <Button variant="default" size="sm" disabled={!hasAudio || exporting !== null} onClick={onExportWav}>
          {exporting === 'wav' ? 'Rendering…' : 'Export WAV'}
        </Button>
        <Button variant="default" size="sm" disabled={!hasAudio || exporting !== null} onClick={onExportMp3}>
          {exporting === 'mp3' ? 'Encoding…' : 'MP3'}
        </Button>
        <ToolbarDivider />
        <Button variant="default" size="sm" active={masteringOpen} onClick={onToggleMastering} title="Toggle mastering panel">
          Mastering
        </Button>
      </div>
    </header>
  )
}

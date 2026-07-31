import { useEffect, useState } from 'react'
import type { ProjectRecord } from '../../services/persistence'
import { Button } from '../ui/Button'

interface ProjectPanelProps {
  onSave: (name: string) => Promise<void>
  onLoad: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  listProjects: () => Promise<ProjectRecord[]>
  disabled: boolean
}

export function ProjectPanel({ onSave, onLoad, onDelete, listProjects, disabled }: ProjectPanelProps) {
  const [name, setName] = useState('')
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [busy, setBusy] = useState(false)

  async function refresh() {
    setProjects(await listProjects())
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function handleSave() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await onSave(name.trim())
      setName('')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-panel)] p-5 shadow-2xl">
      <h2 className="text-sm font-semibold text-[var(--text)]">Projects</h2>
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave()
          }}
          placeholder="Project name"
          className="flex-1 rounded-md bg-[var(--bg-app)] px-2.5 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline focus:outline-1 focus:outline-[var(--accent)]"
        />
        <Button variant="primary" size="md" disabled={disabled || busy || !name.trim()} onClick={handleSave}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {projects.length === 0 ? (
        <p className="text-[11px] text-[var(--text-faint)]">No saved projects yet.</p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {projects.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-md bg-[var(--bg-raised)] px-2.5 py-1.5 text-xs"
            >
              <span className="truncate text-[var(--text)]">{p.name}</span>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => onLoad(p.id)}>
                  Open
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(p.id).then(refresh)} title="Delete project">
                  ✕
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

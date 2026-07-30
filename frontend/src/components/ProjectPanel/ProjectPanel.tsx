import { useEffect, useState } from 'react'
import type { ProjectRecord } from '../../services/persistence'

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
    <div className="flex flex-col gap-2 rounded bg-neutral-900 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Proyecto</h2>
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del proyecto"
          className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-600"
        />
        <button
          type="button"
          disabled={disabled || busy || !name.trim()}
          onClick={handleSave}
          className="rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      {projects.length > 0 && (
        <ul className="flex flex-col gap-1">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded bg-neutral-800 px-2 py-1 text-xs">
              <span className="text-neutral-300">{p.name}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => onLoad(p.id)} className="text-purple-400 hover:text-purple-300">
                  Cargar
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(p.id).then(refresh)}
                  className="text-neutral-500 hover:text-red-400"
                >
                  Borrar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

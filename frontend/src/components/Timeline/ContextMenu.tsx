import { useEffect } from 'react'

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

/** Lightweight floating context menu. Closes on outside click, Escape, or item selection. */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  useEffect(() => {
    function onDocDown() {
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    // Defer the outside-click listener so the same click that opened the menu doesn't close it.
    const id = window.setTimeout(() => {
      window.addEventListener('pointerdown', onDocDown)
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('pointerdown', onDocDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      className="fixed z-50 min-w-44 overflow-hidden rounded border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            item.onClick()
            onClose()
          }}
          className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-800 ${
            item.danger ? 'text-red-400' : 'text-neutral-200'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

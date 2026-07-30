import { useRef, useState, type DragEvent } from 'react'

interface ImportPanelProps {
  onFilesSelected: (files: File[]) => void
}

export function ImportPanel({ onFilesSelected }: ImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length) onFilesSelected(files)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer items-center justify-center rounded border-2 border-dashed p-8 text-sm transition-colors ${
        isDragging ? 'border-purple-400 bg-purple-950/20' : 'border-neutral-700 text-neutral-400'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp3"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) onFilesSelected(files)
          e.target.value = ''
        }}
      />
      <p>Arrastrá una o más canciones (mp3/wav) acá para separarlas en stems, o hacé click para elegir archivos</p>
    </div>
  )
}

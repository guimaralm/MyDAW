const cache = new Map<string, AudioBuffer>()

export const bufferCache = {
  set(id: string, buffer: AudioBuffer): void {
    cache.set(id, buffer)
  },
  get(id: string): AudioBuffer | undefined {
    return cache.get(id)
  },
  delete(id: string): void {
    cache.delete(id)
  },
}

if (import.meta.env.DEV) {
  ;(window as unknown as { __bufferCache: typeof bufferCache }).__bufferCache = bufferCache
}

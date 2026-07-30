import type { Mp3EncodeRequest, Mp3EncodeResponse } from '../types/mp3Encoding'

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const bitDepth = 16
  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample
  const dataLength = buffer.length * blockAlign
  const arrayBuffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(arrayBuffer)

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(36, 'data')
  view.setUint32(40, dataLength, true)

  const channelData: Float32Array[] = []
  for (let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch))

  let offset = 44
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const clamped = Math.max(-1, Math.min(1, channelData[ch][i]))
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

export function audioBufferToMp3Blob(buffer: AudioBuffer): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/mp3Encoder.worker.ts', import.meta.url), { type: 'classic' })
    const channelData: Float32Array[] = []
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) channelData.push(buffer.getChannelData(ch).slice())

    worker.onmessage = (event: MessageEvent<Mp3EncodeResponse>) => {
      const blob = new Blob(event.data.chunks.map((c) => new Uint8Array(c)), { type: 'audio/mpeg' })
      worker.terminate()
      resolve(blob)
    }
    worker.onerror = (err) => {
      worker.terminate()
      reject(err)
    }

    const request: Mp3EncodeRequest = { channelData, sampleRate: buffer.sampleRate }
    worker.postMessage(request, channelData.map((c) => c.buffer))
  })
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

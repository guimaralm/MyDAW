// lamejs's own npm package isn't a clean ES/CJS module (bundling it via esbuild throws
// "MPEGMode is not defined" at runtime), so we load its self-contained UMD build directly
// via importScripts — this is a classic (non-module) worker for that reason, and it must
// not import types from other files either (Vite's classic-worker dev transform chokes on
// the `export` in the imported file), so request/response shapes are typed inline here.
importScripts('/vendor/lame.all.js')

declare const lamejs: {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
    encodeBuffer: (left: Int16Array, right?: Int16Array) => Int8Array
    flush: () => Int8Array
  }
}

interface Mp3EncodeRequest {
  channelData: Float32Array[]
  sampleRate: number
  kbps?: number
}

function toInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return int16
}

self.onmessage = (event: MessageEvent<Mp3EncodeRequest>) => {
  const { channelData, sampleRate, kbps = 192 } = event.data
  const numChannels = channelData.length
  const encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps)
  const blockSize = 1152
  const chunks: Int8Array[] = []

  const left = toInt16(channelData[0])
  const right = numChannels > 1 ? toInt16(channelData[1]) : undefined

  for (let i = 0; i < left.length; i += blockSize) {
    const leftChunk = left.subarray(i, i + blockSize)
    const rightChunk = right?.subarray(i, i + blockSize)
    const mp3buf = rightChunk ? encoder.encodeBuffer(leftChunk, rightChunk) : encoder.encodeBuffer(leftChunk)
    if (mp3buf.length > 0) chunks.push(mp3buf)
  }
  const finalChunk = encoder.flush()
  if (finalChunk.length > 0) chunks.push(finalChunk)

  self.postMessage({ chunks })
}

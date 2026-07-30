export interface Mp3EncodeRequest {
  channelData: Float32Array[]
  sampleRate: number
  kbps?: number
}

export interface Mp3EncodeResponse {
  chunks: Int8Array[]
}

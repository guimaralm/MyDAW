/**
 * Approximate BS.1770 loudness meter: two-stage K-weighting biquad cascade (the standard
 * high-shelf "head effect" pre-filter + high-pass RLB filter), then a windowed mean-square
 * converted to LUFS. This intentionally skips the full spec's absolute/relative gating and
 * true-peak oversampling — it's a real, standards-based momentary/short-term readout for
 * mixing feedback, not a certified loudness-compliance measurement.
 */
class Biquad {
  constructor(b0, b1, b2, a1, a2) {
    this.b0 = b0
    this.b1 = b1
    this.b2 = b2
    this.a1 = a1
    this.a2 = a2
    this.x1 = 0
    this.x2 = 0
    this.y1 = 0
    this.y2 = 0
  }

  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = y
    return y
  }
}

function makeHighShelf(fs, f0, gainDb, q) {
  const a = Math.pow(10, gainDb / 40)
  const w0 = (2 * Math.PI * f0) / fs
  const alpha = Math.sin(w0) / (2 * q)
  const cosw0 = Math.cos(w0)
  const sqrtA = Math.sqrt(a)
  const b0 = a * (a + 1 + (a - 1) * cosw0 + 2 * sqrtA * alpha)
  const b1 = -2 * a * (a - 1 + (a + 1) * cosw0)
  const b2 = a * (a + 1 + (a - 1) * cosw0 - 2 * sqrtA * alpha)
  const a0 = a + 1 - (a - 1) * cosw0 + 2 * sqrtA * alpha
  const a1 = 2 * (a - 1 - (a + 1) * cosw0)
  const a2 = a + 1 - (a - 1) * cosw0 - 2 * sqrtA * alpha
  return new Biquad(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)
}

function makeHighPass(fs, f0, q) {
  const w0 = (2 * Math.PI * f0) / fs
  const alpha = Math.sin(w0) / (2 * q)
  const cosw0 = Math.cos(w0)
  const b0 = (1 + cosw0) / 2
  const b1 = -(1 + cosw0)
  const b2 = (1 + cosw0) / 2
  const a0 = 1 + alpha
  const a1 = -2 * cosw0
  const a2 = 1 - alpha
  return new Biquad(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)
}

const MOMENTARY_SECONDS = 0.4
const SHORT_TERM_SECONDS = 3.0
const POST_INTERVAL_SECONDS = 0.1

class LufsProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.stage1 = []
    this.stage2 = []
    this.momentaryWindowSamples = Math.round(MOMENTARY_SECONDS * sampleRate)
    this.shortTermWindowSamples = Math.round(SHORT_TERM_SECONDS * sampleRate)
    this.momentaryBlocks = []
    this.shortTermBlocks = []
    this.momentarySampleCount = 0
    this.shortTermSampleCount = 0
    this.momentarySumSq = 0
    this.shortTermSumSq = 0
    this.samplesSincePost = 0
    this.postIntervalSamples = Math.round(POST_INTERVAL_SECONDS * sampleRate)

    // Integrated loudness: accumulate 400ms block mean-squares, then apply BS.1770 gating
    // (absolute -70 LUFS gate, then relative gate at -10 LU below the ungated mean).
    this.blockSamples = Math.round(0.4 * sampleRate)
    this.integBlockSumSq = 0
    this.integBlockCount = 0
    this.gatingBlocks = []

    this.port.onmessage = (event) => {
      if (event.data?.resetIntegrated) {
        this.integBlockSumSq = 0
        this.integBlockCount = 0
        this.gatingBlocks = []
      }
    }
  }

  computeIntegrated() {
    if (this.gatingBlocks.length === 0) return -Infinity
    // Absolute gate.
    const absolute = this.gatingBlocks.filter((ms) => ms > 0 && -0.691 + 10 * Math.log10(ms) > -70)
    if (absolute.length === 0) return -Infinity
    const meanAbs = absolute.reduce((a, b) => a + b, 0) / absolute.length
    const relThreshold = -0.691 + 10 * Math.log10(meanAbs) - 10
    // Relative gate.
    const gated = absolute.filter((ms) => -0.691 + 10 * Math.log10(ms) > relThreshold)
    if (gated.length === 0) return -Infinity
    const meanGated = gated.reduce((a, b) => a + b, 0) / gated.length
    return -0.691 + 10 * Math.log10(meanGated)
  }

  ensureFilters(numChannels) {
    while (this.stage1.length < numChannels) {
      this.stage1.push(makeHighShelf(sampleRate, 1681.9744509555319, 3.99984385397, 0.7071752369554193))
      this.stage2.push(makeHighPass(sampleRate, 38.13547087613982, 0.5003270373238773))
    }
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0 || input[0].length === 0) return true

    const numChannels = input.length
    this.ensureFilters(numChannels)
    const blockSize = input[0].length

    let blockSumSq = 0
    for (let ch = 0; ch < numChannels; ch++) {
      const data = input[ch]
      const s1 = this.stage1[ch]
      const s2 = this.stage2[ch]
      for (let i = 0; i < blockSize; i++) {
        const weighted = s2.process(s1.process(data[i]))
        blockSumSq += weighted * weighted
      }
    }

    this.momentaryBlocks.push(blockSumSq)
    this.shortTermBlocks.push(blockSumSq)
    this.momentarySumSq += blockSumSq
    this.shortTermSumSq += blockSumSq
    this.momentarySampleCount += blockSize
    this.shortTermSampleCount += blockSize

    // Accumulate 400ms gating blocks for the integrated measurement.
    this.integBlockSumSq += blockSumSq
    this.integBlockCount += blockSize
    if (this.integBlockCount >= this.blockSamples) {
      this.gatingBlocks.push(this.integBlockSumSq / (this.integBlockCount * numChannels))
      this.integBlockSumSq = 0
      this.integBlockCount = 0
    }

    while (this.momentarySampleCount > this.momentaryWindowSamples && this.momentaryBlocks.length > 1) {
      this.momentarySumSq -= this.momentaryBlocks.shift()
      this.momentarySampleCount -= blockSize
    }
    while (this.shortTermSampleCount > this.shortTermWindowSamples && this.shortTermBlocks.length > 1) {
      this.shortTermSumSq -= this.shortTermBlocks.shift()
      this.shortTermSampleCount -= blockSize
    }

    this.samplesSincePost += blockSize
    if (this.samplesSincePost >= this.postIntervalSamples) {
      this.samplesSincePost = 0
      const meanSqMomentary = this.momentarySumSq / (this.momentarySampleCount * numChannels || 1)
      const meanSqShortTerm = this.shortTermSumSq / (this.shortTermSampleCount * numChannels || 1)
      this.port.postMessage({
        momentaryLufs: meanSqMomentary > 0 ? -0.691 + 10 * Math.log10(meanSqMomentary) : -Infinity,
        shortTermLufs: meanSqShortTerm > 0 ? -0.691 + 10 * Math.log10(meanSqShortTerm) : -Infinity,
        integratedLufs: this.computeIntegrated(),
      })
    }

    return true
  }
}

registerProcessor('lufs-processor', LufsProcessor)

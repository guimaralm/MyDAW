/**
 * Lookahead brickwall limiter. A native DynamicsCompressorNode cannot guarantee a hard
 * ceiling, so this runs on the audio thread as a small custom processor: it delays the
 * signal by `lookaheadSeconds`, and computes the gain for the sample currently exiting the
 * delay line from the WORST-CASE peak across the *entire* lookahead window ahead of it
 * (not just the single newest sample) — that's what actually prevents overshoot: gain
 * reduction has to already be in effect by the time a loud sample reaches the output, not
 * just triggered by it. Release is smoothed to avoid audible pumping; attack is instant.
 */
class LimiterProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.lookaheadSamples = Math.max(1, Math.round(0.005 * sampleRate))
    this.releaseSamples = Math.max(1, Math.round(0.1 * sampleRate))
    this.ceiling = Math.pow(10, -1 / 20) // default -1 dBFS
    this.delayBuffers = null
    this.peakWindow = null
    this.writeIndex = 0
    this.gainReduction = 1
    // Report the worst (lowest) gain reduction over ~100ms windows so the UI meter is legible.
    this.minGainThisWindow = 1
    this.samplesSincePost = 0
    this.postIntervalSamples = Math.max(1, Math.round(0.1 * sampleRate))

    this.port.onmessage = (event) => {
      if (typeof event.data?.ceilingDb === 'number') {
        this.ceiling = Math.pow(10, event.data.ceilingDb / 20)
      }
    }
  }

  process(inputs, outputs) {
    const input = inputs[0]
    const output = outputs[0]
    if (!input || input.length === 0) return true

    const numChannels = input.length
    const blockSize = input[0].length

    if (!this.delayBuffers) {
      this.delayBuffers = Array.from({ length: numChannels }, () => new Float32Array(this.lookaheadSamples))
      this.peakWindow = new Float32Array(this.lookaheadSamples)
    }

    for (let i = 0; i < blockSize; i++) {
      let peak = 0
      for (let ch = 0; ch < numChannels; ch++) {
        const abs = Math.abs(input[ch][i])
        if (abs > peak) peak = abs
      }
      this.peakWindow[this.writeIndex] = peak

      let windowMaxPeak = 0
      for (let k = 0; k < this.lookaheadSamples; k++) {
        if (this.peakWindow[k] > windowMaxPeak) windowMaxPeak = this.peakWindow[k]
      }
      const desiredGain = windowMaxPeak > this.ceiling ? this.ceiling / windowMaxPeak : 1

      if (desiredGain < this.gainReduction) {
        this.gainReduction = desiredGain
      } else {
        this.gainReduction += (1 - this.gainReduction) / this.releaseSamples
        if (this.gainReduction > 1) this.gainReduction = 1
      }

      for (let ch = 0; ch < numChannels; ch++) {
        const buf = this.delayBuffers[ch]
        const delayed = buf[this.writeIndex]
        buf[this.writeIndex] = input[ch][i]
        output[ch][i] = delayed * this.gainReduction
      }
      this.writeIndex = (this.writeIndex + 1) % this.lookaheadSamples

      if (this.gainReduction < this.minGainThisWindow) this.minGainThisWindow = this.gainReduction
      if (++this.samplesSincePost >= this.postIntervalSamples) {
        this.port.postMessage({ reductionDb: 20 * Math.log10(this.minGainThisWindow) })
        this.minGainThisWindow = 1
        this.samplesSincePost = 0
      }
    }

    return true
  }
}

registerProcessor('limiter-processor', LimiterProcessor)

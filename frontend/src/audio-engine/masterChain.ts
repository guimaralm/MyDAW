export interface MasterChain {
  input: GainNode
  eqLow: BiquadFilterNode
  eqMid: BiquadFilterNode
  eqHigh: BiquadFilterNode
  compressor: DynamicsCompressorNode
  limiter: AudioWorkletNode
  output: GainNode
  lufsMeter: AudioWorkletNode
  analyser: AnalyserNode
}

/**
 * input ─▶ EQ (low/mid/high) ─▶ compressor ─▶ limiter ─┐
 *   └────────────(bypass path, toggled by engine)──────┴▶ output ─▶ analyser ─▶ destination
 *                                                                └▶ lufsMeter ─▶ silent sink ─▶ destination
 *
 * The processed path and a direct bypass path both feed `output`; the engine connects exactly
 * one of them at a time (see setChainBypass) so you can A/B the whole chain. The LUFS tap is
 * parallel and silent (gain 0) so it never affects the audible signal.
 */
export async function createMasterChain(ctx: BaseAudioContext): Promise<MasterChain> {
  await ctx.audioWorklet.addModule('/worklets/limiter-processor.js')
  await ctx.audioWorklet.addModule('/worklets/lufs-processor.js')

  const input = ctx.createGain()

  const eqLow = ctx.createBiquadFilter()
  eqLow.type = 'lowshelf'
  eqLow.frequency.value = 120

  const eqMid = ctx.createBiquadFilter()
  eqMid.type = 'peaking'
  eqMid.frequency.value = 1000
  eqMid.Q.value = 1

  const eqHigh = ctx.createBiquadFilter()
  eqHigh.type = 'highshelf'
  eqHigh.frequency.value = 8000

  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -24
  compressor.knee.value = 30
  compressor.ratio.value = 3
  compressor.attack.value = 0.01
  compressor.release.value = 0.25

  const limiter = new AudioWorkletNode(ctx, 'limiter-processor', { outputChannelCount: [2] })
  const output = ctx.createGain()

  const lufsMeter = new AudioWorkletNode(ctx, 'lufs-processor')
  const lufsSink = ctx.createGain()
  lufsSink.gain.value = 0

  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048

  // Processed path is the default; the bypass path (input -> output) is wired on demand.
  input.connect(eqLow).connect(eqMid).connect(eqHigh).connect(compressor).connect(limiter).connect(output)
  output.connect(analyser).connect(ctx.destination)
  output.connect(lufsMeter).connect(lufsSink).connect(ctx.destination)

  return { input, eqLow, eqMid, eqHigh, compressor, limiter, output, lufsMeter, analyser }
}

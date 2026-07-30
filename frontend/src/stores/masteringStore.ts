import { create } from 'zustand'

interface MasteringState {
  eqLowDb: number
  eqMidDb: number
  eqHighDb: number
  compressorThreshold: number
  compressorRatio: number
  limiterCeilingDb: number
  masterGainDb: number
  setEqLowDb: (v: number) => void
  setEqMidDb: (v: number) => void
  setEqHighDb: (v: number) => void
  setCompressorThreshold: (v: number) => void
  setCompressorRatio: (v: number) => void
  setLimiterCeilingDb: (v: number) => void
  setMasterGainDb: (v: number) => void
}

export const useMasteringStore = create<MasteringState>((set) => ({
  eqLowDb: 0,
  eqMidDb: 0,
  eqHighDb: 0,
  compressorThreshold: -24,
  compressorRatio: 3,
  limiterCeilingDb: -1,
  masterGainDb: 0,
  setEqLowDb: (v) => set({ eqLowDb: v }),
  setEqMidDb: (v) => set({ eqMidDb: v }),
  setEqHighDb: (v) => set({ eqHighDb: v }),
  setCompressorThreshold: (v) => set({ compressorThreshold: v }),
  setCompressorRatio: (v) => set({ compressorRatio: v }),
  setLimiterCeilingDb: (v) => set({ limiterCeilingDb: v }),
  setMasterGainDb: (v) => set({ masterGainDb: v }),
}))

import { create } from 'zustand'
import type { JobStatus } from '../services/stemSeparationApi'

export interface StemJob {
  id: string
  fileName: string
  status: JobStatus | 'uploading'
  error?: string
}

interface StemJobState {
  jobs: StemJob[]
  addJob: (job: StemJob) => void
  updateJob: (id: string, patch: Partial<StemJob>) => void
  removeJob: (id: string) => void
}

export const useStemJobStore = create<StemJobState>((set) => ({
  jobs: [],
  addJob: (job) => set((s) => ({ jobs: [...s.jobs, job] })),
  updateJob: (id, patch) => set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) })),
  removeJob: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
}))

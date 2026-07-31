import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Clip, Track } from '../types/project'

export interface MasteringSettings {
  eqLowDb: number
  eqMidDb: number
  eqHighDb: number
  compressorThreshold: number
  compressorRatio: number
  limiterCeilingDb: number
  masterGainDb: number
}

export interface ProjectRecord {
  id: string
  name: string
  savedAt: number
  tracks: Track[]
  clips: Clip[]
  mastering: MasteringSettings
  bufferIds: string[]
}

interface StoredBuffer {
  channels: Float32Array[]
  sampleRate: number
  length: number
  numberOfChannels: number
}

interface MyDawDb extends DBSchema {
  projects: { key: string; value: ProjectRecord }
  blobs: { key: string; value: StoredBuffer }
}

const DB_NAME = 'mydaw-projects'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<MyDawDb>> | null = null

function getDb(): Promise<IDBPDatabase<MyDawDb>> {
  if (!dbPromise) {
    dbPromise = openDB<MyDawDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs')
      },
    })
  }
  return dbPromise
}

export async function saveProject(record: ProjectRecord, buffers: Map<string, AudioBuffer>): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['projects', 'blobs'], 'readwrite')
  await tx.objectStore('projects').put(record)
  for (const bufferId of record.bufferIds) {
    const buffer = buffers.get(bufferId)
    if (!buffer) continue
    const channels: Float32Array[] = []
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch).slice())
    await tx.objectStore('blobs').put(
      { channels, sampleRate: buffer.sampleRate, length: buffer.length, numberOfChannels: buffer.numberOfChannels },
      bufferId,
    )
  }
  await tx.done
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const db = await getDb()
  const all = await db.getAll('projects')
  return all.sort((a, b) => b.savedAt - a.savedAt)
}

export async function loadProject(
  id: string,
): Promise<{ record: ProjectRecord; buffers: Map<string, AudioBuffer> } | null> {
  const db = await getDb()
  const record = await db.get('projects', id)
  if (!record) return null

  const buffers = new Map<string, AudioBuffer>()
  const ctx = new AudioContext()
  try {
    for (const bufferId of record.bufferIds) {
      const stored = await db.get('blobs', bufferId)
      if (!stored) continue
      const audioBuffer = ctx.createBuffer(stored.numberOfChannels, stored.length, stored.sampleRate)
      for (let ch = 0; ch < stored.numberOfChannels; ch++) audioBuffer.copyToChannel(stored.channels[ch], ch)
      buffers.set(bufferId, audioBuffer)
    }
  } finally {
    await ctx.close()
  }

  return { record, buffers }
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb()
  const record = await db.get('projects', id)
  const tx = db.transaction(['projects', 'blobs'], 'readwrite')
  await tx.objectStore('projects').delete(id)
  if (record) for (const bufferId of record.bufferIds) await tx.objectStore('blobs').delete(bufferId)
  await tx.done
}

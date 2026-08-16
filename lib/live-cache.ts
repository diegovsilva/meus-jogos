import { get, put } from "@vercel/blob"
import type { Fixture } from "./football"

export type LiveSource = "api-football" | "football-data" | "thesportsdb" | "google"

export interface LiveSourceSnapshot {
  source: LiveSource
  fixture: Fixture
  seenAt: string
  confidence: "high" | "medium" | "low"
  isFallback: boolean
}

export interface LiveCacheRecord {
  key: string
  primarySource: LiveSource
  isFallback: boolean
  updatedAt: string
  staleAt: string
  sources: LiveSource[]
  confidence: "high" | "medium" | "low"
  snapshots: Partial<Record<LiveSource, LiveSourceSnapshot>>
}

const LIVE_SOURCE_PRIORITY: Record<LiveSource, number> = {
  "api-football": 4,
  "football-data": 3,
  thesportsdb: 2,
  google: 1,
}

const LIVE_CACHE_TTL_MS = Number(process.env.LIVE_CACHE_TTL_SECONDS || "180") * 1000
const LIVE_CACHE_BLOB_REFRESH_MS = Number(process.env.LIVE_CACHE_BLOB_REFRESH_SECONDS || "30") * 1000
const LIVE_CACHE_BLOB_PATH = process.env.LIVE_CACHE_BLOB_PATH || "cache/live-cache.json"
const LIVE_CACHE_BLOB_ACCESS = process.env.LIVE_CACHE_BLOB_ACCESS === "private" ? "private" : "public"

interface LiveCacheStoreState {
  records: Map<string, LiveCacheRecord>
  loadedAt: number
}

function getStore() {
  const globalStore = globalThis as typeof globalThis & {
    __centralDeJogosLiveCache?: LiveCacheStoreState
    __centralDeJogosLiveCacheLoadPromise?: Promise<Map<string, LiveCacheRecord>>
    __centralDeJogosLiveCachePersistPromise?: Promise<void>
  }

  if (!globalStore.__centralDeJogosLiveCache) {
    globalStore.__centralDeJogosLiveCache = {
      records: new Map(),
      loadedAt: 0,
    }
  }

  return {
    state: globalStore.__centralDeJogosLiveCache,
    getLoadPromise: () => globalStore.__centralDeJogosLiveCacheLoadPromise,
    setLoadPromise: (promise?: Promise<Map<string, LiveCacheRecord>>) => {
      globalStore.__centralDeJogosLiveCacheLoadPromise = promise
    },
    getPersistPromise: () => globalStore.__centralDeJogosLiveCachePersistPromise,
    setPersistPromise: (promise?: Promise<void>) => {
      globalStore.__centralDeJogosLiveCachePersistPromise = promise
    },
  }
}

function canUseBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN))
}

function serializeStore(records: Map<string, LiveCacheRecord>) {
  return JSON.stringify(
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      records: Array.from(records.values()),
    },
    null,
    2,
  )
}

async function readBlobSnapshot(): Promise<Map<string, LiveCacheRecord>> {
  if (!canUseBlobStorage()) {
    return new Map()
  }

  try {
    const blob = await get(LIVE_CACHE_BLOB_PATH, {
      access: LIVE_CACHE_BLOB_ACCESS,
      useCache: false,
    })

    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      return new Map()
    }

    const text = await new Response(blob.stream).text()
    if (!text.trim()) return new Map()

    const parsed = JSON.parse(text) as {
      records?: LiveCacheRecord[]
    }

    return new Map((parsed.records ?? []).map((record) => [record.key, record] as const))
  } catch {
    return new Map()
  }
}

async function ensureStoreLoaded(force = false): Promise<Map<string, LiveCacheRecord>> {
  const store = getStore()
  const isFresh = Date.now() - store.state.loadedAt < LIVE_CACHE_BLOB_REFRESH_MS
  if (!force && store.state.loadedAt > 0 && isFresh) {
    return store.state.records
  }

  const existingPromise = store.getLoadPromise()
  if (existingPromise) return existingPromise

  const promise = readBlobSnapshot()
    .then((records) => {
      store.state.records = records
      store.state.loadedAt = Date.now()
      return records
    })
    .finally(() => {
      store.setLoadPromise(undefined)
    })

  store.setLoadPromise(promise)
  return promise
}

async function persistStore() {
  const store = getStore()
  if (!canUseBlobStorage()) return

  const existingPromise = store.getPersistPromise()
  if (existingPromise) return existingPromise

  const promise = put(LIVE_CACHE_BLOB_PATH, serializeStore(store.state.records), {
    access: LIVE_CACHE_BLOB_ACCESS,
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  })
    .then(() => {
      store.state.loadedAt = Date.now()
    })
    .finally(() => {
      store.setPersistPromise(undefined)
    })

  store.setPersistPromise(promise)
  return promise
}

function normalizeKeyPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|ca|cd|club)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function createLiveCacheKey(fixture: Fixture): string {
  return [
    fixture.date.slice(0, 10),
    normalizeKeyPart(fixture.home.name),
    normalizeKeyPart(fixture.away.name),
  ].join("::")
}

function chooseSnapshot(current: LiveSourceSnapshot, incoming: LiveSourceSnapshot): LiveSourceSnapshot {
  const currentPriority = LIVE_SOURCE_PRIORITY[current.source]
  const incomingPriority = LIVE_SOURCE_PRIORITY[incoming.source]

  if (incoming.fixture.isLive && !current.fixture.isLive) return incoming
  if (current.fixture.isLive && !incoming.fixture.isLive) return current
  if (incoming.fixture.elapsed !== null && current.fixture.elapsed === null) return incoming
  if (current.fixture.elapsed !== null && incoming.fixture.elapsed === null) return current
  if (incoming.confidence !== current.confidence) {
    const confidenceRank = { high: 3, medium: 2, low: 1 }
    return confidenceRank[incoming.confidence] > confidenceRank[current.confidence] ? incoming : current
  }

  return incomingPriority > currentPriority ? incoming : current
}

function mergeFixtures(base: Fixture, extra: Fixture): Fixture {
  return {
    ...base,
    timestamp: base.timestamp || extra.timestamp,
    date: base.date || extra.date,
    statusShort: base.statusShort || extra.statusShort,
    statusLong: base.statusLong || extra.statusLong,
    elapsed: base.elapsed ?? extra.elapsed ?? null,
    isLive: base.isLive || extra.isLive,
    league: {
      id: base.league.id || extra.league.id,
      name: base.league.name || extra.league.name,
      country: base.league.country || extra.league.country,
      logo: base.league.logo || extra.league.logo,
      round: base.league.round || extra.league.round,
      season: base.league.season ?? extra.league.season,
    },
    home: {
      id: base.home.id || extra.home.id,
      name: base.home.name || extra.home.name,
      logo: base.home.logo || extra.home.logo,
      goals: base.home.goals ?? extra.home.goals ?? null,
      winner: base.home.winner ?? extra.home.winner ?? null,
    },
    away: {
      id: base.away.id || extra.away.id,
      name: base.away.name || extra.away.name,
      logo: base.away.logo || extra.away.logo,
      goals: base.away.goals ?? extra.away.goals ?? null,
      winner: base.away.winner ?? extra.away.winner ?? null,
    },
    category: base.category === "principais" || extra.category === "principais" ? "principais" : base.category,
  }
}

function buildRecord(key: string, snapshots: LiveSourceSnapshot[]): LiveCacheRecord {
  const chosen = snapshots.reduce((best, current) => (best ? chooseSnapshot(best, current) : current))
  const mergedFixture = snapshots.reduce((merged, current) => (merged ? mergeFixtures(merged, current.fixture) : current.fixture), null as Fixture | null)
  const updatedAt = new Date().toISOString()
  const staleAt = new Date(Date.now() + LIVE_CACHE_TTL_MS).toISOString()
  const snapshotMap: LiveCacheRecord["snapshots"] = {}

  for (const snapshot of snapshots) {
    snapshotMap[snapshot.source] = {
      ...snapshot,
      fixture: mergeFixtures(snapshot.fixture, mergedFixture || snapshot.fixture),
    }
  }

  return {
    key,
    primarySource: chosen.source,
    isFallback: chosen.isFallback,
    updatedAt,
    staleAt,
    sources: snapshots.map((snapshot) => snapshot.source),
    confidence: chosen.confidence,
    snapshots: snapshotMap,
  }
}

function pruneExpiredRecord(key: string, record: LiveCacheRecord) {
  if (new Date(record.staleAt).getTime() <= Date.now()) {
    getStore().state.records.delete(key)
    return true
  }

  return false
}

export async function getLiveCacheRecord(key: string): Promise<LiveCacheRecord | null> {
  const records = await ensureStoreLoaded()
  const record = records.get(key)
  if (!record) return null
  return pruneExpiredRecord(key, record) ? null : record
}

function upsertLiveCacheSnapshotSync(input: {
  fixture: Fixture
  source: LiveSource
  confidence?: LiveSourceSnapshot["confidence"]
  isFallback?: boolean
}): LiveCacheRecord {
  const store = getStore()
  const key = createLiveCacheKey(input.fixture)
  const current = store.state.records.get(key) ?? null
  const snapshot: LiveSourceSnapshot = {
    source: input.source,
    fixture: input.fixture,
    seenAt: new Date().toISOString(),
    confidence: input.confidence || (input.source === "google" ? "medium" : "high"),
    isFallback: input.isFallback ?? input.source === "google",
  }

  const snapshots = [
    ...(current ? Object.values(current.snapshots).filter((value): value is LiveSourceSnapshot => Boolean(value)) : []),
    snapshot,
  ]

  const dedupedBySource = new Map<LiveSource, LiveSourceSnapshot>()
  for (const item of snapshots) {
    const existing = dedupedBySource.get(item.source)
    dedupedBySource.set(item.source, existing ? chooseSnapshot(existing, item) : item)
  }

  const record = buildRecord(key, Array.from(dedupedBySource.values()))
  store.state.records.set(key, record)
  return record
}

export async function upsertLiveCacheSnapshots(
  inputs: Array<{
    fixture: Fixture
    source: LiveSource
    confidence?: LiveSourceSnapshot["confidence"]
    isFallback?: boolean
  }>,
): Promise<LiveCacheRecord[]> {
  await ensureStoreLoaded()
  const records = inputs.map((input) => upsertLiveCacheSnapshotSync(input))
  if (inputs.length > 0) {
    await persistStore()
  }
  return records
}

export async function enrichFixtureWithLiveCache(fixture: Fixture): Promise<Fixture> {
  const key = createLiveCacheKey(fixture)
  const record = await getLiveCacheRecord(key)
  if (!record) return fixture

  const primarySnapshot = record.snapshots[record.primarySource]
  if (!primarySnapshot) return fixture

  return mergeFixtures(primarySnapshot.fixture, fixture)
}

export async function getLiveCacheMeta(fixture: Fixture) {
  const key = createLiveCacheKey(fixture)
  const record = await getLiveCacheRecord(key)
  if (!record) return null

  return {
    primarySource: record.primarySource,
    isFallback: record.isFallback,
    sources: record.sources,
    confidence: record.confidence,
    updatedAt: record.updatedAt,
    staleAt: record.staleAt,
  }
}

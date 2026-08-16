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

function getStore() {
  const globalStore = globalThis as typeof globalThis & {
    __centralDeJogosLiveCache?: Map<string, LiveCacheRecord>
  }

  if (!globalStore.__centralDeJogosLiveCache) {
    globalStore.__centralDeJogosLiveCache = new Map()
  }

  return globalStore.__centralDeJogosLiveCache
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
    getStore().delete(key)
    return true
  }

  return false
}

export function getLiveCacheRecord(key: string): LiveCacheRecord | null {
  const record = getStore().get(key)
  if (!record) return null
  return pruneExpiredRecord(key, record) ? null : record
}

export function upsertLiveCacheSnapshot(input: {
  fixture: Fixture
  source: LiveSource
  confidence?: LiveSourceSnapshot["confidence"]
  isFallback?: boolean
}): LiveCacheRecord {
  const key = createLiveCacheKey(input.fixture)
  const current = getLiveCacheRecord(key)
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
  getStore().set(key, record)
  return record
}

export function enrichFixtureWithLiveCache(fixture: Fixture): Fixture {
  const key = createLiveCacheKey(fixture)
  const record = getLiveCacheRecord(key)
  if (!record) return fixture

  const primarySnapshot = record.snapshots[record.primarySource]
  if (!primarySnapshot) return fixture

  return mergeFixtures(primarySnapshot.fixture, fixture)
}

export function getLiveCacheMeta(fixture: Fixture) {
  const key = createLiveCacheKey(fixture)
  const record = getLiveCacheRecord(key)
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

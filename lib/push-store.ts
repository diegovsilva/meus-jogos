import { get, put } from "@vercel/blob"

export interface PushSubscriptionJSON {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

interface SubscriptionRecord {
  subscription: PushSubscriptionJSON
  matchIds: string[]
  createdAt: string
}

interface LastScoreRecord {
  home: number | null
  away: number | null
  elapsed: number | null
  statusShort: string
  finishedNotifiedAt?: string
}

interface PushStoreState {
  subscriptions: Record<string, SubscriptionRecord> // chave: hash do endpoint
  lastScores: Record<string, LastScoreRecord> // chave: matchId
}

const BLOB_PATH = process.env.PUSH_STORE_BLOB_PATH || "cache/push-subscriptions.json"
const BLOB_ACCESS = process.env.PUSH_STORE_BLOB_ACCESS === "private" ? "private" : "public"
const REFRESH_MS = 15_000

function canUseBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN))
}

function getGlobalStore() {
  const g = globalThis as typeof globalThis & {
    __centralDeJogosPushStore?: { state: PushStoreState; loadedAt: number }
    __centralDeJogosPushStoreLoadPromise?: Promise<PushStoreState>
    __centralDeJogosPushStorePersistPromise?: Promise<void>
  }

  if (!g.__centralDeJogosPushStore) {
    g.__centralDeJogosPushStore = { state: { subscriptions: {}, lastScores: {} }, loadedAt: 0 }
  }

  return {
    entry: g.__centralDeJogosPushStore,
    getLoadPromise: () => g.__centralDeJogosPushStoreLoadPromise,
    setLoadPromise: (p?: Promise<PushStoreState>) => {
      g.__centralDeJogosPushStoreLoadPromise = p
    },
    getPersistPromise: () => g.__centralDeJogosPushStorePersistPromise,
    setPersistPromise: (p?: Promise<void>) => {
      g.__centralDeJogosPushStorePersistPromise = p
    },
  }
}

async function readBlob(): Promise<PushStoreState> {
  if (!canUseBlobStorage()) return { subscriptions: {}, lastScores: {} }

  try {
    const blob = await get(BLOB_PATH, { access: BLOB_ACCESS, useCache: false })
    if (!blob || blob.statusCode !== 200 || !blob.stream) return { subscriptions: {}, lastScores: {} }

    const text = await new Response(blob.stream).text()
    if (!text.trim()) return { subscriptions: {}, lastScores: {} }

    const parsed = JSON.parse(text) as Partial<PushStoreState>
    return { subscriptions: parsed.subscriptions ?? {}, lastScores: parsed.lastScores ?? {} }
  } catch {
    return { subscriptions: {}, lastScores: {} }
  }
}

async function persist(state: PushStoreState) {
  if (!canUseBlobStorage()) return
  const store = getGlobalStore()
  const existing = store.getPersistPromise()
  if (existing) await existing

  const promise = put(BLOB_PATH, JSON.stringify(state, null, 2), {
    access: BLOB_ACCESS,
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 30,
  })
    .then(() => undefined)
    .finally(() => store.setPersistPromise(undefined))

  store.setPersistPromise(promise)
  await promise
}

async function ensureLoaded(force = false): Promise<PushStoreState> {
  const store = getGlobalStore()
  const fresh = Date.now() - store.entry.loadedAt < REFRESH_MS
  if (!force && store.entry.loadedAt > 0 && fresh) return store.entry.state

  const existing = store.getLoadPromise()
  if (existing) return existing

  const promise = readBlob()
    .then((state) => {
      store.entry.state = state
      store.entry.loadedAt = Date.now()
      return state
    })
    .finally(() => store.setLoadPromise(undefined))

  store.setLoadPromise(promise)
  return promise
}

async function hashEndpoint(endpoint: string): Promise<string> {
  const data = new TextEncoder().encode(endpoint)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function addSubscription(matchId: string, subscription: PushSubscriptionJSON): Promise<void> {
  const state = await ensureLoaded(true)
  const key = await hashEndpoint(subscription.endpoint)
  const existing = state.subscriptions[key]

  state.subscriptions[key] = {
    subscription,
    matchIds: existing ? Array.from(new Set([...existing.matchIds, matchId])) : [matchId],
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  }

  await persist(state)
}

export async function removeSubscription(endpoint: string, matchId?: string): Promise<void> {
  const state = await ensureLoaded(true)
  const key = await hashEndpoint(endpoint)
  const existing = state.subscriptions[key]
  if (!existing) return

  if (!matchId) {
    delete state.subscriptions[key]
  } else {
    const remaining = existing.matchIds.filter((id) => id !== matchId)
    if (remaining.length === 0) {
      delete state.subscriptions[key]
    } else {
      state.subscriptions[key] = { ...existing, matchIds: remaining }
    }
  }

  await persist(state)
}

export async function removeSubscriptionByKey(key: string): Promise<void> {
  const state = await ensureLoaded(true)
  if (!state.subscriptions[key]) return
  delete state.subscriptions[key]
  await persist(state)
}

export interface MatchSubscriber {
  key: string
  subscription: PushSubscriptionJSON
}

export async function getSubscribersForMatch(matchId: string): Promise<MatchSubscriber[]> {
  const state = await ensureLoaded()
  return Object.entries(state.subscriptions)
    .filter(([, record]) => record.matchIds.includes(matchId))
    .map(([key, record]) => ({ key, subscription: record.subscription }))
}

export async function getMatchIdsWithSubscribers(): Promise<string[]> {
  const state = await ensureLoaded()
  const ids = new Set<string>()
  for (const record of Object.values(state.subscriptions)) {
    for (const matchId of record.matchIds) ids.add(matchId)
  }
  return Array.from(ids)
}

export async function getLastScore(matchId: string): Promise<LastScoreRecord | null> {
  const state = await ensureLoaded()
  return state.lastScores[matchId] ?? null
}

export async function setLastScore(matchId: string, record: LastScoreRecord): Promise<void> {
  const state = await ensureLoaded(true)
  state.lastScores[matchId] = record
  await persist(state)
}

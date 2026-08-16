import { categorize, type MatchCategory } from "./config"

const API_HOST = process.env.API_FOOTBALL_HOST || "https://v3.football.api-sports.io"
const FOOTBALL_DATA_HOST = process.env.FOOTBALL_DATA_HOST || "https://api.football-data.org/v4"
const UPCOMING_FALLBACK_DAYS = 6

export interface Fixture {
  id: number
  timestamp: number
  date: string
  statusShort: string
  statusLong: string
  elapsed: number | null
  isLive: boolean
  league: {
    id: number
    name: string
    country: string
    logo: string
    round: string
  }
  home: { id: number; name: string; logo: string; goals: number | null; winner: boolean | null }
  away: { id: number; name: string; logo: string; goals: number | null; winner: boolean | null }
  category: MatchCategory
}

const LIVE_STATUSES = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"])

interface RawFixture {
  fixture: {
    id: number
    date: string
    timestamp: number
    status: { short: string; long: string; elapsed: number | null }
  }
  league: { id: number; name: string; country: string; logo: string; round: string }
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null }
    away: { id: number; name: string; logo: string; winner: boolean | null }
  }
  goals: { home: number | null; away: number | null }
}

interface FootballDataMatch {
  area?: {
    id?: number
    name?: string
    flag?: string
  }
  competition: {
    id: number
    name: string
    emblem?: string
  }
  id: number
  utcDate: string
  status: string
  minute?: number | null
  matchday?: number | null
  stage?: string | null
  group?: string | null
  homeTeam: { id: number; name: string; shortName?: string; crest?: string }
  awayTeam: { id: number; name: string; shortName?: string; crest?: string }
  score?: {
    winner?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null
    fullTime?: { home?: number | null; away?: number | null }
  }
}

interface ProviderFixture extends Fixture {
  source: "api-football" | "football-data"
}

export interface FixturesLookupResult {
  fixtures: Fixture[]
  usedFallback: boolean
  fallbackRange?: { from: string; to: string }
}

function toISO(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function shiftDate(date: string, days: number) {
  const nextDate = new Date(`${date}T12:00:00`)
  nextDate.setDate(nextDate.getDate() + days)
  return toISO(nextDate)
}

function isFutureDate(date: string) {
  return date > toISO(new Date())
}

function normalizeFixture(r: RawFixture): ProviderFixture {
  const short = r.fixture.status.short
  const fixtureLike = {
    league: { id: r.league.id, name: r.league.name, type: undefined },
    teams: {
      home: { id: r.teams.home.id, name: r.teams.home.name },
      away: { id: r.teams.away.id, name: r.teams.away.name },
    },
  }

  return {
    id: r.fixture.id,
    timestamp: r.fixture.timestamp,
    date: r.fixture.date,
    statusShort: short,
    statusLong: r.fixture.status.long,
    elapsed: r.fixture.status.elapsed,
    isLive: LIVE_STATUSES.has(short),
    league: {
      id: r.league.id,
      name: r.league.name,
      country: r.league.country,
      logo: r.league.logo,
      round: r.league.round,
    },
    home: {
      id: r.teams.home.id,
      name: r.teams.home.name,
      logo: r.teams.home.logo,
      goals: r.goals.home,
      winner: r.teams.home.winner,
    },
    away: {
      id: r.teams.away.id,
      name: r.teams.away.name,
      logo: r.teams.away.logo,
      goals: r.goals.away,
      winner: r.teams.away.winner,
    },
    category: categorize(fixtureLike),
    source: "api-football",
  }
}

function mapFootballDataStatus(status: string): { short: string; long: string; isLive: boolean } {
  switch (status) {
    case "IN_PLAY":
      return { short: "1H", long: "Ao vivo", isLive: true }
    case "PAUSED":
      return { short: "HT", long: "Intervalo", isLive: true }
    case "FINISHED":
      return { short: "FT", long: "Fim", isLive: false }
    case "POSTPONED":
      return { short: "PST", long: "Adiado", isLive: false }
    case "SUSPENDED":
      return { short: "SUSP", long: "Suspenso", isLive: false }
    case "CANCELLED":
      return { short: "CANC", long: "Cancelado", isLive: false }
    case "TIMED":
    case "SCHEDULED":
    default:
      return { short: "NS", long: "Não iniciado", isLive: false }
  }
}

function normalizeFootballDataFixture(match: FootballDataMatch): ProviderFixture {
  const mappedStatus = mapFootballDataStatus(match.status)
  const fixtureLike = {
    league: { id: match.competition.id, name: match.competition.name, type: undefined },
    teams: {
      home: { id: match.homeTeam.id, name: match.homeTeam.shortName || match.homeTeam.name },
      away: { id: match.awayTeam.id, name: match.awayTeam.shortName || match.awayTeam.name },
    },
  }
  const winner = match.score?.winner ?? null

  return {
    id: match.id,
    timestamp: Math.floor(new Date(match.utcDate).getTime() / 1000),
    date: match.utcDate,
    statusShort: mappedStatus.short,
    statusLong: mappedStatus.long,
    elapsed: mappedStatus.isLive ? (match.minute ?? null) : null,
    isLive: mappedStatus.isLive,
    league: {
      id: match.competition.id,
      name: match.competition.name,
      country: match.area?.name || "",
      logo: match.competition.emblem || match.area?.flag || "",
      round: [match.stage, match.group, match.matchday ? `Rodada ${match.matchday}` : ""].filter(Boolean).join(" • "),
    },
    home: {
      id: match.homeTeam.id,
      name: match.homeTeam.shortName || match.homeTeam.name,
      logo: match.homeTeam.crest || "",
      goals: match.score?.fullTime?.home ?? null,
      winner: winner === "HOME_TEAM" ? true : winner === "AWAY_TEAM" ? false : null,
    },
    away: {
      id: match.awayTeam.id,
      name: match.awayTeam.shortName || match.awayTeam.name,
      logo: match.awayTeam.crest || "",
      goals: match.score?.fullTime?.away ?? null,
      winner: winner === "AWAY_TEAM" ? true : winner === "HOME_TEAM" ? false : null,
    },
    category: categorize(fixtureLike),
    source: "football-data",
  }
}

function sortFixtures<T extends Fixture>(fixtures: T[]): T[] {
  return fixtures.sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1
    return a.timestamp - b.timestamp
  })
}

async function fetchFixtures(params: URLSearchParams): Promise<ProviderFixture[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) {
    throw new Error("API_FOOTBALL_KEY não configurada")
  }

  const url = `${API_HOST}/fixtures?${params.toString()}`
  const res = await fetch(url, {
    headers: { "x-apisports-key": key },
    // Revalida a cada 60s para não estourar cota da API
    next: { revalidate: 60 },
  })

  if (!res.ok) {
    throw new Error(`Falha ao buscar jogos (${res.status})`)
  }

  const data = (await res.json()) as { response?: RawFixture[]; errors?: Record<string, string> | unknown }
  if (data.errors && typeof data.errors === "object" && Object.keys(data.errors).length > 0) {
    const firstError = Object.values(data.errors as Record<string, string>).find(Boolean) || "Erro desconhecido da API"
    throw new Error(`Falha ao buscar jogos: ${firstError}`)
  }
  const raw = data.response ?? []

  return sortFixtures(raw.map(normalizeFixture))
}

async function fetchFootballDataFixtures(params: URLSearchParams): Promise<ProviderFixture[]> {
  const key = process.env.FOOTBALL_DATA_API_KEY
  if (!key) {
    throw new Error("FOOTBALL_DATA_API_KEY não configurada")
  }

  const url = `${FOOTBALL_DATA_HOST}/matches?${params.toString()}`
  const res = await fetch(url, {
    headers: { "X-Auth-Token": key },
    next: { revalidate: 60 },
  })

  if (!res.ok) {
    throw new Error(`Falha ao buscar jogos no football-data (${res.status})`)
  }

  const data = (await res.json()) as { matches?: FootballDataMatch[]; message?: string }
  if (data.message) {
    throw new Error(`Falha ao buscar jogos no football-data: ${data.message}`)
  }

  return sortFixtures((data.matches ?? []).map(normalizeFootballDataFixture))
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

function matchMergeKey(fixture: Fixture): string {
  const date = fixture.date.slice(0, 10)
  return [
    date,
    normalizeKeyPart(fixture.home.name),
    normalizeKeyPart(fixture.away.name),
  ].join("::")
}

function choosePreferredFixture(current: ProviderFixture, incoming: ProviderFixture): ProviderFixture {
  if (incoming.isLive && !current.isLive) return incoming
  if (current.isLive && !incoming.isLive) return current
  if (incoming.elapsed !== null && current.elapsed === null) return incoming
  if (current.elapsed !== null && incoming.elapsed === null) return current
  if (incoming.source === "api-football" && current.source !== "api-football") return incoming
  if (current.source === "api-football" && incoming.source !== "api-football") return current
  return current
}

function pickText(preferred: string, alternate: string): string {
  return preferred || alternate
}

function pickNullableNumber(preferred: number | null, alternate: number | null): number | null {
  return preferred ?? alternate ?? null
}

function pickNullableBoolean(preferred: boolean | null, alternate: boolean | null): boolean | null {
  return preferred ?? alternate ?? null
}

function mergeFixtures(current: ProviderFixture, incoming: ProviderFixture): ProviderFixture {
  const preferred = choosePreferredFixture(current, incoming)
  const alternate = preferred === current ? incoming : current
  const mergedCategory =
    preferred.category === "principais" || alternate.category === "principais"
      ? "principais"
      : preferred.category === "amistosos" || alternate.category === "amistosos"
        ? "amistosos"
        : preferred.category

  return {
    ...preferred,
    timestamp: preferred.timestamp || alternate.timestamp,
    date: pickText(preferred.date, alternate.date),
    statusShort: pickText(preferred.statusShort, alternate.statusShort),
    statusLong: pickText(preferred.statusLong, alternate.statusLong),
    elapsed: pickNullableNumber(preferred.elapsed, alternate.elapsed),
    isLive: preferred.isLive || alternate.isLive,
    league: {
      id: preferred.league.id || alternate.league.id,
      name: pickText(preferred.league.name, alternate.league.name),
      country: pickText(preferred.league.country, alternate.league.country),
      logo: pickText(preferred.league.logo, alternate.league.logo),
      round: pickText(preferred.league.round, alternate.league.round),
    },
    home: {
      id: preferred.home.id || alternate.home.id,
      name: pickText(preferred.home.name, alternate.home.name),
      logo: pickText(preferred.home.logo, alternate.home.logo),
      goals: pickNullableNumber(preferred.home.goals, alternate.home.goals),
      winner: pickNullableBoolean(preferred.home.winner, alternate.home.winner),
    },
    away: {
      id: preferred.away.id || alternate.away.id,
      name: pickText(preferred.away.name, alternate.away.name),
      logo: pickText(preferred.away.logo, alternate.away.logo),
      goals: pickNullableNumber(preferred.away.goals, alternate.away.goals),
      winner: pickNullableBoolean(preferred.away.winner, alternate.away.winner),
    },
    category: mergedCategory,
    source: preferred.source,
  }
}

function stripProvider(fixtures: ProviderFixture[]): Fixture[] {
  return fixtures.map(({ source: _source, ...fixture }) => fixture)
}

async function fetchUnifiedFixtures(
  apiFootballParams: URLSearchParams,
  footballDataParams: URLSearchParams,
): Promise<Fixture[]> {
  const [apiFootballResult, footballDataResult] = await Promise.allSettled([
    fetchFixtures(apiFootballParams),
    fetchFootballDataFixtures(footballDataParams),
  ])

  const merged = new Map<string, ProviderFixture>()
  const errors: string[] = []

  if (apiFootballResult.status === "fulfilled") {
    for (const fixture of apiFootballResult.value) {
      const key = matchMergeKey(fixture)
      merged.set(key, merged.has(key) ? mergeFixtures(merged.get(key)!, fixture) : fixture)
    }
  } else {
    errors.push(apiFootballResult.reason instanceof Error ? apiFootballResult.reason.message : "Erro desconhecido na API principal")
  }

  if (footballDataResult.status === "fulfilled") {
    for (const fixture of footballDataResult.value) {
      const key = matchMergeKey(fixture)
      merged.set(key, merged.has(key) ? mergeFixtures(merged.get(key)!, fixture) : fixture)
    }
  } else {
    errors.push(
      footballDataResult.reason instanceof Error
        ? footballDataResult.reason.message
        : "Erro desconhecido no football-data",
    )
  }

  const fixtures = stripProvider(sortFixtures(Array.from(merged.values())))

  if (fixtures.length > 0) {
    if (errors.length > 0) {
      console.warn(`[fixtures] consolidado com falhas parciais: ${errors.join(" | ")}`)
    }
    return fixtures
  }

  if (errors.length === 2) {
    throw new Error(errors.join(" | "))
  }

  if (errors.length === 1) {
    throw new Error(errors[0])
  }

  return []
}

export async function getFixturesByDate(date: string): Promise<Fixture[]> {
  return fetchUnifiedFixtures(
    new URLSearchParams({ date }),
    new URLSearchParams({ dateFrom: date, dateTo: shiftDate(date, 1) }),
  )
}

export async function getFixturesForDate(date: string): Promise<FixturesLookupResult> {
  const fixtures = await getFixturesByDate(date)
  if (fixtures.length > 0 || !isFutureDate(date)) {
    return { fixtures, usedFallback: false }
  }

  const to = shiftDate(date, UPCOMING_FALLBACK_DAYS)
  const upcomingFixtures = await fetchUnifiedFixtures(
    new URLSearchParams({ from: date, to }),
    new URLSearchParams({ dateFrom: date, dateTo: shiftDate(to, 1) }),
  )

  if (upcomingFixtures.length === 0) {
    return { fixtures, usedFallback: false }
  }

  return {
    fixtures: upcomingFixtures,
    usedFallback: true,
    fallbackRange: { from: date, to },
  }
}

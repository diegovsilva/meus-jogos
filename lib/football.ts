import { categorize, type MatchCategory } from "./config"

const API_HOST = process.env.API_FOOTBALL_HOST || "https://v3.football.api-sports.io"
const UPCOMING_FALLBACK_DAYS = 6
const FOOTBALL_TIMEZONE = "America/Sao_Paulo"

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

function normalizeFixture(r: RawFixture): Fixture {
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
  }
}

function sortFixtures(fixtures: Fixture[]) {
  return fixtures.sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1
    return a.timestamp - b.timestamp
  })
}

async function fetchFixtures(params: URLSearchParams): Promise<Fixture[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) {
    throw new Error("API_FOOTBALL_KEY não configurada")
  }

  if (!params.has("timezone")) {
    params.set("timezone", FOOTBALL_TIMEZONE)
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

  const data = (await res.json()) as { response?: RawFixture[]; errors?: unknown }
  const raw = data.response ?? []

  return sortFixtures(raw.map(normalizeFixture))
}

export async function getFixturesByDate(date: string): Promise<Fixture[]> {
  return fetchFixtures(new URLSearchParams({ date }))
}

export async function getFixturesForDate(date: string): Promise<FixturesLookupResult> {
  const fixtures = await getFixturesByDate(date)
  if (fixtures.length > 0 || !isFutureDate(date)) {
    return { fixtures, usedFallback: false }
  }

  const to = shiftDate(date, UPCOMING_FALLBACK_DAYS)
  const upcomingFixtures = await fetchFixtures(new URLSearchParams({ from: date, to }))

  if (upcomingFixtures.length === 0) {
    return { fixtures, usedFallback: false }
  }

  return {
    fixtures: upcomingFixtures,
    usedFallback: true,
    fallbackRange: { from: date, to },
  }
}

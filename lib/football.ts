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

function normalizeFootballDataFixture(match: FootballDataMatch): Fixture {
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

async function fetchFootballDataFixtures(params: URLSearchParams): Promise<Fixture[]> {
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

async function fetchFixturesWithFallback(
  primary: () => Promise<Fixture[]>,
  fallback: () => Promise<Fixture[]>,
): Promise<Fixture[]> {
  let primaryError: Error | null = null
  let fallbackErrorResult: Error | null = null

  try {
    const fixtures = await primary()
    if (fixtures.length > 0) return fixtures
    primaryError = new Error("API principal sem jogos para o filtro informado")
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error("Erro desconhecido na API principal")
  }

  try {
    const fallbackFixtures = await fallback()
    if (fallbackFixtures.length > 0) return fallbackFixtures
    fallbackErrorResult = new Error("football-data sem jogos para o filtro informado")
  } catch (fallbackError) {
    fallbackErrorResult =
      fallbackError instanceof Error ? fallbackError : new Error("Erro desconhecido no fallback football-data")
  }

  if (primaryError && fallbackErrorResult) {
    throw new Error(`${primaryError.message} | fallback: ${fallbackErrorResult.message}`)
  }

  if (primaryError) throw primaryError
  if (fallbackErrorResult) throw fallbackErrorResult

  return []
}

export async function getFixturesByDate(date: string): Promise<Fixture[]> {
  return fetchFixturesWithFallback(
    () => fetchFixtures(new URLSearchParams({ date })),
    () => fetchFootballDataFixtures(new URLSearchParams({ dateFrom: date, dateTo: shiftDate(date, 1) })),
  )
}

export async function getFixturesForDate(date: string): Promise<FixturesLookupResult> {
  const fixtures = await getFixturesByDate(date)
  if (fixtures.length > 0 || !isFutureDate(date)) {
    return { fixtures, usedFallback: false }
  }

  const to = shiftDate(date, UPCOMING_FALLBACK_DAYS)
  const upcomingFixtures = await fetchFixturesWithFallback(
    () => fetchFixtures(new URLSearchParams({ from: date, to })),
    () => fetchFootballDataFixtures(new URLSearchParams({ dateFrom: date, dateTo: shiftDate(to, 1) })),
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

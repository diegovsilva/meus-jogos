import { categorize, type MatchCategory } from "./config"

const API_HOST = process.env.API_FOOTBALL_HOST || "https://v3.football.api-sports.io"

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

export async function getFixturesByDate(date: string): Promise<Fixture[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) {
    throw new Error("API_FOOTBALL_KEY não configurada")
  }

  const url = `${API_HOST}/fixtures?date=${encodeURIComponent(date)}`
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

  return raw
    .map((r): Fixture => {
      const short = r.fixture.status.short
      const fixtureLike = {
        league: { id: r.league.id, name: r.league.name, type: undefined },
        teams: { home: { id: r.teams.home.id }, away: { id: r.teams.away.id } },
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
    })
    .sort((a, b) => {
      // Ao vivo primeiro, depois por horário
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1
      return a.timestamp - b.timestamp
    })
}

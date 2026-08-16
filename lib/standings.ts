const API_HOST = process.env.API_FOOTBALL_HOST || "https://v3.football.api-sports.io"
const FOOTBALL_DATA_HOST = process.env.FOOTBALL_DATA_HOST || "https://api.football-data.org/v4"

export interface StandingRow {
  position: number
  teamId: number
  teamName: string
  teamLogo: string
  played: number
  won: number
  draw: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  form?: string | null
  group?: string | null
}

interface ApiFootballStandingRow {
  rank: number
  team: { id: number; name: string; logo: string }
  points: number
  goalsDiff: number
  group?: string | null
  form?: string | null
  all: {
    played: number
    win: number
    draw: number
    lose: number
    goals: { for: number; against: number }
  }
}

interface FootballDataStandingTableRow {
  position: number
  team: { id: number; name: string; shortName?: string; crest?: string }
  playedGames: number
  won: number
  draw: number
  lost: number
  points: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  form?: string | null
}

const FOOTBALL_DATA_COMPETITION_CODES: Array<{ code: string; patterns: RegExp[] }> = [
  { code: "BSA", patterns: [/brasileirao|campeonato brasileiro serie a|serie a brasil/i] },
  { code: "PL", patterns: [/premier league/i] },
  { code: "PD", patterns: [/la liga|primera division|campeonato espanhol/i] },
  { code: "SA", patterns: [/serie a(?!.*brasil)|campeonato italiano/i] },
  { code: "BL1", patterns: [/bundesliga/i] },
  { code: "FL1", patterns: [/ligue 1|campeonato frances/i] },
  { code: "PPL", patterns: [/primeira liga|campeonato portugues/i] },
  { code: "DED", patterns: [/eredivisie|campeonato holandes/i] },
  { code: "CL", patterns: [/champions league|liga dos campeoes/i] },
  { code: "EL", patterns: [/europa league|liga europa/i] },
]

function sortStandings(rows: StandingRow[]): StandingRow[] {
  return rows.sort((a, b) => {
    if ((a.group || "") !== (b.group || "")) return (a.group || "").localeCompare(b.group || "")
    return a.position - b.position
  })
}

function mapApiFootballRow(row: ApiFootballStandingRow): StandingRow {
  return {
    position: row.rank,
    teamId: row.team.id,
    teamName: row.team.name,
    teamLogo: row.team.logo,
    played: row.all.played,
    won: row.all.win,
    draw: row.all.draw,
    lost: row.all.lose,
    goalsFor: row.all.goals.for,
    goalsAgainst: row.all.goals.against,
    goalDifference: row.goalsDiff,
    points: row.points,
    form: row.form ?? null,
    group: row.group ?? null,
  }
}

function mapFootballDataRow(row: FootballDataStandingTableRow, group?: string | null): StandingRow {
  return {
    position: row.position,
    teamId: row.team.id,
    teamName: row.team.shortName || row.team.name,
    teamLogo: row.team.crest || "",
    played: row.playedGames,
    won: row.won,
    draw: row.draw,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDifference: row.goalDifference,
    points: row.points,
    form: row.form ?? null,
    group: group ?? null,
  }
}

function inferFootballDataCompetitionCode(leagueName: string): string | null {
  for (const entry of FOOTBALL_DATA_COMPETITION_CODES) {
    if (entry.patterns.some((pattern) => pattern.test(leagueName))) {
      return entry.code
    }
  }
  return null
}

async function fetchApiFootballStandings(leagueId: number, season: number): Promise<StandingRow[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) {
    throw new Error("API_FOOTBALL_KEY não configurada")
  }

  const params = new URLSearchParams({
    league: String(leagueId),
    season: String(season),
  })

  const res = await fetch(`${API_HOST}/standings?${params.toString()}`, {
    headers: { "x-apisports-key": key },
    next: { revalidate: 900 },
  })

  if (!res.ok) {
    throw new Error(`Falha ao buscar classificação (${res.status})`)
  }

  const data = (await res.json()) as {
    errors?: Record<string, string> | unknown
    response?: Array<{ league?: { standings?: ApiFootballStandingRow[][] } }>
  }

  if (data.errors && typeof data.errors === "object" && Object.keys(data.errors).length > 0) {
    const firstError = Object.values(data.errors as Record<string, string>).find(Boolean) || "Erro desconhecido da API"
    throw new Error(`Falha ao buscar classificação: ${firstError}`)
  }

  const groups = data.response?.[0]?.league?.standings ?? []
  const rows = groups.flat().map(mapApiFootballRow)
  return sortStandings(rows)
}

async function fetchFootballDataStandings(competitionCode: string): Promise<StandingRow[]> {
  const key = process.env.FOOTBALL_DATA_API_KEY
  if (!key) {
    throw new Error("FOOTBALL_DATA_API_KEY não configurada")
  }

  const res = await fetch(`${FOOTBALL_DATA_HOST}/competitions/${competitionCode}/standings`, {
    headers: { "X-Auth-Token": key },
    next: { revalidate: 900 },
  })

  if (!res.ok) {
    throw new Error(`Falha ao buscar classificação no football-data (${res.status})`)
  }

  const data = (await res.json()) as {
    message?: string
    standings?: Array<{ group?: string | null; table?: FootballDataStandingTableRow[] }>
  }

  if (data.message) {
    throw new Error(`Falha ao buscar classificação no football-data: ${data.message}`)
  }

  const rows =
    data.standings?.flatMap((standing) => (standing.table ?? []).map((row) => mapFootballDataRow(row, standing.group))) ?? []

  return sortStandings(rows)
}

export async function getLeagueStandings(input: {
  leagueId?: number
  leagueName: string
  season?: number
}): Promise<StandingRow[]> {
  const errors: string[] = []

  if (input.leagueId && input.season) {
    try {
      const rows = await fetchApiFootballStandings(input.leagueId, input.season)
      if (rows.length > 0) return rows
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Erro desconhecido ao buscar classificação")
    }
  }

  const competitionCode = inferFootballDataCompetitionCode(input.leagueName)
  if (competitionCode) {
    try {
      const rows = await fetchFootballDataStandings(competitionCode)
      if (rows.length > 0) return rows
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Erro desconhecido no football-data")
    }
  } else {
    errors.push("Campeonato sem mapeamento de classificação no football-data")
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" | "))
  }

  return []
}

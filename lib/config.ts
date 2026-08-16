// Ligas principais (IDs da API-Football)
export const MAIN_LEAGUE_IDS = new Set<number>([
  71, // Brasileirão Série A
  72, // Brasileirão Série B
  73, // Copa do Brasil
  13, // Copa Libertadores
  11, // Copa Sudamericana
  39, // Premier League (Inglaterra)
  140, // La Liga (Espanha)
  135, // Serie A (Itália)
  78, // Bundesliga (Alemanha)
  61, // Ligue 1 (França)
  2, // UEFA Champions League
  3, // UEFA Europa League
  848, // UEFA Conference League
  94, // Primeira Liga (Portugal)
  88, // Eredivisie (Holanda)
])

// Times "grandes" — qualquer jogo envolvendo esses times entra em "Principais"
export const MAIN_TEAM_IDS = new Set<number>([
  // Brasil
  127, // Flamengo
  121, // Palmeiras
  131, // Corinthians
  126, // São Paulo
  124, // Fluminense
  133, // Vasco
  120, // Botafogo
  130, // Grêmio
  119, // Internacional
  1062, // Atlético-MG
  128, // Santos
  134, // Cruzeiro
  118, // Bahia
  794, // Atlético-PR (Athletico)
  144, // Fortaleza (verificar)
  // Europa
  541, // Real Madrid
  529, // Barcelona
  530, // Atlético de Madrid
  50, // Manchester City
  33, // Manchester United
  40, // Liverpool
  42, // Arsenal
  49, // Chelsea
  47, // Tottenham
  157, // Bayern de Munique
  165, // Borussia Dortmund
  85, // Paris Saint-Germain
  496, // Juventus
  505, // Inter de Milão
  489, // AC Milan
  492, // Napoli
  212, // FC Porto? (verificar)
])

// Detecta amistosos independentemente da liga em que a API os coloca.
// Assim, um amistoso de um time europeu NÃO cai em "Outras ligas".
export const FRIENDLY_LEAGUE_IDS = new Set<number>([
  10, // Friendlies (seleções)
  667, // Friendlies Clubs
  666, // Club Friendlies (variações)
])

export type MatchCategory = "principais" | "amistosos" | "outras"

export function isFriendly(league: { id?: number; name?: string; type?: string }): boolean {
  if (league.id && FRIENDLY_LEAGUE_IDS.has(league.id)) return true
  const name = (league.name || "").toLowerCase()
  return /friendl|amistos|club friendl|pré-temporada|pre-season|pre season/.test(name)
}

export function involvesMainTeam(teams: { home: { id?: number }; away: { id?: number } }): boolean {
  const homeId = teams.home.id
  const awayId = teams.away.id
  return Boolean((homeId && MAIN_TEAM_IDS.has(homeId)) || (awayId && MAIN_TEAM_IDS.has(awayId)))
}

export function categorize(fixture: {
  league: { id?: number; name?: string; type?: string }
  teams: { home: { id?: number }; away: { id?: number } }
}): MatchCategory {
  // 1) Amistosos sempre têm prioridade — nunca vão para "outras"
  if (isFriendly(fixture.league)) return "amistosos"

  // 2) Liga principal ou envolvendo um time grande
  const leagueId = fixture.league.id
  if ((leagueId && MAIN_LEAGUE_IDS.has(leagueId)) || involvesMainTeam(fixture.teams)) {
    return "principais"
  }

  // 3) Resto
  return "outras"
}

export function matchesTab(
  tab: MatchCategory,
  fixture: {
    category: MatchCategory
    home: { id?: number }
    away: { id?: number }
  },
): boolean {
  if (tab === "principais") {
    return (
      fixture.category === "principais" ||
      (fixture.category === "amistosos" && involvesMainTeam({ home: fixture.home, away: fixture.away }))
    )
  }

  return fixture.category === tab
}

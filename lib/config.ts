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

const MAIN_LEAGUE_ALIASES = [
  "brasileirao",
  "campeonato brasileiro serie a",
  "campeonato brasileiro serie b",
  "copa do brasil",
  "copa libertadores",
  "copa sudamericana",
  "premier league",
  // "la liga" e "serie a" (Itália) já são identificados com segurança pelo
  // ID (MAIN_LEAGUE_IDS). NÃO usar "primera division" ou "serie a" soltos
  // aqui: vários países (Argentina, Chile, Uruguai, Paraguai, Equador...)
  // usam esses mesmos nomes pras suas próprias ligas principais, e isso
  // fazia o app classificar essas ligas como "Principais" por engano.
  "bundesliga",
  "ligue 1",
  "uefa champions league",
  "uefa europa league",
  "uefa conference league",
  "primeira liga",
  "eredivisie",
]

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

const MAIN_TEAM_ALIASES = [
  "flamengo",
  "palmeiras",
  "corinthians",
  "sao paulo",
  "fluminense",
  "vasco",
  "botafogo",
  "gremio",
  "internacional",
  "atletico mg",
  "atletico mineiro",
  "santos",
  "cruzeiro",
  "bahia",
  "athletico paranaense",
  "atletico pr",
  "fortaleza",
  "real madrid",
  "barcelona",
  "fc barcelona",
  "atletico de madrid",
  "manchester city",
  "manchester united",
  "liverpool",
  "arsenal",
  "chelsea",
  "tottenham",
  "bayern",
  "bayern munich",
  "bayern de munique",
  "borussia dortmund",
  "psg",
  "paris saint germain",
  "juventus",
  "inter",
  "inter milan",
  "inter de milao",
  "ac milan",
  "milan",
  "napoli",
  "porto",
]

// Detecta amistosos independentemente da liga em que a API os coloca.
// Assim, um amistoso de um time europeu NÃO cai em "Outras ligas".
export const FRIENDLY_LEAGUE_IDS = new Set<number>([
  10, // Friendlies (seleções)
  667, // Friendlies Clubs
  666, // Club Friendlies (variações)
])

export type MatchCategory = "principais" | "amistosos" | "outras"

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function includesAlias(value: string, alias: string): boolean {
  const normalizedValue = normalize(value)
  const normalizedAlias = normalize(alias)

  if (!normalizedAlias) return false
  if (normalizedAlias.length <= 3) {
    return (
      normalizedValue === normalizedAlias ||
      normalizedValue.startsWith(`${normalizedAlias} `) ||
      normalizedValue.endsWith(` ${normalizedAlias}`) ||
      normalizedValue.includes(` ${normalizedAlias} `)
    )
  }

  return normalizedValue.includes(normalizedAlias)
}

export function isFriendly(league: { id?: number; name?: string; type?: string }): boolean {
  if (league.id && FRIENDLY_LEAGUE_IDS.has(league.id)) return true
  const name = (league.name || "").toLowerCase()
  return /friendl|amistos|club friendl|pré-temporada|pre-season|pre season/.test(name)
}

export function involvesMainTeam(teams: {
  home: { id?: number; name?: string }
  away: { id?: number; name?: string }
}): boolean {
  const homeId = teams.home.id
  const awayId = teams.away.id
  if ((homeId && MAIN_TEAM_IDS.has(homeId)) || (awayId && MAIN_TEAM_IDS.has(awayId))) {
    return true
  }

  const homeName = teams.home.name || ""
  const awayName = teams.away.name || ""

  return MAIN_TEAM_ALIASES.some((alias) => includesAlias(homeName, alias) || includesAlias(awayName, alias))
}

export function isMainLeague(league: { id?: number; name?: string }): boolean {
  const leagueId = league.id
  if (leagueId && MAIN_LEAGUE_IDS.has(leagueId)) {
    return true
  }

  const leagueName = league.name || ""
  return MAIN_LEAGUE_ALIASES.some((alias) => includesAlias(leagueName, alias))
}

export function categorize(fixture: {
  league: { id?: number; name?: string; type?: string }
  teams: { home: { id?: number; name?: string }; away: { id?: number; name?: string } }
}): MatchCategory {
  // 1) Amistosos sempre têm prioridade — nunca vão para "outras"
  if (isFriendly(fixture.league)) {
    return involvesMainTeam(fixture.teams) ? "principais" : "amistosos"
  }

  // 2) Liga principal ou envolvendo um time grande
  if (isMainLeague(fixture.league) || involvesMainTeam(fixture.teams)) {
    return "principais"
  }

  // 3) Resto
  return "outras"
}

export function matchesTab(
  tab: MatchCategory,
  fixture: {
    category: MatchCategory
    home: { id?: number; name?: string }
    away: { id?: number; name?: string }
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

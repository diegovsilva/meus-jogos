export interface BroadcastChannel {
  name: string
  source: "uol"
}

interface BroadcastLookupInput {
  homeTeam: string
  awayTeam: string
  leagueName: string
  country?: string
  date: string
}

const UOL_BASE_URL = "https://placar.uol.com.br/esporte/futebol"

const LEAGUE_SLUG_ALIASES: Array<{ pattern: RegExp; slug: string }> = [
  { pattern: /community shield|supercopa da inglaterra/i, slug: "supercopa-da-inglaterra" },
  { pattern: /champions league|liga dos campeoes/i, slug: "liga-dos-campeoes" },
  { pattern: /europa league/i, slug: "liga-europa" },
  { pattern: /conference league/i, slug: "conference-league" },
  { pattern: /premier league/i, slug: "ingles" },
  { pattern: /la liga|campeonato espanhol|espanhol/i, slug: "espanhol" },
  { pattern: /serie a(?!.*brasil)|campeonato italiano|italiano/i, slug: "italiano" },
  { pattern: /ligue 1|campeonato frances|frances/i, slug: "frances" },
  { pattern: /bundesliga|campeonato alemao|alemao/i, slug: "alemao" },
  { pattern: /serie b/i, slug: "serie-b" },
  { pattern: /brasileirao|serie a brasil/i, slug: "brasileirao" },
]

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function slugify(value: string): string {
  return normalize(value)
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function getCompetitionSlugs(leagueName: string, country?: string): string[] {
  const slugs = LEAGUE_SLUG_ALIASES.filter(({ pattern }) => pattern.test(leagueName)).map(({ slug }) => slug)

  if (/cup/i.test(leagueName) && /england|inglaterra/i.test(country || "")) {
    slugs.push("copa-da-inglaterra")
  }

  slugs.push(slugify(leagueName))
  return unique(slugs)
}

function getTeamSlugs(teamName: string): string[] {
  return unique([slugify(teamName)])
}

function buildMatchUrl(
  competitionSlug: string,
  homeSlug: string,
  awaySlug: string,
  date: string,
): string {
  const [year, month, day] = date.split("T")[0].split("-")
  return `${UOL_BASE_URL}/${competitionSlug}/${year}/${month}/${day}/${homeSlug}-x-${awaySlug}.htm`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function parseBroadcastsFromHtml(html: string, scoreUrl: string): BroadcastChannel[] {
  const sectionRegex = new RegExp(
    `"scoreUrl":"${escapeRegExp(scoreUrl)}"[\\s\\S]{0,1200}?"broadcast":\\[(.*?)\\]`,
  )
  const match = html.match(sectionRegex)
  if (!match?.[1]) return []

  const channels = Array.from(match[1].matchAll(/"name":"([^"]+)"/g))
    .map((entry) => entry[1]?.trim())
    .filter(Boolean)

  return unique(channels).map((name) => ({ name, source: "uol" as const }))
}

export async function findBroadcastChannels(input: BroadcastLookupInput): Promise<BroadcastChannel[]> {
  const competitionSlugs = getCompetitionSlugs(input.leagueName, input.country)
  const homeSlugs = getTeamSlugs(input.homeTeam)
  const awaySlugs = getTeamSlugs(input.awayTeam)

  for (const competitionSlug of competitionSlugs) {
    for (const homeSlug of homeSlugs) {
      for (const awaySlug of awaySlugs) {
        const scoreUrl = buildMatchUrl(competitionSlug, homeSlug, awaySlug, input.date)
        try {
          const response = await fetch(scoreUrl, {
            next: { revalidate: 1800 },
            headers: {
              "user-agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            },
          })

          if (!response.ok) continue

          const html = await response.text()
          const broadcasts = parseBroadcastsFromHtml(html, scoreUrl)
          if (broadcasts.length > 0) return broadcasts
        } catch {
          continue
        }
      }
    }
  }

  return []
}

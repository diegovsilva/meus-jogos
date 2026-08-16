interface LiveChannel {
  label: string
  aliases: string[]
  liveUrl?: string
}

interface SearchLiveOptions {
  query: string
  max?: number
  homeTeam?: string
  awayTeam?: string
  broadcastHints?: string[]
  eventType?: "live" | "upcoming"
}

export class YouTubeSearchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = "YouTubeSearchError"
  }
}

// Prioriza canais BR que costumam transmitir jogos ao vivo no YouTube.
export const BR_LIVE_CHANNELS: LiveChannel[] = [
  { label: "CazéTV", aliases: ["cazetv", "caze tv", "caze"], liveUrl: "https://www.youtube.com/@CazeTV/live" },
  {
    label: "Sporty",
    aliases: ["sportybet", "sportybet brasil", "sportynet", "sportynet brasil", "sporty bet", "sporty net"],
    liveUrl: "https://www.youtube.com/@SportyNetBrasil/live",
  },
  { label: "GOAT", aliases: ["goat", "canal goat"], liveUrl: "https://www.youtube.com/@canalgoatbr/live" },
  { label: "UOL Esporte", aliases: ["uol esporte", "uol esportes"] },
  { label: "TNT Sports", aliases: ["tnt sports brasil", "tnt sports", "esporte interativo"] },
  { label: "GE", aliases: ["ge", "ge tv", "getv", "globo esporte"] },
  { label: "Canal GolBrasil", aliases: ["golbrasil", "gol brasil", "canal golbrasil", "canal gol brasil"] },
]

const TEAM_NAME_NOISE_WORDS = new Set(["fc", "cf", "sc", "ac", "ca", "cd", "club"])

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function includesAlias(channelTitle: string, alias: string): boolean {
  const title = normalize(channelTitle)
  const normalizedAlias = normalize(alias)

  if (!normalizedAlias) return false
  if (normalizedAlias.length <= 3) {
    return (
      title === normalizedAlias ||
      title.startsWith(`${normalizedAlias} `) ||
      title.endsWith(` ${normalizedAlias}`) ||
      title.includes(` ${normalizedAlias} `)
    )
  }

  return title.includes(normalizedAlias)
}

function getBrazilianChannelPriority(channelTitle: string): number {
  return BR_LIVE_CHANNELS.findIndex((channel) =>
    channel.aliases.some((alias) => includesAlias(channelTitle, alias)),
  )
}

function findKnownLiveChannel(value: string): LiveChannel | undefined {
  return BR_LIVE_CHANNELS.find((channel) => channel.aliases.some((alias) => includesAlias(value, alias)))
}

function simplifyTeamName(value: string): string {
  return value
    .split(/\s+/)
    .filter((token) => {
      const normalizedToken = normalize(token)
      return normalizedToken && !TEAM_NAME_NOISE_WORDS.has(normalizedToken)
    })
    .join(" ")
    .trim()
}

function getTeamSearchVariants(value: string): string[] {
  return uniqueNormalized([value, simplifyTeamName(value)])
}

function containsNormalizedTerm(text: string, value: string): boolean {
  const normalizedText = normalize(text)
  return getTeamSearchVariants(value).some((variant) => {
    const normalizedVariant = normalize(variant)
    return Boolean(normalizedVariant) && normalizedText.includes(normalizedVariant)
  })
}

function hasLiveIntent(title: string): boolean {
  return /\bao vivo\b|\blive\b|com imagens|assistir/.test(normalize(title))
}

function scoreSearchItem(
  item: YtSearchItem,
  options: Pick<SearchLiveOptions, "homeTeam" | "awayTeam" | "broadcastHints">,
): { accepted: boolean; score: number; priority: number } {
  const priority = getBrazilianChannelPriority(item.snippet.channelTitle)
  const title = item.snippet.title
  const channelTitle = item.snippet.channelTitle
  const hasHomeTeam = options.homeTeam ? containsNormalizedTerm(title, options.homeTeam) : false
  const hasAwayTeam = options.awayTeam ? containsNormalizedTerm(title, options.awayTeam) : false
  const liveIntent = hasLiveIntent(title)
  const matchedBroadcastHint =
    options.broadcastHints?.some(
      (hint) => includesAlias(channelTitle, hint) || containsNormalizedTerm(title, hint),
    ) ?? false

  const accepted = priority >= 0 || matchedBroadcastHint || (hasHomeTeam && hasAwayTeam && liveIntent)

  if (!accepted) {
    return { accepted: false, score: -1, priority }
  }

  let score = 0
  if (priority >= 0) score += 1_000 - priority * 25
  if (matchedBroadcastHint) score += 600
  if (hasHomeTeam) score += 120
  if (hasAwayTeam) score += 120
  if (hasHomeTeam && hasAwayTeam) score += 120
  if (liveIntent) score += 80

  return { accepted: true, score, priority }
}

function uniqueNormalized(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = normalize(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(value.trim())
  }

  return result
}

function buildBaseQueries(query: string, homeTeam?: string, awayTeam?: string): string[] {
  const queries = [query]

  if (homeTeam && awayTeam) {
    const homeVariants = getTeamSearchVariants(homeTeam)
    const awayVariants = getTeamSearchVariants(awayTeam)

    for (const homeVariant of homeVariants) {
      for (const awayVariant of awayVariants) {
        const matchUp = `${homeVariant} x ${awayVariant}`.trim()
        queries.push(
          `${matchUp} ao vivo`,
          `${matchUp} com imagens`,
          `${homeVariant} ${awayVariant} ao vivo`,
          `${homeVariant} ${awayVariant} live`,
          `${awayVariant} x ${homeVariant} ao vivo`,
          `${awayVariant} ${homeVariant} ao vivo`,
          matchUp,
        )
      }
    }
  }

  return uniqueNormalized(queries)
}

function buildCandidateQueries(
  query: string,
  broadcastHints: string[],
  homeTeam?: string,
  awayTeam?: string,
): string[] {
  const prioritizedHints = broadcastHints
    .map((hint) => ({
      hint,
      priority: BR_LIVE_CHANNELS.findIndex((channel) => channel.aliases.some((alias) => includesAlias(hint, alias))),
    }))
    .sort((a, b) => {
      if (a.priority === -1 && b.priority === -1) return 0
      if (a.priority === -1) return 1
      if (b.priority === -1) return -1
      return a.priority - b.priority
    })
    .map(({ hint }) => hint)

  const baseQueries = buildBaseQueries(query, homeTeam, awayTeam)
  const hintedQueries = prioritizedHints.flatMap((hint) =>
    baseQueries.slice(0, 4).map((baseQuery) => `${hint} ${baseQuery}`),
  )

  return uniqueNormalized([...hintedQueries, ...baseQueries]).slice(0, 10)
}

async function fetchYouTubeSearchItems(
  key: string,
  query: string,
  eventType: "live" | "upcoming",
): Promise<YtSearchItem[]> {
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    eventType,
    maxResults: "15",
    order: "relevance",
    regionCode: "BR",
    relevanceLanguage: "pt",
    key,
  })

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, {
    next: { revalidate: 600 },
  })

  if (!res.ok) {
    throw new YouTubeSearchError(`Falha ao buscar vídeos (${res.status})`, res.status)
  }

  const data = (await res.json()) as { items?: YtSearchItem[] }
  return data.items ?? []
}

export interface Video {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  publishedAt: string
  url: string
  eventType: "live" | "upcoming"
}

interface YtSearchItem {
  id: { videoId?: string }
  snippet: {
    title: string
    channelTitle: string
    publishedAt: string
    thumbnails: { medium?: { url: string }; high?: { url: string }; default?: { url: string } }
  }
}

export function buildLiveMatchQuery(homeTeam: string, awayTeam: string, league?: string): string {
  return [homeTeam, "x", awayTeam, league, "ao vivo"]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

export function getOfficialYouTubeLiveUrl(broadcastHints: string[]): string | null {
  for (const hint of broadcastHints) {
    const channel = findKnownLiveChannel(hint)
    if (channel?.liveUrl) return channel.liveUrl
  }

  return null
}

export async function searchBrazilianLiveVideos({
  query,
  max = 3,
  homeTeam,
  awayTeam,
  broadcastHints = [],
  eventType = "live",
}: SearchLiveOptions): Promise<Video[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    throw new Error("YOUTUBE_API_KEY não configurada")
  }

  const candidateQueries = buildCandidateQueries(query, broadcastHints, homeTeam, awayTeam)
  const queryBudget = broadcastHints.length > 0 ? 3 : homeTeam && awayTeam ? 2 : 1
  const rankedItems = new Map<
    string,
    { item: YtSearchItem; accepted: boolean; score: number; priority: number }
  >()

  for (const candidateQuery of candidateQueries.slice(0, queryBudget)) {
    const items = await fetchYouTubeSearchItems(key, candidateQuery, eventType)

    for (const item of items) {
      if (!item.id.videoId) continue

      const ranked = {
        item,
        ...scoreSearchItem(item, { homeTeam, awayTeam, broadcastHints }),
      }

      if (!ranked.accepted) continue

      const previous = rankedItems.get(item.id.videoId)
      if (!previous || ranked.score > previous.score) {
        rankedItems.set(item.id.videoId, ranked)
      }
    }

    if (rankedItems.size >= max) break
  }

  return Array.from(rankedItems.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.priority - b.priority
    })
    .map(({ item: it }): Video => {
      const thumb =
        it.snippet.thumbnails.high?.url ||
        it.snippet.thumbnails.medium?.url ||
        it.snippet.thumbnails.default?.url ||
        ""
      return {
        id: it.id.videoId as string,
        title: it.snippet.title,
        channelTitle: it.snippet.channelTitle,
        thumbnail: thumb,
        publishedAt: it.snippet.publishedAt,
        url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
        eventType,
      }
    })
    .slice(0, max)
}

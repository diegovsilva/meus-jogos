interface LiveChannel {
  label: string
  aliases: string[]
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
  { label: "CazéTV", aliases: ["cazetv", "caze tv", "caze"] },
  { label: "SportyBet", aliases: ["sportybet", "sportybet brasil"] },
  { label: "GOAT", aliases: ["goat", "canal goat"] },
  { label: "UOL Esporte", aliases: ["uol esporte", "uol esportes"] },
  { label: "TNT Sports", aliases: ["tnt sports brasil", "tnt sports", "esporte interativo"] },
  { label: "GE", aliases: ["ge", "ge tv", "getv", "globo esporte"] },
  { label: "Canal GolBrasil", aliases: ["golbrasil", "gol brasil", "canal golbrasil", "canal gol brasil"] },
]

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

function containsNormalizedTerm(text: string, value: string): boolean {
  const normalizedText = normalize(text)
  const normalizedValue = normalize(value)
  return Boolean(normalizedValue) && normalizedText.includes(normalizedValue)
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
  const items = data.items ?? []

  return items
    .filter((it) => it.id.videoId)
    .map((it) => ({
      item: it,
      ...scoreSearchItem(it, { homeTeam, awayTeam, broadcastHints }),
    }))
    .filter(({ accepted }) => accepted)
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

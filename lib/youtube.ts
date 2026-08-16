interface LiveChannel {
  label: string
  aliases: string[]
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

export interface Video {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  publishedAt: string
  url: string
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

export async function searchBrazilianLiveVideos(query: string, max = 3): Promise<Video[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    throw new Error("YOUTUBE_API_KEY não configurada")
  }

  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    eventType: "live",
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
    throw new Error(`Falha ao buscar vídeos (${res.status})`)
  }

  const data = (await res.json()) as { items?: YtSearchItem[] }
  const items = data.items ?? []

  return items
    .filter((it) => it.id.videoId)
    .map((it) => ({ item: it, priority: getBrazilianChannelPriority(it.snippet.channelTitle) }))
    .filter(({ priority }) => priority >= 0)
    .sort((a, b) => a.priority - b.priority)
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
      }
    })
    .slice(0, max)
}

// Allowlist de canais BRASILEIROS de futebol.
// A busca só retorna vídeos cujo canal casa com um destes nomes (case-insensitive).
export const BR_CHANNELS: string[] = [
  "ge", // GE / Globo Esporte
  "globo esporte",
  "espn brasil",
  "espn",
  "tnt sports brasil",
  "cazetv",
  "cazé",
  "desimpedidos",
  "canal do nicola",
  "denílson show",
  "denilson show",
  "uol esporte",
  "goal brasil",
  "goat",
  "jogada10",
  "lance",
  "band jornalismo",
  "sportv",
  "premiere",
  "paramount",
  "mundo gol",
  "resenha espn",
  "flamengo", // canais oficiais dos clubes BR
  "se palmeiras",
  "palmeiras",
  "corinthians",
  "spfc",
  "são paulo fc",
  "sao paulo fc",
  "fluminense",
  "vasco da gama",
  "botafogo",
  "grêmio",
  "gremio",
  "internacional",
  "atlético mineiro",
  "atletico mineiro",
  "cruzeiro",
  "santos fc",
  "esporte interativo",
]

function isBrazilianChannel(channelTitle: string): boolean {
  const t = (channelTitle || "").toLowerCase()
  return BR_CHANNELS.some((name) => t.includes(name))
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

export async function searchBrazilianVideos(query: string, max = 12): Promise<Video[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    throw new Error("YOUTUBE_API_KEY não configurada")
  }

  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: "25",
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
    .filter((it) => it.id.videoId && isBrazilianChannel(it.snippet.channelTitle))
    .map((it): Video => {
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

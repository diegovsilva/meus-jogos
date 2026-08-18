export interface AuthorizedChannel {
  label: string
  channelId: string
  // termos que ajudam a casar com o nome do canal que o placar (UOL) reporta
  // como detentor dos direitos daquele jogo específico — só usado pra
  // decidir qual canal checar primeiro, nunca pra autorizar um canal fora
  // dessa lista.
  broadcastAliases: string[]
}

// Lista fixa de canais do YouTube com direitos de transmissão confirmados
// manualmente. A busca SÓ procura dentro desses canais — nunca aceita vídeo
// de um canal fora dessa lista, mesmo que o título bata com os times do
// jogo (é assim que rádios e lives não autorizadas vazavam antes).
//
// Pra adicionar um canal novo: confirme o Channel ID de verdade (não só o
// nome) — veja o README pra como achar — e inclua aqui.
export const AUTHORIZED_CHANNELS: AuthorizedChannel[] = [
  { label: "CazéTV", channelId: "UCZiYbVptd3PVPf4f6eR6UaQ", broadcastAliases: ["cazetv", "caze tv", "caze"] },
  { label: "Canal GOAT", channelId: "UC_oToDrJ6uca7d1dFVBmLtg", broadcastAliases: ["goat", "canal goat"] },
  {
    label: "Sporty Brasil",
    channelId: "UCGtm_pBRy3qg4Rk0RtOIKuQ",
    broadcastAliases: ["sportybet", "sportybet brasil", "sporty bet", "sporty brasil"],
  },
  {
    label: "SportyNet",
    channelId: "UCMcc9elPZGpg6eU4i3YaCpA",
    broadcastAliases: ["sportynet", "sportynet brasil", "sporty net"],
  },
  {
    label: "TNT Sports Brasil",
    channelId: "UCs-6sCz2LJm1PrWQN4ErsPw",
    broadcastAliases: ["tnt sports", "tnt sports brasil", "esporte interativo"],
  },
  { label: "UOL Esporte", channelId: "UC3KHYFWeB0WimMBfm3NEahQ", broadcastAliases: ["uol esporte", "uol esportes"] },
  {
    label: "Ge TV",
    channelId: "UCgCKagVhzGnZcuP9bSMgMCg",
    broadcastAliases: ["ge", "ge tv", "getv", "globo esporte", "globo", "sportv"],
  },
]

const TEAM_NAME_NOISE_WORDS = new Set(["fc", "cf", "sc", "ac", "ca", "cd", "club"])

export class YouTubeSearchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = "YouTubeSearchError"
  }
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function includesAlias(text: string, alias: string): boolean {
  const normalizedText = normalize(text)
  const normalizedAlias = normalize(alias)

  if (!normalizedAlias) return false
  if (normalizedAlias.length <= 3) {
    return (
      normalizedText === normalizedAlias ||
      normalizedText.startsWith(`${normalizedAlias} `) ||
      normalizedText.endsWith(` ${normalizedAlias}`) ||
      normalizedText.includes(` ${normalizedAlias} `)
    )
  }

  return normalizedText.includes(normalizedAlias)
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

function containsNormalizedTerm(text: string, value: string): boolean {
  const normalizedText = normalize(text)
  return getTeamSearchVariants(value).some((variant) => {
    const normalizedVariant = normalize(variant)
    return Boolean(normalizedVariant) && normalizedText.includes(normalizedVariant)
  })
}

/**
 * Ordena os canais autorizados colocando primeiro os que batem com o nome
 * do(s) canal(is) que o placar (UOL) reportou como detentor dos direitos
 * daquele jogo específico. Só afeta a ORDEM de checagem (economiza chamadas
 * de API) — nunca inclui um canal que não esteja em AUTHORIZED_CHANNELS.
 */
function orderChannelsByBroadcastHints(hints: string[]): AuthorizedChannel[] {
  if (hints.length === 0) return AUTHORIZED_CHANNELS

  const matches = (channel: AuthorizedChannel) =>
    hints.some((hint) => channel.broadcastAliases.some((alias) => includesAlias(hint, alias)))

  const prioritized = AUTHORIZED_CHANNELS.filter(matches)
  const rest = AUTHORIZED_CHANNELS.filter((c) => !matches(c))
  return [...prioritized, ...rest]
}

interface YtSearchItem {
  id: { videoId?: string }
  snippet: {
    title: string
    channelId: string
    channelTitle: string
    publishedAt: string
    thumbnails: { medium?: { url: string }; high?: { url: string }; default?: { url: string } }
  }
}

async function fetchChannelVideos(
  key: string,
  channelId: string,
  eventType: "live" | "upcoming",
): Promise<YtSearchItem[]> {
  const params = new URLSearchParams({
    part: "snippet",
    channelId,
    type: "video",
    eventType,
    maxResults: "5",
    order: "date",
    key,
  })

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, {
    next: { revalidate: 300 },
  })

  if (!res.ok) {
    throw new YouTubeSearchError(`Falha ao buscar vídeos do canal (${res.status})`, res.status)
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

export function buildLiveMatchQuery(homeTeam: string, awayTeam: string, league?: string): string {
  return [homeTeam, "x", awayTeam, league, "ao vivo"]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

export function getOfficialYouTubeLiveUrl(broadcastHints: string[]): string | null {
  const ordered = orderChannelsByBroadcastHints(broadcastHints)
  const matched = ordered.find((channel) =>
    broadcastHints.some((hint) => channel.broadcastAliases.some((alias) => includesAlias(hint, alias))),
  )
  if (!matched) return null
  return `https://www.youtube.com/channel/${matched.channelId}/live`
}

interface SearchAuthorizedOptions {
  homeTeam?: string
  awayTeam?: string
  broadcastHints?: string[]
  eventType?: "live" | "upcoming"
  max?: number
}

/**
 * Busca vídeos ao vivo/agendados SÓ dentro dos canais em AUTHORIZED_CHANNELS
 * — nunca em canais de fora dessa lista, mesmo que o título do vídeo bata
 * com o nome dos times. É a garantia de não pegar rádio, torcida organizada
 * ou qualquer live sem direito de transmissão.
 */
export async function searchAuthorizedLiveVideos({
  homeTeam,
  awayTeam,
  broadcastHints = [],
  eventType = "live",
  max = 1,
}: SearchAuthorizedOptions): Promise<Video[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    throw new Error("YOUTUBE_API_KEY não configurada")
  }

  const channels = orderChannelsByBroadcastHints(broadcastHints)
  const found: Video[] = []

  for (const channel of channels) {
    const items = await fetchChannelVideos(key, channel.channelId, eventType)

    for (const item of items) {
      if (!item.id.videoId) continue
      // checagem redundante de propósito: garante que o vídeo é mesmo
      // desse canal autorizado, mesmo se a API algum dia devolver algo
      // inesperado.
      if (item.snippet.channelId !== channel.channelId) continue

      const title = item.snippet.title
      const hasHome = homeTeam ? containsNormalizedTerm(title, homeTeam) : true
      const hasAway = awayTeam ? containsNormalizedTerm(title, awayTeam) : true
      if (!hasHome || !hasAway) continue

      const thumb =
        item.snippet.thumbnails.high?.url ||
        item.snippet.thumbnails.medium?.url ||
        item.snippet.thumbnails.default?.url ||
        ""

      found.push({
        id: item.id.videoId,
        title,
        channelTitle: item.snippet.channelTitle,
        thumbnail: thumb,
        publishedAt: item.snippet.publishedAt,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        eventType,
      })
    }

    if (found.length >= max) break
  }

  return found.slice(0, max)
}

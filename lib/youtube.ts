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
  {
    label: "Canal GoLBrasil",
    channelId: "UCfi9IhipFGSa0eD_EA8JHrA",
    broadcastAliases: ["golbrasil", "gol brasil", "canal golbrasil", "canal gol brasil"],
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

async function fetchSearchResults(
  key: string,
  query: string,
  eventType: "live" | "upcoming",
): Promise<YtSearchItem[]> {
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    eventType,
    maxResults: "25", // pega o máximo permitido de uma vez — filtra pela whitelist depois, sem precisar de mais chamadas
    order: "relevance",
    regionCode: "BR",
    relevanceLanguage: "pt",
    key,
  })

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, {
    next: { revalidate: 300 },
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
  channelLogo: string | null
  thumbnail: string
  publishedAt: string
  url: string
  eventType: "live" | "upcoming"
}

const channelLogoCache = new Map<string, { logo: string | null; expiresAt: number }>()
const CHANNEL_LOGO_TTL_MS = 24 * 60 * 60_000 // logo de canal quase nunca muda — cache de 24h

async function getChannelLogo(key: string, channelId: string): Promise<string | null> {
  const cached = channelLogoCache.get(channelId)
  if (cached && cached.expiresAt > Date.now()) return cached.logo

  try {
    const params = new URLSearchParams({ part: "snippet", id: channelId, key })
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`, {
      next: { revalidate: 86400 },
    })
    if (!res.ok) throw new Error(String(res.status))

    const data = (await res.json()) as {
      items?: { snippet?: { thumbnails?: { default?: { url: string }; medium?: { url: string } } } }[]
    }
    const logo = data.items?.[0]?.snippet?.thumbnails?.medium?.url ?? data.items?.[0]?.snippet?.thumbnails?.default?.url ?? null

    channelLogoCache.set(channelId, { logo, expiresAt: Date.now() + CHANNEL_LOGO_TTL_MS })
    return logo
  } catch {
    // custo baixo (1 unidade), mas se falhar não trava a busca do vídeo —
    // só mostra sem logo.
    channelLogoCache.set(channelId, { logo: null, expiresAt: Date.now() + 5 * 60_000 })
    return null
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

function buildSearchQueries(homeTeam?: string, awayTeam?: string): string[] {
  if (homeTeam && awayTeam) {
    return uniqueNormalized([
      buildLiveMatchQuery(homeTeam, awayTeam),
      `${homeTeam} ${awayTeam} ao vivo`,
    ])
  }
  return []
}

/**
 * Busca vídeos ao vivo/agendados usando 1 (ou no máximo 2, se a primeira
 * não achar nada) busca geral na API do YouTube, e SÓ ACEITA o resultado se
 * o canal do vídeo estiver em AUTHORIZED_CHANNELS — nunca por heurística de
 * título, mesmo que o vídeo cite os dois times. É a garantia de não pegar
 * rádio, torcida organizada ou qualquer live sem direito de transmissão,
 * sem gastar uma chamada de API por canal (o que estourava a cota rápido).
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

  const authorizedIds = new Map(AUTHORIZED_CHANNELS.map((c) => [c.channelId, c]))
  const orderedChannels = orderChannelsByBroadcastHints(broadcastHints)
  const channelPriority = new Map(orderedChannels.map((c, i) => [c.channelId, i]))

  const queries = buildSearchQueries(homeTeam, awayTeam)
  if (queries.length === 0) return []

  const found = new Map<string, { video: Video; channelId: string }>()

  for (const query of queries) {
    const items = await fetchSearchResults(key, query, eventType)

    for (const item of items) {
      if (!item.id.videoId) continue
      if (found.has(item.id.videoId)) continue
      if (!authorizedIds.has(item.snippet.channelId)) continue // fora da whitelist — nunca aceita

      const title = item.snippet.title
      const hasHome = homeTeam ? containsNormalizedTerm(title, homeTeam) : true
      const hasAway = awayTeam ? containsNormalizedTerm(title, awayTeam) : true
      if (!hasHome || !hasAway) continue

      const thumb =
        item.snippet.thumbnails.high?.url ||
        item.snippet.thumbnails.medium?.url ||
        item.snippet.thumbnails.default?.url ||
        ""

      found.set(item.id.videoId, {
        channelId: item.snippet.channelId,
        video: {
          id: item.id.videoId,
          title,
          channelTitle: item.snippet.channelTitle,
          channelLogo: null, // preenchido abaixo, só pros selecionados (evita chamada à toa)
          thumbnail: thumb,
          publishedAt: item.snippet.publishedAt,
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          eventType,
        },
      })
    }

    if (found.size >= max) break
  }

  const selected = Array.from(found.values())
    .sort((a, b) => {
      const prioA = channelPriority.get(a.channelId) ?? 999
      const prioB = channelPriority.get(b.channelId) ?? 999
      return prioA - prioB
    })
    .slice(0, max)

  // só busca o logo dos vídeos que realmente vão ser retornados (custo baixo,
  // mas sem sentido buscar pra descartados)
  await Promise.all(
    selected.map(async (entry) => {
      entry.video.channelLogo = await getChannelLogo(key, entry.channelId)
    }),
  )

  return selected.map(({ video }) => video)
}

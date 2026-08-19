// Scraper de fallback para LiveScore (https://www.livescore.com/pt/).
//
// Usa o mesmo endpoint JSON interno que o site chama (descoberto via
// DevTools) — não precisa de navegador, então roda tranquilo numa function
// serverless comum do Vercel.
//
// ⚠️ Endpoint interno não documentado oficialmente, mesmo sem exigir
// autenticação. Revise os Termos de Serviço do LiveScore antes de uso
// comercial, e mantenha um cache razoável (já existe via `next.revalidate`).

import { categorize } from "../config"
import type { ProviderFixture } from "../football"
import { looksLikeRoundLabel } from "./shared"

const BASE_URL = "https://prod-cdn-mev-api.livescore.com/api/v2"
const TZ_OFFSET = "-3" // horário de Brasília

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json",
  Referer: "https://www.livescore.com/pt/",
  Origin: "https://www.livescore.com",
}

const NOT_LIVE_STATUSES = new Set([
  "NS", "FT", "AET", "PEN", "POSTP.", "CANC.", "ABAND.", "AWRD.", "WO", "AW.", "INT.",
])

function hashId(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return Math.abs(hash)
}

function mapStatus(epsRaw: string | undefined): { short: string; long: string; isLive: boolean; elapsed: number | null } {
  const eps = (epsRaw || "").trim()
  const upper = eps.toUpperCase()

  if (!eps || upper === "NS") return { short: "NS", long: "Não iniciado", isLive: false, elapsed: null }
  if (upper === "FT") return { short: "FT", long: "Fim", isLive: false, elapsed: null }
  if (upper === "HT") return { short: "HT", long: "Intervalo", isLive: true, elapsed: null }
  if (NOT_LIVE_STATUSES.has(upper)) return { short: upper.replace(".", ""), long: eps, isLive: false, elapsed: null }

  // qualquer outra coisa (ex.: "45'", "90'+2") é considerado ao vivo
  const minuteMatch = eps.match(/^(\d+)/)
  return { short: "LIVE", long: eps, isLive: true, elapsed: minuteMatch ? Number(minuteMatch[1]) : null }
}

interface LiveScoreTeam {
  Nm?: string
}

interface LiveScoreEvent {
  Eps?: string
  T1?: LiveScoreTeam[]
  T2?: LiveScoreTeam[]
  Tr1?: string
  Tr2?: string
  Trh1?: string
  Trh2?: string
  Est?: number
  ErnInf?: string
}

interface LiveScoreSection {
  Ts?: {
    Cnm?: string
    Snm?: string
    Evs?: LiveScoreEvent[]
  }
}

interface LiveScorePayload {
  Sctns?: LiveScoreSection[]
}

function teamName(list: LiveScoreTeam[] | undefined): string {
  return list?.[0]?.Nm || ""
}

function eventToFixture(event: LiveScoreEvent, country: string, competition: string, dateStr: string): ProviderFixture {
  const status = mapStatus(event.Eps)
  const homeName = teamName(event.T1)
  const awayName = teamName(event.T2)
  const timestamp = event.Est || Math.floor(Date.now() / 1000)

  const homeId = hashId(`livescore-team|${homeName}`)
  const awayId = hashId(`livescore-team|${awayName}`)
  const leagueId = hashId(`livescore-league|${country}|${competition}`)

  const fixtureLike = {
    league: { id: leagueId, name: competition },
    teams: { home: { id: homeId, name: homeName }, away: { id: awayId, name: awayName } },
  }

  return {
    id: hashId(`livescore|${dateStr}|${homeName}|${awayName}`),
    timestamp,
    date: new Date(timestamp * 1000).toISOString(),
    statusShort: status.short,
    statusLong: status.long,
    elapsed: status.elapsed,
    isLive: status.isLive,
    league: { id: leagueId, name: competition, country, logo: "", round: event.ErnInf || "", season: undefined },
    home: { id: homeId, name: homeName, logo: "", goals: event.Tr1 ? Number(event.Tr1) : null, winner: null },
    away: { id: awayId, name: awayName, logo: "", goals: event.Tr2 ? Number(event.Tr2) : null, winner: null },
    category: categorize(fixtureLike),
    source: "livescore",
  }
}

function parseSections(payload: LiveScorePayload, dateStr: string): ProviderFixture[] {
  const fixtures: ProviderFixture[] = []
  for (const section of payload.Sctns ?? []) {
    const country = section.Ts?.Cnm || ""
    const competition = section.Ts?.Snm || ""
    if (looksLikeRoundLabel(competition)) continue // ver shared.ts — provável fase, não nome de competição
    for (const event of section.Ts?.Evs ?? []) {
      if (!teamName(event.T1) || !teamName(event.T2)) continue
      fixtures.push(eventToFixture(event, country, competition, dateStr))
    }
  }
  return fixtures
}

export async function fetchLiveScoreFixtures(dateISO: string): Promise<ProviderFixture[]> {
  const dateCompact = dateISO.replace(/-/g, "")
  const url = `${BASE_URL}/date/soccer/${dateCompact}/${TZ_OFFSET}`

  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 60 } })
  if (!res.ok) {
    throw new Error(`LiveScore respondeu ${res.status}`)
  }

  const payload = (await res.json()) as LiveScorePayload
  return parseSections(payload, dateISO)
}

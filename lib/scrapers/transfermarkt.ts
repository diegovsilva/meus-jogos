// Scraper de fallback para Transfermarkt (transfermarkt.com.br/live).
//
// A página de "Ao vivo" é HTML clássico renderizado no servidor — os
// dados já vêm prontos na resposta HTTP, sem precisar executar
// JavaScript. Roda tranquilo numa function serverless comum do Vercel.
//
// ⚠️ Dado de terceiros, não é API pública/documentada. O robots.txt do
// Transfermarkt permite crawling geral, mas revise os Termos de Serviço
// antes de uso comercial, e mantenha um cache razoável (já existe via
// `next.revalidate`).

import * as cheerio from "cheerio"
import { categorize } from "../config"
import type { ProviderFixture } from "../football"

const BASE_ORIGIN = "https://www.transfermarkt.com.br"
const LIVE_PATH = "/live/index"

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "pt-BR,pt;q=0.9",
}

const SCORE_RE = /^\s*(\d+)\s*:\s*(\d+)/

function hashId(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return Math.abs(hash)
}

// Extrai o ID numérico do time a partir do link de perfil dele, ex.:
// "/se-palmeiras-sao-paulo/startseite/verein/1023/saison_id/2025" -> 1023
function extractTeamId(href: string | undefined): number | null {
  if (!href) return null
  const match = href.match(/\/verein\/(\d+)/)
  return match ? Number(match[1]) : null
}

// Texto do próprio elemento, sem incluir o texto de spans filhos (ex.:
// separa "0:1" do "prorr." dentro de span.ergebnis_zusatz).
function ownText($el: cheerio.Cheerio<any>): string {
  return $el
    .contents()
    .filter((_, node) => node.type === "text")
    .text()
    .trim()
}

function rowToFixture($: cheerio.CheerioAPI, row: any, competition: string, dateISO: string): ProviderFixture | null {
  const $row = $(row)
  const $zeitCell = $row.find("td.zeit")
  const $resultSpan = $row.find("td.ergebnis span.matchresult")
  if ($resultSpan.length === 0) return null

  const classes = ($resultSpan.attr("class") || "").split(/\s+/)
  const isLive = classes.includes("liveresult")
  const isFinished = classes.includes("finished")

  const $zusatz = $resultSpan.find("span.ergebnis_zusatz")
  const zusattoText = $zusatz.length ? $zusatz.text().trim() : null
  const mainText = ownText($resultSpan)

  let homeScore: number | null = null
  let awayScore: number | null = null
  let kickoffTime: string | null = null

  if (isLive || isFinished) {
    const scoreMatch = SCORE_RE.exec(mainText)
    if (scoreMatch) {
      homeScore = Number(scoreMatch[1])
      awayScore = Number(scoreMatch[2])
    }
  } else {
    kickoffTime = mainText || null
  }

  const $liveMinute = $zeitCell.find("span.live-ergebnis")
  const roundText = $liveMinute.length === 0 ? $zeitCell.text().trim() : ""

  let statusLong: string
  let statusShort: string
  let elapsed: number | null = null

  if (isLive) {
    const minuteText = $liveMinute.length ? $liveMinute.text().trim() : zusattoText || "Ao vivo"
    statusLong = minuteText
    const minuteMatch = minuteText.match(/(\d+)/)
    elapsed = minuteMatch ? Number(minuteMatch[1]) : null
    statusShort = "LIVE"
  } else if (isFinished) {
    statusLong = zusattoText || "Encerrado"
    statusShort = "FT"
  } else {
    statusLong = "Agendado"
    statusShort = "NS"
  }

  const $homeLink = $row.find("td.club.verein-heim a")
  const $awayLink = $row.find("td.club.verein-gast a").length ? $row.find("td.club.verein-gast a") : $row.find("td.club.away a")
  const homeName = $homeLink.text().trim()
  const awayName = $awayLink.text().trim()
  const matchHref = $row.find("td.ergebnis a").attr("href")
  const matchUrl = matchHref ? new URL(matchHref, BASE_ORIGIN).toString() : null

  if (!homeName || !awayName) return null

  // O Transfermarkt usa um CDN com URL previsível pro escudo, a partir do
  // ID numérico do time (mesmo ID que aparece no link do perfil dele,
  // .../verein/{ID}/...). Padrão confirmado publicamente (usado por vários
  // projetos de terceiros que consomem dados do Transfermarkt).
  const homeTeamId = extractTeamId($homeLink.attr("href"))
  const awayTeamId = extractTeamId($awayLink.attr("href"))
  const homeCrest = homeTeamId ? `https://tmssl.akamaized.net/images/wappen/head/${homeTeamId}.png` : ""
  const awayCrest = awayTeamId ? `https://tmssl.akamaized.net/images/wappen/head/${awayTeamId}.png` : ""

  const homeId = homeTeamId ?? hashId(`transfermarkt-team|${homeName}`)
  const awayId = awayTeamId ?? hashId(`transfermarkt-team|${awayName}`)
  const leagueId = hashId(`transfermarkt-league|${competition}`)

  // horário só é conhecido quando o jogo ainda não começou (o Transfermarkt
  // não expõe o horário original depois que a partida já está ao vivo/
  // finalizada nesta listagem) — usa meio-dia do dia buscado como
  // aproximação nesses casos, só pra ter um timestamp válido pra ordenação.
  const timestamp = kickoffTime
    ? Math.floor(new Date(`${dateISO}T${kickoffTime}:00`).getTime() / 1000)
    : Math.floor(new Date(`${dateISO}T12:00:00`).getTime() / 1000)

  const fixtureLike = {
    league: { id: leagueId, name: competition },
    teams: { home: { id: homeId, name: homeName }, away: { id: awayId, name: awayName } },
  }

  return {
    id: hashId(`transfermarkt|${dateISO}|${homeName}|${awayName}`),
    timestamp,
    date: new Date(timestamp * 1000).toISOString(),
    statusShort,
    statusLong,
    elapsed,
    isLive,
    league: { id: leagueId, name: competition, country: "", logo: "", round: roundText, season: undefined },
    home: { id: homeId, name: homeName, logo: homeCrest, goals: homeScore, winner: null },
    away: { id: awayId, name: awayName, logo: awayCrest, goals: awayScore, winner: null },
    category: categorize(fixtureLike),
    source: "transfermarkt",
  }
}

export function parseTransfermarktLivePage(html: string, dateISO: string): ProviderFixture[] {
  const $ = cheerio.load(html)
  const fixtures: ProviderFixture[] = []

  $("div.kategorie").each((_, kategoriaEl) => {
    const competition = $(kategoriaEl).text().trim()
    const table = $(kategoriaEl).nextAll("table.livescore").first()
    if (table.length === 0) return

    table.find("tr.begegnungZeile").each((__, row) => {
      const fixture = rowToFixture($, row, competition, dateISO)
      if (fixture) fixtures.push(fixture)
    })
  })

  return fixtures
}

export async function fetchTransfermarktFixtures(dateISO: string): Promise<ProviderFixture[]> {
  const url = `${BASE_ORIGIN}${LIVE_PATH}?datum=${dateISO}`

  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 60 } })
  if (!res.ok) {
    throw new Error(`Transfermarkt respondeu ${res.status}`)
  }

  const html = await res.text()
  return parseTransfermarktLivePage(html, dateISO)
}

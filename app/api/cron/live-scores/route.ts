import { NextResponse } from "next/server"
import { getFixturesByDate, type Fixture } from "@/lib/football"
import {
  getMatchIdsWithSubscribers,
  getSubscribersForMatch,
  getLastScore,
  setLastScore,
  removeSubscriptionByKey,
} from "@/lib/push-store"
import { sendPush } from "@/lib/push-send"

function todayISO() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function scoreChanged(
  prev: { home: number | null; away: number | null; elapsed: number | null; statusShort: string } | null,
  fixture: Fixture,
): { changed: boolean; goalsChanged: boolean } {
  if (!prev) return { changed: true, goalsChanged: false }

  const goalsChanged = prev.home !== fixture.home.goals || prev.away !== fixture.away.goals
  const statusChanged = prev.statusShort !== fixture.statusShort
  // minuto muda o tempo todo — não conta sozinho como "mudança relevante",
  // mas ainda assim atualizamos a notificação (silenciosa) pra manter o tempo em dia
  const changed = goalsChanged || statusChanged || prev.elapsed !== fixture.elapsed

  return { changed, goalsChanged: goalsChanged || statusChanged }
}

function buildPayload(fixture: Fixture, finished: boolean) {
  const placar = `${fixture.home.goals ?? 0} x ${fixture.away.goals ?? 0}`
  const tempo = finished ? "Fim de jogo" : fixture.statusShort === "HT" ? "Intervalo" : `${fixture.elapsed ?? 0}'`

  return {
    title: `${fixture.home.name} ${placar} ${fixture.away.name}`,
    body: `${fixture.league.name} · ${tempo}`,
    tag: `match-${fixture.id}`,
    url: `/?match=${fixture.id}`,
    silent: false,
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const matchIdsWithSubscribers = await getMatchIdsWithSubscribers()
  if (matchIdsWithSubscribers.length === 0) {
    return NextResponse.json({ checked: 0, notified: 0, message: "Nenhuma inscrição ativa." })
  }

  const fixtures = await getFixturesByDate(todayISO())
  const fixtureById = new Map(fixtures.map((f) => [String(f.id), f]))

  let checked = 0
  let notified = 0
  let cleaned = 0

  for (const matchId of matchIdsWithSubscribers) {
    const fixture = fixtureById.get(matchId)
    if (!fixture) continue // jogo não é de hoje (inscrição antiga) — ignora

    checked++

    const finished = ["FT", "AET", "PEN"].includes(fixture.statusShort)
    if (!fixture.isLive && !finished) continue // ainda não começou

    const prev = await getLastScore(matchId)
    const { changed, goalsChanged } = scoreChanged(prev, fixture)
    const alreadyNotifiedFinish = finished && prev?.finishedNotifiedAt

    if (!changed && !finished) continue
    if (finished && alreadyNotifiedFinish) continue

    const payload = buildPayload(fixture, finished)
    // silencioso quando é só o minuto passando; alerta quando o placar/status muda
    payload.silent = !goalsChanged && !finished

    const subscribers = await getSubscribersForMatch(matchId)

    for (const { key, subscription } of subscribers) {
      const result = await sendPush(subscription, payload)
      if (result.ok) {
        notified++
      } else if (result.expired) {
        await removeSubscriptionByKey(key)
        cleaned++
      }
    }

    await setLastScore(matchId, {
      home: fixture.home.goals,
      away: fixture.away.goals,
      elapsed: fixture.elapsed,
      statusShort: fixture.statusShort,
      finishedNotifiedAt: finished ? new Date().toISOString() : prev?.finishedNotifiedAt,
    })
  }

  return NextResponse.json({ checked, notified, cleaned })
}

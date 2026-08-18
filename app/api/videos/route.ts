import { NextResponse } from "next/server"
import { findBroadcastChannels } from "@/lib/broadcast"
import { buildLiveMatchQuery, getOfficialYouTubeLiveUrl, searchAuthorizedLiveVideos, YouTubeSearchError } from "@/lib/youtube"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") || "").trim()
  const home = (searchParams.get("home") || "").trim()
  const away = (searchParams.get("away") || "").trim()
  const league = (searchParams.get("league") || "").trim()
  const country = (searchParams.get("country") || "").trim()
  const date = (searchParams.get("date") || "").trim()
  const event = searchParams.get("event") === "upcoming" ? "upcoming" : "live"

  const query = home && away ? buildLiveMatchQuery(home, away, league) : q

  if (!query) {
    return NextResponse.json({ error: "Busca vazia" }, { status: 400 })
  }

  try {
    const broadcasts =
      home && away && league && date
        ? await findBroadcastChannels({
            homeTeam: home,
            awayTeam: away,
            leagueName: league,
            country,
            date,
          })
        : []

    const [videoResult] = await Promise.allSettled([
      searchAuthorizedLiveVideos({
        max: 1,
        homeTeam: home || undefined,
        awayTeam: away || undefined,
        broadcastHints: broadcasts.map((channel) => channel.name),
        eventType: event,
      }).then((videos) => videos[0] ?? null),
    ])

    const officialLiveUrl = getOfficialYouTubeLiveUrl(broadcasts.map((channel) => channel.name))

    if (videoResult.status === "rejected") {
      throw { cause: videoResult.reason, broadcasts, officialLiveUrl }
    }

    return NextResponse.json(
      { query, video: videoResult.value, broadcasts, officialLiveUrl },
      { headers: { "Cache-Control": "no-store, must-revalidate" } },
    )
  } catch (err) {
    const error = err && typeof err === "object" && "cause" in err ? err.cause : err
    const broadcasts =
      err && typeof err === "object" && "broadcasts" in err && Array.isArray(err.broadcasts) ? err.broadcasts : []
    const officialLiveUrl =
      err && typeof err === "object" && "officialLiveUrl" in err && typeof err.officialLiveUrl === "string"
        ? err.officialLiveUrl
        : null

    if (error instanceof YouTubeSearchError && [403, 429].includes(error.status)) {
      console.warn(`[api/videos] YouTube indisponivel para "${query}": ${error.message}`)

      return NextResponse.json({
        query,
        video: null,
        broadcasts,
        officialLiveUrl,
        unavailableReason: error.status === 429 ? "quota_exceeded" : "access_denied",
      })
    }

    const message = error instanceof Error ? error.message : "Erro desconhecido"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

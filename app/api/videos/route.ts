import { NextResponse } from "next/server"
import { findBroadcastChannels } from "@/lib/broadcast"
import { buildLiveMatchQuery, searchBrazilianLiveVideos, YouTubeSearchError } from "@/lib/youtube"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") || "").trim()
  const home = (searchParams.get("home") || "").trim()
  const away = (searchParams.get("away") || "").trim()
  const league = (searchParams.get("league") || "").trim()
  const country = (searchParams.get("country") || "").trim()
  const date = (searchParams.get("date") || "").trim()

  const query = home && away ? buildLiveMatchQuery(home, away, league) : q

  if (!query) {
    return NextResponse.json({ error: "Busca vazia" }, { status: 400 })
  }

  try {
    const broadcastsPromise =
      home && away && league && date
        ? findBroadcastChannels({
            homeTeam: home,
            awayTeam: away,
            leagueName: league,
            country,
            date,
          })
        : Promise.resolve([])

    const [videoResult, broadcastsResult] = await Promise.allSettled([
      searchBrazilianLiveVideos(query, 1).then((videos) => videos[0] ?? null),
      broadcastsPromise,
    ])

    const broadcasts = broadcastsResult.status === "fulfilled" ? broadcastsResult.value : []

    if (videoResult.status === "rejected") {
      throw { cause: videoResult.reason, broadcasts }
    }

    return NextResponse.json({ query, video: videoResult.value, broadcasts })
  } catch (err) {
    const error = err && typeof err === "object" && "cause" in err ? err.cause : err
    const broadcasts =
      err && typeof err === "object" && "broadcasts" in err && Array.isArray(err.broadcasts) ? err.broadcasts : []

    if (error instanceof YouTubeSearchError && [403, 429].includes(error.status)) {
      console.warn(`[api/videos] YouTube indisponivel para "${query}": ${error.message}`)

      return NextResponse.json({
        query,
        video: null,
        broadcasts,
        unavailableReason: error.status === 429 ? "quota_exceeded" : "access_denied",
      })
    }

    const message = error instanceof Error ? error.message : "Erro desconhecido"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextResponse } from "next/server"
import { buildLiveMatchQuery, searchBrazilianLiveVideos } from "@/lib/youtube"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") || "").trim()
  const home = (searchParams.get("home") || "").trim()
  const away = (searchParams.get("away") || "").trim()
  const league = (searchParams.get("league") || "").trim()

  const query = home && away ? buildLiveMatchQuery(home, away, league) : q

  if (!query) {
    return NextResponse.json({ error: "Busca vazia" }, { status: 400 })
  }

  try {
    const [video] = await searchBrazilianLiveVideos(query, 1)
    return NextResponse.json({ query, video: video ?? null })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

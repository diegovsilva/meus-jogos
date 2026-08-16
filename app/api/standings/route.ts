import { NextResponse } from "next/server"
import { getLeagueStandings } from "@/lib/standings"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const leagueIdParam = searchParams.get("leagueId")
  const seasonParam = searchParams.get("season")
  const leagueName = (searchParams.get("leagueName") || "").trim()

  if (!leagueName) {
    return NextResponse.json({ error: "Campeonato não informado" }, { status: 400 })
  }

  const leagueId = leagueIdParam ? Number(leagueIdParam) : undefined
  const season = seasonParam ? Number(seasonParam) : undefined

  try {
    const standings = await getLeagueStandings({
      leagueId: Number.isFinite(leagueId) ? leagueId : undefined,
      leagueName,
      season: Number.isFinite(season) ? season : undefined,
    })

    return NextResponse.json({
      leagueName,
      standings,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

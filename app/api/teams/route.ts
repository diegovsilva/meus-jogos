import { NextResponse } from "next/server"
import { searchTeamsByName } from "@/lib/football"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = (searchParams.get("search") || "").trim()

  if (query.length < 3) {
    return NextResponse.json({ error: "Digite pelo menos 3 letras" }, { status: 400 })
  }

  try {
    const teams = await searchTeamsByName(query)
    return NextResponse.json({ teams }, { headers: { "Cache-Control": "no-store, must-revalidate" } })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

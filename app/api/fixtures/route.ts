import { NextResponse } from "next/server"
import { getFixturesForDate } from "@/lib/football"

// Placar ao vivo muda a cada segundo — nunca deixar essa rota ser cacheada
// pelo CDN/navegador. O cache "inteligente" (TTL curto, sabe quando um jogo
// está ao vivo) já é feito dentro de getFixturesForDate/live-cache.ts.
export const dynamic = "force-dynamic"
export const revalidate = 0

function todayISO() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date") || todayISO()

  // valida formato AAAA-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Data inválida" }, { status: 400 })
  }

  try {
    const result = await getFixturesForDate(date)
    return NextResponse.json(
      {
        date,
        fixtures: result.fixtures,
        usedFallback: result.usedFallback,
        fallbackRange: result.fallbackRange,
      },
      { headers: { "Cache-Control": "no-store, must-revalidate" } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

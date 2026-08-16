import { NextResponse } from "next/server"
import { searchBrazilianVideos } from "@/lib/youtube"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") || "").trim()

  if (!q) {
    return NextResponse.json({ error: "Busca vazia" }, { status: 400 })
  }

  try {
    const videos = await searchBrazilianVideos(q)
    return NextResponse.json({ query: q, videos })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

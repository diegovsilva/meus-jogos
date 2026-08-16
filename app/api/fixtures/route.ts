import { NextResponse } from "next/server"
import { getFixturesByDate } from "@/lib/football"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date") || new Date().toISOString().slice(0, 10)

  // valida formato AAAA-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Data inválida" }, { status: 400 })
  }

  try {
    const fixtures = await getFixturesByDate(date)
    return NextResponse.json({ date, fixtures })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

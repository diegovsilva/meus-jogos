import { NextResponse } from "next/server"
import { removeSubscription } from "@/lib/push-store"

interface UnsubscribeBody {
  matchId?: string | number
  endpoint: string
}

export async function POST(request: Request) {
  let body: UnsubscribeBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  if (!body.endpoint) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 })
  }

  try {
    await removeSubscription(body.endpoint, body.matchId ? String(body.matchId) : undefined)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

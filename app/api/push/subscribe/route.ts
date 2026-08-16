import { NextResponse } from "next/server"
import { addSubscription, type PushSubscriptionJSON } from "@/lib/push-store"

interface SubscribeBody {
  matchId: string | number
  subscription: PushSubscriptionJSON
}

export async function POST(request: Request) {
  let body: SubscribeBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const matchId = String(body.matchId || "").trim()
  const subscription = body.subscription

  if (!matchId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 })
  }

  try {
    await addSubscription(matchId, subscription)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import webpush from "web-push"
import type { PushSubscriptionJSON } from "./push-store"

let configured = false

function ensureConfigured() {
  if (configured) return

  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT

  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT precisam estar configuradas para enviar notificações push.",
    )
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

export interface PushPayload {
  title: string
  body: string
  tag: string
  url: string
  silent?: boolean
}

export type PushSendResult = { ok: true } | { ok: false; expired: boolean; error: string }

export async function sendPush(
  subscription: PushSubscriptionJSON,
  payload: PushPayload,
): Promise<PushSendResult> {
  ensureConfigured()

  try {
    await webpush.sendNotification(subscription as unknown as webpush.PushSubscription, JSON.stringify(payload))
    return { ok: true }
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode
    const expired = statusCode === 404 || statusCode === 410
    return { ok: false, expired, error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

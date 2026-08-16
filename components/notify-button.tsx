"use client"

import { useEffect, useState } from "react"
import { Bell, BellRing, BellOff } from "lucide-react"

interface NotifyButtonProps {
  matchId: number
  homeTeam: string
  awayTeam: string
}

type NotifyState = "unsupported" | "idle" | "loading" | "subscribed" | "denied"

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export function NotifyButton({ matchId, homeTeam, awayTeam }: NotifyButtonProps) {
  const [state, setState] = useState<NotifyState>("idle")

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported")
      return
    }

    if (Notification.permission === "denied") {
      setState("denied")
      return
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        setState(subscription ? "subscribed" : "idle")
      })
      .catch(() => setState("idle"))
  }, [matchId])

  async function handleSubscribe() {
    setState("loading")

    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "idle")
        return
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!publicKey) {
        console.warn("[notify] NEXT_PUBLIC_VAPID_PUBLIC_KEY não configurada.")
        setState("idle")
        return
      }

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
        })
      }

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, subscription: subscription.toJSON() }),
      })

      setState("subscribed")
    } catch (err) {
      console.warn("[notify] falha ao inscrever:", err)
      setState("idle")
    }
  }

  async function handleUnsubscribe() {
    setState("loading")

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, endpoint: subscription.endpoint }),
        })
      }

      setState("idle")
    } catch (err) {
      console.warn("[notify] falha ao cancelar:", err)
      setState("subscribed")
    }
  }

  if (state === "unsupported") return null

  if (state === "denied") {
    return (
      <span
        className="flex items-center gap-1.5 rounded-full border border-border bg-background/30 px-2.5 py-1 text-xs text-muted-foreground"
        title="Notificações bloqueadas nas configurações do navegador"
      >
        <BellOff className="h-3.5 w-3.5" />
        Notificações bloqueadas
      </span>
    )
  }

  if (state === "subscribed") {
    return (
      <button
        onClick={handleUnsubscribe}
        className="flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
        aria-label={`Cancelar notificação de ${homeTeam} x ${awayTeam}`}
      >
        <BellRing className="h-3.5 w-3.5" />
        Notificando
      </button>
    )
  }

  return (
    <button
      onClick={handleSubscribe}
      disabled={state === "loading"}
      className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-accent hover:text-foreground disabled:opacity-60"
      aria-label={`Ativar notificação de ${homeTeam} x ${awayTeam}`}
    >
      <Bell className="h-3.5 w-3.5" />
      {state === "loading" ? "Ativando..." : "Notificar"}
    </button>
  )
}

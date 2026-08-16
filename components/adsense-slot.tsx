"use client"

import { useEffect, useRef } from "react"

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

interface AdSenseSlotProps {
  slot?: string
  label: string
  className?: string
}

export function AdSenseSlot({ slot, label, className = "" }: AdSenseSlotProps) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT
  const hasRenderedAd = useRef(false)

  useEffect(() => {
    if (!client || !slot || hasRenderedAd.current) return

    try {
      window.adsbygoogle = window.adsbygoogle || []
      window.adsbygoogle.push({})
      hasRenderedAd.current = true
    } catch {
      // Mantem silencioso para nao quebrar a UI quando o script ainda nao carregou.
    }
  }, [client, slot])

  if (!client || !slot) {
    return (
      <div
        className={`rounded-[var(--radius)] border border-dashed border-border bg-card/60 p-4 text-center ${className}`}
        aria-label={`Espaco reservado para anuncio: ${label}`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Espaco reservado para AdSense</p>
        <p className="mt-1 text-sm text-foreground">{label}</p>
      </div>
    )
  }

  return (
    <div className={className}>
      <ins
        className="adsbygoogle block min-h-[120px] w-full overflow-hidden rounded-[var(--radius)] border border-border bg-card"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}

"use client"

import useSWR from "swr"
import type { Fixture } from "@/lib/football"

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"])
const UPCOMING_LOOKUP_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

function timeLabel(f: Fixture, selectedDate?: string): string {
  if (f.isLive) return `${f.elapsed ?? 0}'`
  if (f.statusShort === "FT" || f.statusShort === "AET" || f.statusShort === "PEN") return "Fim"
  if (f.statusShort === "HT") return "Intervalo"
  const d = new Date(f.timestamp * 1000)
  const fixtureDate = f.date.slice(0, 10)
  if (selectedDate && fixtureDate !== selectedDate) {
    return d.toLocaleString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

function TeamRow({
  name,
  logo,
  goals,
  winner,
  played,
}: {
  name: string
  logo: string
  goals: number | null
  winner: boolean | null
  played: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo || "/placeholder.svg"} alt="" className="h-6 w-6 shrink-0 object-contain" loading="lazy" />
        <span
          className={`truncate text-sm ${winner ? "font-semibold text-foreground" : "text-card-foreground"}`}
        >
          {name}
        </span>
      </div>
      <span
        className={`shrink-0 tabular-nums text-sm font-semibold ${
          played ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {goals ?? "-"}
      </span>
    </div>
  )
}

export function MatchCard({ fixture, selectedDate }: { fixture: Fixture; selectedDate?: string }) {
  const played = fixture.isLive || [...FINISHED_STATUSES, "HT"].includes(fixture.statusShort)
  const isFinished = FINISHED_STATUSES.has(fixture.statusShort)
  const isUpcomingSoon =
    !fixture.isLive &&
    !isFinished &&
    fixture.timestamp * 1000 > Date.now() &&
    fixture.timestamp * 1000 - Date.now() <= UPCOMING_LOOKUP_WINDOW_MS
  const youtubeEvent = fixture.isLive ? "live" : "upcoming"
  const shouldLookupMedia = fixture.isLive || isUpcomingSoon
  const { data, isLoading, error } = useSWR<{
    video: { url: string; eventType: "live" | "upcoming" } | null
    broadcasts?: Array<{ name: string; source: "uol" }>
    officialLiveUrl?: string | null
    error?: string
    unavailableReason?: string
  }>(
    shouldLookupMedia
      ? `/api/videos?home=${encodeURIComponent(fixture.home.name)}&away=${encodeURIComponent(
          fixture.away.name,
        )}&league=${encodeURIComponent(fixture.league.name)}&country=${encodeURIComponent(
          fixture.league.country,
        )}&date=${encodeURIComponent(fixture.date)}&event=${youtubeEvent}`
      : null,
    fetcher,
    {
      refreshInterval: fixture.isLive ? 300_000 : 1_800_000,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      dedupingInterval: fixture.isLive ? 300_000 : 1_800_000,
    },
  )

  const liveUrl = data?.video?.url || data?.officialLiveUrl || null
  const scheduledVideo = data?.video?.eventType === "upcoming"
  const broadcasts = data?.broadcasts ?? []
  const showGenericUnavailable =
    fixture.isLive && (data?.unavailableReason === "quota_exceeded" || data?.unavailableReason === "access_denied")
  const usingOfficialChannelFallback = !data?.video?.url && Boolean(data?.officialLiveUrl)

  return (
    <article className="rounded-[var(--radius)] border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fixture.league.logo || "/placeholder.svg"} alt="" className="h-4 w-4 object-contain" loading="lazy" />
          <span className="truncate text-xs text-muted-foreground">{fixture.league.name}</span>
        </div>
        {fixture.isLive ? (
          <span className="flex items-center gap-1.5 rounded-full bg-live/15 px-2 py-0.5 text-xs font-semibold text-live">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
            AO VIVO
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {timeLabel(fixture, selectedDate)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <TeamRow
          name={fixture.home.name}
          logo={fixture.home.logo}
          goals={fixture.home.goals}
          winner={fixture.home.winner}
          played={played}
        />
        <TeamRow
          name={fixture.away.name}
          logo={fixture.away.logo}
          goals={fixture.away.goals}
          winner={fixture.away.winner}
          played={played}
        />
      </div>

      {shouldLookupMedia && (
        <div className="mt-4">
          {broadcasts.length > 0 && (
            <div className="mb-3 rounded-[var(--radius)] border border-border bg-background/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Onde assistir</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {broadcasts.map((channel) => (
                  <span
                    key={channel.name}
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    {channel.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {liveUrl ? (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-[var(--radius)] bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {usingOfficialChannelFallback
                ? "Abrir live oficial no YouTube"
                : scheduledVideo
                  ? "Transmissao agendada no YouTube"
                  : "Assistir no YouTube"}
            </a>
          ) : isLoading ? (
            <p className="text-center text-xs text-muted-foreground">
              {fixture.isLive ? "Procurando live no YouTube..." : "Procurando transmissao agendada no YouTube..."}
            </p>
          ) : error || data?.error ? (
            <p className="text-center text-xs text-live">
              {fixture.isLive ? "Erro ao localizar a transmissão ao vivo." : "Erro ao localizar a transmissão agendada."}
            </p>
          ) : showGenericUnavailable ? (
            <p className="text-center text-xs text-muted-foreground">Transmissao no YouTube indisponivel no momento.</p>
          ) : (
            fixture.isLive ? (
              <p className="text-center text-xs text-muted-foreground">Nenhuma live BR encontrada no YouTube.</p>
            ) : null
          )}
        </div>
      )}
    </article>
  )
}

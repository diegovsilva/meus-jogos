import type { Fixture } from "@/lib/football"

function timeLabel(f: Fixture): string {
  if (f.isLive) return `${f.elapsed ?? 0}'`
  if (f.statusShort === "FT" || f.statusShort === "AET" || f.statusShort === "PEN") return "Fim"
  if (f.statusShort === "HT") return "Intervalo"
  const d = new Date(f.timestamp * 1000)
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

export function MatchCard({ fixture }: { fixture: Fixture }) {
  const played = fixture.isLive || ["FT", "AET", "PEN", "HT"].includes(fixture.statusShort)

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
            {timeLabel(fixture)}
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
    </article>
  )
}

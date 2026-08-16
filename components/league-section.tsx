"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import type { Fixture } from "@/lib/football"
import { MatchCard } from "./match-card"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type LeagueView = "matches" | "standings"

interface StandingRow {
  position: number
  teamId: number
  teamName: string
  teamLogo: string
  played: number
  won: number
  draw: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  form?: string | null
  group?: string | null
}

interface StandingsResponse {
  standings?: StandingRow[]
  error?: string
}

function groupLabel(row: StandingRow) {
  return row.group?.trim() || null
}

export function LeagueSection({
  league,
  matches,
  selectedDate,
}: {
  league: {
    id: number
    name: string
    logo: string
    country: string
    season?: number
  }
  matches: Fixture[]
  selectedDate: string
}) {
  const [view, setView] = useState<LeagueView>("matches")
  const standingsUrl = `/api/standings?leagueId=${league.id}&leagueName=${encodeURIComponent(league.name)}${
    league.season ? `&season=${league.season}` : ""
  }`
  const { data, isLoading } = useSWR<StandingsResponse>(view === "standings" ? standingsUrl : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  })

  const groupedStandings = useMemo(() => {
    const groups = new Map<string, StandingRow[]>()
    for (const row of data?.standings ?? []) {
      const key = groupLabel(row) || "Tabela"
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }
    return Array.from(groups.entries())
  }, [data?.standings])

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={league.logo || "/placeholder.svg"} alt="" className="h-4 w-4 object-contain" loading="lazy" />
          <h2 className="truncate text-sm font-semibold uppercase tracking-wide text-muted-foreground">{league.name}</h2>
        </div>

        <div className="flex shrink-0 rounded-full border border-border bg-card p-1">
          <button
            onClick={() => setView("matches")}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              view === "matches" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Jogos
          </button>
          <button
            onClick={() => setView("standings")}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              view === "standings"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Classificação
          </button>
        </div>
      </div>

      {view === "matches" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {matches.map((fixture) => (
            <MatchCard key={fixture.id} fixture={fixture} selectedDate={selectedDate} />
          ))}
        </div>
      ) : isLoading ? (
        <div className="rounded-[var(--radius)] border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Carregando classificação...
        </div>
      ) : data?.error ? (
        <div className="rounded-[var(--radius)] border border-border bg-card p-6 text-center text-sm text-live">
          {data.error}
        </div>
      ) : groupedStandings.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Classificação indisponível para este campeonato no momento.
        </div>
      ) : (
        <div className="space-y-3">
          {groupedStandings.map(([group, rows]) => (
            <div key={group} className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
              {group !== "Tabela" ? (
                <div className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-background/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 text-left">#</th>
                      <th className="px-3 py-3 text-left">Time</th>
                      <th className="px-2 py-3 text-center">PTS</th>
                      <th className="px-2 py-3 text-center">PJ</th>
                      <th className="px-2 py-3 text-center">V</th>
                      <th className="px-2 py-3 text-center">E</th>
                      <th className="px-2 py-3 text-center">D</th>
                      <th className="px-2 py-3 text-center">SG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={`${group}-${row.teamId}`} className="border-t border-border/60">
                        <td className="px-3 py-3 text-muted-foreground">{row.position}</td>
                        <td className="px-3 py-3">
                          <div className="flex min-w-[180px] items-center gap-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={row.teamLogo || "/placeholder.svg"}
                              alt=""
                              className="h-5 w-5 shrink-0 object-contain"
                              loading="lazy"
                            />
                            <span className="truncate text-foreground">{row.teamName}</span>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center font-semibold text-foreground">{row.points}</td>
                        <td className="px-2 py-3 text-center text-muted-foreground">{row.played}</td>
                        <td className="px-2 py-3 text-center text-muted-foreground">{row.won}</td>
                        <td className="px-2 py-3 text-center text-muted-foreground">{row.draw}</td>
                        <td className="px-2 py-3 text-center text-muted-foreground">{row.lost}</td>
                        <td className="px-2 py-3 text-center text-muted-foreground">{row.goalDifference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

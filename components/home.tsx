"use client"

import useSWR from "swr"
import { Fragment, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import type { Fixture } from "@/lib/football"
import { matchesTab, type MatchCategory } from "@/lib/config"
import { MatchCard } from "./match-card"
import { AdSenseSlot } from "./adsense-slot"
import { SiteFooter } from "./site-footer"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface FixturesResponse {
  fixtures: Fixture[]
  error?: string
  usedFallback?: boolean
  fallbackRange?: { from: string; to: string }
}

function toISO(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function shiftDate(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00")
  d.setDate(d.getDate() + days)
  return toISO(d)
}

function humanDate(iso: string) {
  const today = toISO(new Date())
  const tomorrow = shiftDate(today, 1)
  const yesterday = shiftDate(today, -1)
  if (iso === today) return "Hoje"
  if (iso === tomorrow) return "Amanhã"
  if (iso === yesterday) return "Ontem"
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  })
}

const TABS: { key: MatchCategory; label: string }[] = [
  { key: "principais", label: "Principais" },
  { key: "amistosos", label: "Amistosos" },
  { key: "outras", label: "Outras ligas" },
]

export function Home() {
  const [date, setDate] = useState(() => toISO(new Date()))
  const [tab, setTab] = useState<MatchCategory>("principais")

  const { data, isLoading, error } = useSWR<FixturesResponse>(
    `/api/fixtures?date=${date}`,
    fetcher,
    { refreshInterval: 60_000 },
  )

  const fixtures = data?.fixtures ?? []

  const counts = useMemo(() => {
    const c: Record<MatchCategory, number> = { principais: 0, amistosos: 0, outras: 0 }
    for (const category of Object.keys(c) as MatchCategory[]) {
      c[category] = fixtures.filter((f) => matchesTab(category, f)).length
    }
    return c
  }, [fixtures])

  const filtered = useMemo(() => fixtures.filter((f) => matchesTab(tab, f)), [fixtures, tab])

  // Agrupa por liga dentro da aba
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; logo: string; matches: Fixture[] }>()
    for (const f of filtered) {
      const key = `${f.league.id}`
      if (!map.has(key)) map.set(key, { name: f.league.name, logo: f.league.logo, matches: [] })
      map.get(key)!.matches.push(f)
    }
    return Array.from(map.values())
  }, [filtered])

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5l4.3 3.1-1.6 5H9.3l-1.6-5L12 7.5z" fill="currentColor" stroke="none" />
              <path d="M12 3v4.5M4.5 10.2l3.2 2.3M19.5 10.2l-3.2 2.3M7.7 18.6l1.6-3.1M16.3 18.6l-1.6-3.1" />
            </svg>
          </span>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-foreground">
            Central de Jogos
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Jogos dos principais times e ligas com acesso direto a lives no YouTube quando houver transmissão brasileira.
        </p>
      </header>

      <AdSenseSlot
        slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_TOP}
        label="Topo da home"
        className="mb-6"
      />

      {/* Navegação de data */}
      <div className="mb-5 flex items-center justify-between rounded-[var(--radius)] border border-border bg-card p-2">
        <button
          onClick={() => setDate((d) => shiftDate(d, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Dia anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="font-display text-lg font-semibold capitalize text-foreground">{humanDate(date)}</span>
        </div>
        <button
          onClick={() => setDate((d) => shiftDate(d, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Próximo dia"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Abas */}
      <div role="tablist" className="mb-5 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-1.5 text-xs tabular-nums ${
                tab === t.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {error || data?.error ? (
        <div className="rounded-[var(--radius)] border border-border bg-card p-6 text-center text-sm text-live">
          {data?.error || "Erro ao carregar os jogos. Verifique a chave da API."}
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-[var(--radius)] bg-card" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {data?.usedFallback && fixtures.length > 0
              ? "Encontramos jogos nos próximos dias, mas não nesta aba. Tente alternar entre Principais, Amistosos e Outras ligas."
              : "Nenhum jogo nesta categoria para o dia selecionado."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {data?.usedFallback && data.fallbackRange ? (
            <div className="rounded-[var(--radius)] border border-border bg-card p-4 text-sm text-muted-foreground">
              Nenhum jogo encontrado exatamente em {humanDate(date)}. Exibindo os próximos jogos entre{" "}
              <span className="font-medium text-foreground">{humanDate(data.fallbackRange.from)}</span> e{" "}
              <span className="font-medium text-foreground">{humanDate(data.fallbackRange.to)}</span>.
            </div>
          ) : null}

          {grouped.map((g, index) => (
            <Fragment key={g.name}>
              <section>
                <div className="mb-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.logo || "/placeholder.svg"} alt="" className="h-4 w-4 object-contain" loading="lazy" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g.name}</h2>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {g.matches.map((f) => (
                    <MatchCard key={f.id} fixture={f} selectedDate={date} />
                  ))}
                </div>
              </section>

              {(index + 1) % 2 === 0 && index < grouped.length - 1 ? (
                <AdSenseSlot
                  slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_MIDDLE}
                  label="Meio da listagem"
                />
              ) : null}
            </Fragment>
          ))}
        </div>
      )}

      <AdSenseSlot
        slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM}
        label="Rodapé da home"
        className="mt-10"
      />

      <SiteFooter />
    </main>
  )
}

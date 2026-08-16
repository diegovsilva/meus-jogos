"use client"

import useSWR from "swr"
import { useState } from "react"
import { Play, Search } from "lucide-react"
import type { Video } from "@/lib/youtube"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function VideosSection() {
  const [query, setQuery] = useState("melhores momentos brasileirão")
  const [submitted, setSubmitted] = useState("melhores momentos brasileirão")

  const { data, isLoading, error } = useSWR<{ videos: Video[]; error?: string }>(
    submitted ? `/api/videos?q=${encodeURIComponent(submitted)}` : null,
    fetcher,
  )

  const videos = data?.videos ?? []

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) setSubmitted(query.trim())
  }

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-foreground">
            Vídeos
          </h2>
          <p className="text-sm text-muted-foreground">Somente de canais brasileiros</p>
        </div>

        <form onSubmit={onSubmit} className="flex w-full max-w-md items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
              }}
              placeholder="Buscar gols, melhores momentos..."
              className="w-full rounded-[var(--radius)] border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
          <button
            type="submit"
            className="rounded-[var(--radius)] bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Buscar
          </button>
        </form>
      </div>

      {error && <p className="text-sm text-live">Não foi possível carregar os vídeos.</p>}
      {data?.error && <p className="text-sm text-live">{data.error}</p>}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-video animate-pulse rounded-[var(--radius)] bg-card" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum vídeo de canal brasileiro encontrado para esta busca.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <a
              key={v.id}
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group overflow-hidden rounded-[var(--radius)] border border-border bg-card transition-colors hover:border-primary"
            >
              <div className="relative aspect-video overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={v.thumbnail || "/placeholder.svg"}
                  alt={v.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-background/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Play className="h-5 w-5 fill-current" />
                  </span>
                </span>
              </div>
              <div className="p-3">
                <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{v.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{v.channelTitle}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}

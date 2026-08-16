import Link from "next/link"

export function SiteFooter() {
  return (
    <footer className="mt-10 rounded-[var(--radius)] border border-border bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <p className="font-display text-lg font-semibold uppercase tracking-wide text-foreground">Central de Jogos</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Agenda de partidas, placar e links oficiais de transmissao quando disponiveis.
          </p>
        </div>

        <nav className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <Link href="/privacidade" className="transition-colors hover:text-foreground">
            Privacidade
          </Link>
          <Link href="/termos" className="transition-colors hover:text-foreground">
            Termos
          </Link>
          <Link href="/contato" className="transition-colors hover:text-foreground">
            Contato
          </Link>
        </nav>
      </div>
    </footer>
  )
}

export function VideosSection() {
  return (
    <section className="mt-10">
      <div className="rounded-[var(--radius)] border border-border bg-card p-5">
        <div>
          <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-foreground">
            Lives no YouTube
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Quando houver jogo ao vivo, o card da partida tenta localizar a transmissão no YouTube e
            abre direto a live de canais brasileiros permitidos.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Canais priorizados: CazéTV, SportyBet, GOAT, UOL Esporte, TNT Sports, GE e Canal
            GolBrasil.
          </p>
        </div>
      </div>
    </section>
  )
}

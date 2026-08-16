import Link from "next/link"
import type { Metadata } from "next"
import { SiteFooter } from "@/components/site-footer"

export const metadata: Metadata = {
  title: "Privacidade | Central de Jogos",
  description: "Politica de privacidade da Central de Jogos.",
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      <Link href="/" className="text-sm text-primary transition-opacity hover:opacity-90">
        Voltar para a home
      </Link>

      <article className="mt-4 rounded-[var(--radius)] border border-border bg-card p-6">
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-foreground">Politica de Privacidade</h1>
        <div className="mt-4 space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            A Central de Jogos exibe informacoes publicas sobre partidas, placares e canais oficiais de transmissao
            quando disponiveis.
          </p>
          <p>
            Dados tecnicos de uso podem ser coletados por provedores de hospedagem, analytics e publicidade para
            funcionamento, seguranca e medicao de desempenho do site.
          </p>
          <p>
            Links externos, incluindo YouTube, plataformas de streaming e parceiros oficiais, possuem suas proprias
            politicas de privacidade e termos de uso.
          </p>
          <p>
            Se o site utilizar publicidade do Google AdSense, cookies e tecnologias semelhantes podem ser usados para
            personalizacao e medicao de anuncios conforme as politicas do Google.
          </p>
          <p>
            Esta pagina deve ser revisada sempre que novos servicos de analytics, publicidade ou integracoes forem
            adicionados ao produto.
          </p>
        </div>
      </article>

      <SiteFooter />
    </main>
  )
}

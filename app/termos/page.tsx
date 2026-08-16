import Link from "next/link"
import type { Metadata } from "next"
import { SiteFooter } from "@/components/site-footer"

export const metadata: Metadata = {
  title: "Termos | Central de Jogos",
  description: "Termos de uso da Central de Jogos.",
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      <Link href="/" className="text-sm text-primary transition-opacity hover:opacity-90">
        Voltar para a home
      </Link>

      <article className="mt-4 rounded-[var(--radius)] border border-border bg-card p-6">
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-foreground">Termos de Uso</h1>
        <div className="mt-4 space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            A Central de Jogos fornece informacoes esportivas e indicacoes de transmissao com base em fontes externas,
            sem garantir disponibilidade continua, exclusividade ou manutencao dos links por terceiros.
          </p>
          <p>
            O usuario e responsavel por validar horarios, emissoras e disponibilidade regional das transmissoes antes de
            consumir qualquer conteudo externo.
          </p>
          <p>
            O site pode conter links para plataformas oficiais e parceiros. O acesso a servicos de terceiros esta sujeito
            aos termos e politicas dessas plataformas.
          </p>
          <p>
            Nao e permitido utilizar o conteudo do site para fins ilicitos, automacao abusiva ou reproducao integral sem
            autorizacao.
          </p>
          <p>
            Estes termos podem ser atualizados periodicamente para refletir mudancas no produto, nos parceiros e nos
            requisitos regulatorios.
          </p>
        </div>
      </article>

      <SiteFooter />
    </main>
  )
}

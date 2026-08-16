import Link from "next/link"
import type { Metadata } from "next"
import { SiteFooter } from "@/components/site-footer"

export const metadata: Metadata = {
  title: "Contato | Central de Jogos",
  description: "Pagina de contato da Central de Jogos.",
}

export default function ContactPage() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      <Link href="/" className="text-sm text-primary transition-opacity hover:opacity-90">
        Voltar para a home
      </Link>

      <article className="mt-4 rounded-[var(--radius)] border border-border bg-card p-6">
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-foreground">Contato</h1>
        <div className="mt-4 space-y-4 text-sm leading-6 text-muted-foreground">
          <p>Esta pagina centraliza contato comercial, suporte e comunicacoes relacionadas ao site.</p>

          {contactEmail ? (
            <p>
              Email:{" "}
              <a href={`mailto:${contactEmail}`} className="text-primary transition-opacity hover:opacity-90">
                {contactEmail}
              </a>
            </p>
          ) : (
            <p>
              Defina a variavel <code>NEXT_PUBLIC_CONTACT_EMAIL</code> para publicar um email real de contato antes da
              aprovacao em plataformas de anuncios.
            </p>
          )}

          <p>Para assuntos sobre transmissoes, horarios ou disponibilidade regional, confirme tambem as informacoes na plataforma oficial.</p>
        </div>
      </article>

      <SiteFooter />
    </main>
  )
}

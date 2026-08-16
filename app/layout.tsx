import type { Metadata, Viewport } from "next"
import { Geist, Oswald } from "next/font/google"
import Script from "next/script"
import "./globals.css"
import { ServiceWorkerRegister } from "@/components/service-worker-register"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-oswald" })

export const metadata: Metadata = {
  title: "Central de Jogos — Jogos, transmissoes e placares",
  description:
    "Acompanhe os jogos dos principais times e ligas, veja onde assistir e encontre lives no YouTube quando houver transmissao brasileira.",
  manifest: "/manifest.json",
}

export const viewport: Viewport = {
  themeColor: "#0a0e12",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT

  return (
    <html lang="pt-BR" className={`${geist.variable} ${oswald.variable} bg-background`}>
      <body className="min-h-screen antialiased">
        <ServiceWorkerRegister />
        {children}
        {adsenseClient ? (
          <Script
            async
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  )
}

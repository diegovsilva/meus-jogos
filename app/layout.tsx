import type { Metadata, Viewport } from "next"
import { Geist, Oswald } from "next/font/google"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-oswald" })

export const metadata: Metadata = {
  title: "Central de Jogos — Futebol ao vivo e vídeos",
  description:
    "Acompanhe os jogos dos principais times e ligas do Brasil e do mundo, com placares ao vivo e vídeos dos canais brasileiros.",
}

export const viewport: Viewport = {
  themeColor: "#0a0e12",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geist.variable} ${oswald.variable} bg-background`}>
      <body className="antialiased">{children}</body>
    </html>
  )
}

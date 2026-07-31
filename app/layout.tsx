import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AppChrome } from "@/components/app-chrome"
import { Toaster } from "@/components/ui/toaster"
import { IdiomaProvider } from "@/components/idioma-provider"
import { idiomaActual } from "@/lib/i18n-servidor"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" })

export const metadata: Metadata = {
  title: "Diime - Conecta con Profesionales",
  description:
    "Diime es la plataforma que conecta profesionales cualificados con clientes. Encuentra expertos en construccion, reformas y mas.",
  generator: "v0.app",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "any" },
      { url: "/icon.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-icon.png",
    shortcut: "/icon.png",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // El idioma se resuelve aquí, en el servidor, y baja al árbol de cliente por
  // el provider: así el HTML ya sale traducido y `lang` es correcto para
  // lectores de pantalla y buscadores.
  const idioma = await idiomaActual()

  return (
    <html lang={idioma} suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable} bg-background`}>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <IdiomaProvider idioma={idioma}>
            <div className="flex flex-col min-h-screen">
              <AppChrome>{children}</AppChrome>
            </div>
            <Toaster />
          </IdiomaProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

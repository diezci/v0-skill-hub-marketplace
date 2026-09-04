import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import "./globals.css"
import "./native-launch.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AppChrome } from "@/components/app-chrome"
import { Toaster } from "@/components/ui/toaster"
import { IdiomaProvider } from "@/components/idioma-provider"
import { idiomaActual } from "@/lib/i18n-servidor"
import { RegistrarSW } from "@/components/registrar-sw"
import { CapacitorBridge } from "@/components/capacitor-bridge"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" })

export const metadata: Metadata = {
  title: "Diime - Conecta con Profesionales",
  description:
    "Diime es la plataforma que conecta profesionales cualificados con clientes. Encuentra expertos en construccion, reformas y mas.",
  generator: "Diime",
  icons: {
    icon: [
      { url: "/favicon-diime-v3.ico", type: "image/x-icon", sizes: "64x64" },
      { url: "/favicon-diime-v3.png", type: "image/png", sizes: "64x64" },
      { url: "/icon.svg?v=logo-safe-3", type: "image/svg+xml", sizes: "any" },
      { url: "/icons/icon-192.png?v=logo-safe-3", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png?v=logo-safe-3", sizes: "512x512", type: "image/png" },
    ],
    // iOS ignora el manifest para el icono de la pantalla de inicio: usa este.
    apple: "/icons/apple-touch-icon.png?v=logo-safe-3",
    shortcut: "/favicon-diime-v3.ico",
  },
  // iOS tampoco lee `display: standalone` del manifest; necesita lo suyo para
  // abrir sin barra de navegador al añadirla a la pantalla de inicio.
  appleWebApp: {
    capable: true,
    title: "Diime",
    statusBarStyle: "black-translucent",
  },
  other: {
    // Next emite el nombre moderno (`mobile-web-app-capable`); las versiones
    // antiguas de iOS solo entienden el prefijado, así que van los dos.
    "apple-mobile-web-app-capable": "yes",
  },
}

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#080c10" },
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
    <html lang={idioma} suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable} bg-background dark`}>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <IdiomaProvider idioma={idioma}>
            <div className="flex flex-col min-h-screen">
              <AppChrome>{children}</AppChrome>
            </div>
            <Toaster />
            <RegistrarSW />
            <CapacitorBridge />
          </IdiomaProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

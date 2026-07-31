"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Cookie } from "lucide-react"

export const COOKIES_KEY = "diime_cookies_consentimiento"
// Se avisa por evento para que la bienvenida no se solape con el banner: lo
// primero que hay que poder contestar es el consentimiento.
export const COOKIES_EVENTO = "diime:cookies-decididas"

export type ConsentimientoCookies = "aceptadas" | "rechazadas"

// Qué decidió esta persona. `null` = todavía no ha contestado.
// Pensado para que, cuando se añada analítica, se pueda consultar antes de
// cargarla: sin un "aceptadas" explícito no debe cargarse nada opcional.
export function consentimientoCookies(): ConsentimientoCookies | null {
  if (typeof window === "undefined") return null
  try {
    const v = localStorage.getItem(COOKIES_KEY)
    return v === "aceptadas" || v === "rechazadas" ? v : null
  } catch {
    return null
  }
}

export function BannerCookies() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Solo en efecto: leer localStorage al renderizar rompería la hidratación.
    if (consentimientoCookies() === null) setVisible(true)
  }, [])

  const decidir = (valor: ConsentimientoCookies) => {
    try {
      localStorage.setItem(COOKIES_KEY, valor)
    } catch {
      // Modo privado restrictivo: se cierra igual y se volverá a preguntar.
    }
    setVisible(false)
    window.dispatchEvent(new CustomEvent(COOKIES_EVENTO))
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Consentimiento de cookies"
      className="fixed inset-x-0 bottom-0 z-[100] border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="container mx-auto max-w-4xl px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <Cookie className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 hidden sm:block" />
        <p className="text-sm text-muted-foreground flex-1">
          Usamos cookies necesarias para que Diime funcione (mantener tu sesión, por ejemplo). Nos gustaría usar además
          cookies opcionales para entender cómo se usa la web.{" "}
          <Link href="/legal/cookies" className="underline underline-offset-2 hover:text-foreground">
            Más información
          </Link>
          .
        </p>
        {/* Los dos botones con el mismo peso visual: el RGPD exige que rechazar
            sea tan fácil como aceptar. */}
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none bg-transparent" onClick={() => decidir("rechazadas")}>
            Solo las necesarias
          </Button>
          <Button
            size="sm"
            className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700"
            onClick={() => decidir("aceptadas")}
          >
            Aceptar todas
          </Button>
        </div>
      </div>
    </div>
  )
}

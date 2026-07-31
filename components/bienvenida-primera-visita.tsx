"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Check, ShieldCheck } from "lucide-react"
import { COOKIES_EVENTO, consentimientoCookies } from "@/components/banner-cookies"
import { useT } from "@/components/idioma-provider"

const VISTA_KEY = "diime_bienvenida_vista"

// Las dos caras del marketplace, una por columna: quien necesita el servicio y
// quien lo presta. Cada una con su imagen, lo que gana y su llamada a la acción,
// para que alguien que llega por primera vez se reconozca de un vistazo.
const LADOS = [
  {
    id: "cliente",
    imagen: "/woman-middle-age.jpg",
    alt: "Clienta sonriendo",
    etiqueta: "bienvenida.cliente.etiqueta",
    ventajas: ["bienvenida.cliente.1", "bienvenida.cliente.2", "bienvenida.cliente.3", "bienvenida.cliente.4"],
    cta: { texto: "bienvenida.cliente.cta", href: "/" },
  },
  {
    id: "profesional",
    imagen: "/contractor-man.jpg",
    alt: "Profesional de la construcción en una obra",
    etiqueta: "bienvenida.pro.etiqueta",
    ventajas: ["bienvenida.pro.1", "bienvenida.pro.2", "bienvenida.pro.3", "bienvenida.pro.4"],
    cta: { texto: "bienvenida.pro.cta", href: "/convertirse-profesional" },
  },
]

export function BienvenidaPrimeraVisita() {
  const t = useT()
  const [abierto, setAbierto] = useState(false)
  const pathname = usePathname()

  // En las páginas de acceso no interrumpimos: quien está registrándose o
  // iniciando sesión ya sabe a qué viene.
  const enAuth = pathname?.startsWith("/auth")

  useEffect(() => {
    if (enAuth) return

    const abrirSiToca = () => {
      try {
        if (!localStorage.getItem(VISTA_KEY)) setAbierto(true)
      } catch {
        // Sin localStorage (modo privado restrictivo): no insistimos.
      }
    }

    // El banner de cookies va primero: es lo que hay que poder contestar antes
    // de nada, y dos capas a la vez se estorban. Si aún no hay respuesta,
    // esperamos a que la haya.
    if (consentimientoCookies() === null) {
      window.addEventListener(COOKIES_EVENTO, abrirSiToca)
      return () => window.removeEventListener(COOKIES_EVENTO, abrirSiToca)
    }

    abrirSiToca()
  }, [enAuth])

  const cerrar = () => {
    setAbierto(false)
    try {
      localStorage.setItem(VISTA_KEY, "1")
    } catch {}
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{t("bienvenida.titulo")}</DialogTitle>
          <DialogDescription>{t("bienvenida.subtitulo")}</DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4">
          {LADOS.map((lado) => (
            <div key={lado.id} className="rounded-xl border overflow-hidden flex flex-col">
              <div className="relative h-32 sm:h-36">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lado.imagen} alt={lado.alt} className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
                <p className="absolute bottom-2 left-3 right-3 text-white font-semibold drop-shadow">
                  {t(lado.etiqueta)}
                </p>
              </div>

              <ul className="p-3 space-y-2 flex-1">
                {lado.ventajas.map((v) => (
                  <li key={v} className="flex gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                    <span className="leading-snug">{t(v)}</span>
                  </li>
                ))}
              </ul>

              <div className="p-3 pt-0">
                <Button
                  asChild
                  variant={lado.id === "cliente" ? "default" : "outline"}
                  className={lado.id === "cliente" ? "w-full bg-emerald-600 hover:bg-emerald-700" : "w-full bg-transparent"}
                  onClick={cerrar}
                >
                  <Link href={lado.cta.href}>{t(lado.cta.texto)}</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          {t("bienvenida.pie")}
        </p>
      </DialogContent>
    </Dialog>
  )
}

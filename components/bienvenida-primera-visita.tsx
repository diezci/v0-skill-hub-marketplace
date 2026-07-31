"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Check, ShieldCheck } from "lucide-react"

const VISTA_KEY = "diime_bienvenida_vista"

// Las dos caras del marketplace, una por columna: quien necesita el servicio y
// quien lo presta. Cada una con su imagen, lo que gana y su llamada a la acción,
// para que alguien que llega por primera vez se reconozca de un vistazo.
const LADOS = [
  {
    id: "cliente",
    imagen: "/woman-middle-age.jpg",
    alt: "Clienta sonriendo",
    etiqueta: "Necesito un servicio",
    ventajas: [
      "Publicas gratis y recibes varias ofertas con precio y plazo.",
      "Profesionales verificados de tu provincia y especialidad.",
      "Pagas protegido: el dinero queda en custodia hasta que confirmes.",
      "Si algo no encaja, media el equipo de Diime.",
    ],
    cta: { texto: "Publicar una demanda", href: "/" },
  },
  {
    id: "profesional",
    imagen: "/contractor-man.jpg",
    alt: "Profesional de la construcción en una obra",
    etiqueta: "Soy profesional",
    ventajas: [
      "Más mercado: demandas de tu especialidad y tu zona, sin buscarlas.",
      "Cobro asegurado: el cliente paga antes de que empieces.",
      "Gestionas todos tus proyectos, entregas y mensajes en un sitio.",
      "Pujar es gratis.",
    ],
    cta: { texto: "Crear perfil profesional", href: "/convertirse-profesional" },
  },
]

export function BienvenidaPrimeraVisita() {
  const [abierto, setAbierto] = useState(false)
  const pathname = usePathname()

  // En las páginas de acceso no interrumpimos: quien está registrándose o
  // iniciando sesión ya sabe a qué viene.
  const enAuth = pathname?.startsWith("/auth")

  useEffect(() => {
    if (enAuth) return
    try {
      if (!localStorage.getItem(VISTA_KEY)) setAbierto(true)
    } catch {
      // Sin localStorage (modo privado restrictivo): no insistimos.
    }
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
          <DialogTitle className="text-2xl">Bienvenido a Diime</DialogTitle>
          <DialogDescription>
            Conectamos a quien necesita un servicio con profesionales verificados, con el pago protegido de principio
            a fin.
          </DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4">
          {LADOS.map((lado) => (
            <div key={lado.id} className="rounded-xl border overflow-hidden flex flex-col">
              <div className="relative h-32 sm:h-36">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lado.imagen} alt={lado.alt} className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
                <p className="absolute bottom-2 left-3 right-3 text-white font-semibold drop-shadow">
                  {lado.etiqueta}
                </p>
              </div>

              <ul className="p-3 space-y-2 flex-1">
                {lado.ventajas.map((v) => (
                  <li key={v} className="flex gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                    <span className="leading-snug">{v}</span>
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
                  <Link href={lado.cta.href}>{lado.cta.texto}</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          El pago se retiene en custodia y solo se libera cuando el cliente confirma el trabajo.
        </p>
      </DialogContent>
    </Dialog>
  )
}

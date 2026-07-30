"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { FileText, Users, ShieldCheck, CheckCircle2, HardHat, Check } from "lucide-react"

const VISTA_KEY = "diime_bienvenida_vista"

// Mismo recorrido que la sección "Cómo funciona" del homepage, resumido: quien
// llega por primera vez entiende el modelo (y sobre todo el pago protegido)
// sin tener que leerse la portada entera.
const PASOS = [
  {
    icon: FileText,
    titulo: "Publica tu demanda",
    texto: "Cuenta qué necesitas y en qué provincia. Es gratis y sin compromiso.",
  },
  {
    icon: Users,
    titulo: "Recibe ofertas",
    texto: "Los profesionales de esa zona y especialidad te envían su propuesta con precio y plazo.",
  },
  {
    icon: ShieldCheck,
    titulo: "Paga protegido",
    texto: "Tu dinero queda retenido en custodia por Diime: el profesional no cobra hasta que confirmes.",
  },
  {
    icon: CheckCircle2,
    titulo: "Confirma y valora",
    texto: "Cuando el trabajo esté hecho, lo confirmas, se libera el pago y valoras al profesional.",
  },
]

// Lo que gana el profesional. El orden importa: primero el mercado (por qué
// entrar), luego el cobro (la objeción real de quien ya trabaja por su cuenta).
const VENTAJAS_PROFESIONAL = [
  "Más mercado: demandas de tu especialidad y tu provincia, sin buscar clientes.",
  "Cobro asegurado: el cliente paga antes de que empieces y el dinero queda en custodia.",
  "Tus proyectos en un sitio: progreso, entregas, calendario y mensajes con cada cliente.",
  "Factura y condiciones por escrito en cada trabajo, y valoraciones que te traen el siguiente.",
  "Pujar es gratis: solo hay comisión cuando cobras, y si hay desacuerdo media Diime.",
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">Bienvenido a Diime</DialogTitle>
          <DialogDescription>
            Conectamos a quien necesita un servicio con profesionales verificados. Así funciona:
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 py-1">
          {PASOS.map((paso, i) => {
            const Icon = paso.icon
            return (
              <li key={paso.titulo} className="flex gap-3">
                <span className="h-9 w-9 shrink-0 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {i + 1}. {paso.titulo}
                  </p>
                  <p className="text-sm text-muted-foreground leading-snug">{paso.texto}</p>
                </div>
              </li>
            )
          })}
        </ol>

        <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <HardHat className="h-4 w-4 text-muted-foreground" />
            ¿Eres profesional? Esto te aporta Diime
          </p>
          <ul className="space-y-1.5">
            {VENTAJAS_PROFESIONAL.map((v) => (
              <li key={v} className="text-sm text-muted-foreground flex gap-2">
                <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <Button asChild variant="outline" onClick={cerrar} className="bg-transparent">
            <Link href="/convertirse-profesional">Soy profesional</Link>
          </Button>
          <Button onClick={cerrar} className="bg-emerald-600 hover:bg-emerald-700">
            Entendido, empezar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

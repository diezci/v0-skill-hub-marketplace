"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Scale, Briefcase, Clock, CheckCircle2, FileText, ArrowRight } from "lucide-react"
import { obtenerMisDisputas } from "@/app/actions/disputes"

const ESTADO_CONFIG: Record<string, { label: string; cls: string; icon: any }> = {
  abierta: {
    label: "En revisión por Diime",
    cls: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    icon: Clock,
  },
  resuelta: {
    label: "Resuelta",
    cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    icon: CheckCircle2,
  },
}

// Cómo se le explica el desenlace a cada rol: el mismo fallo se lee distinto
// según seas el cliente o el profesional.
function textoResolucion(resolucion: string | null, soyCliente: boolean): string {
  if (resolucion === "cliente") {
    return soyCliente
      ? "Resuelta a tu favor: se te ha reembolsado el importe."
      : "Resuelta a favor del cliente: se le ha reembolsado el importe."
  }
  if (resolucion === "proveedor") {
    return soyCliente
      ? "Resuelta a favor del profesional: se le ha liberado el pago."
      : "Resuelta a tu favor: se te ha liberado el pago."
  }
  if (resolucion === "parcial") {
    return "Resuelta de forma parcial: se ha reembolsado una parte al cliente."
  }
  return "Resuelta por el equipo de Diime."
}

export default function MisDisputas({ rol }: { rol: "cliente" | "proveedor" }) {
  const [disputas, setDisputas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let activo = true
    obtenerMisDisputas().then((res) => {
      if (!activo) return
      setDisputas(res.data || [])
      setLoading(false)
    })
    return () => {
      activo = false
    }
  }, [])

  const formatFecha = (f: string) =>
    new Date(f).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (disputas.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Scale className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium">No tienes disputas</p>
          <p className="text-muted-foreground mt-1 max-w-md">
            Si surge un desacuerdo sobre un trabajo, aquí verás las disputas que hayas abierto y las que la otra
            parte haya abierto, con su estado y la decisión del equipo de Diime.
          </p>
        </CardContent>
      </Card>
    )
  }

  const abiertas = disputas.filter((d) => d.estado !== "resuelta").length

  return (
    <div className="space-y-4">
      {abiertas > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground flex items-start gap-2">
          <Scale className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <span>
            Tienes {abiertas} disputa{abiertas !== 1 ? "s" : ""} en revisión. Mientras dure, el pago sigue retenido
            en custodia. Puedes aportar pruebas en el chat del trabajo.
          </span>
        </div>
      )}

      {disputas.map((d) => {
        const estado = ESTADO_CONFIG[d.estado] || ESTADO_CONFIG.abierta
        const EstadoIcon = estado.icon
        const soyCliente = rol === "cliente"
        return (
          <Card key={d.id}>
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{d.trabajo_titulo}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {d.la_abri_yo ? "La abriste tú" : "Abierta por la otra parte"}
                    {d.otra_parte && ` · ${d.otra_parte.nombre ?? ""} ${d.otra_parte.apellido ?? ""}`.trimEnd()}
                    {" · "}
                    {formatFecha(d.created_at)}
                  </p>
                </div>
                <Badge variant="outline" className={`gap-1 shrink-0 ${estado.cls}`}>
                  <EstadoIcon className="h-3.5 w-3.5" />
                  {estado.label}
                </Badge>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-0.5">Motivo</p>
                <p className="text-sm text-muted-foreground">{d.motivo}</p>
              </div>

              {d.estado === "resuelta" && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-0.5">
                    Decisión del equipo de Diime
                  </p>
                  <p className="text-sm text-muted-foreground">{textoResolucion(d.resolucion, soyCliente)}</p>
                  {d.resultado && (
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium text-foreground">Motivo: </span>
                      {d.resultado}
                    </p>
                  )}
                  {d.fecha_resolucion && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Resuelta el {formatFecha(d.fecha_resolucion)}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  href={`/trabajos/${d.trabajo_id}/factura`}
                  target="_blank"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <FileText className="h-3.5 w-3.5" /> Ver factura y términos
                </Link>
                <Link
                  href="/mensajes"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <Briefcase className="h-3.5 w-3.5" /> Aportar pruebas en el chat
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

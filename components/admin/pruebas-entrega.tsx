"use client"

import { Paperclip } from "lucide-react"
import { useIdioma } from "@/components/idioma-provider"
import { AdjuntosLista } from "@/components/adjuntos-lista"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { localeDe } from "@/lib/i18n"

type ActualizacionPrueba = {
  id: string
  tipo: string
  mensaje: string | null
  archivos: string[] | null
  created_at: string
}

export function PruebasEntrega({ actualizaciones }: { actualizaciones: ActualizacionPrueba[] }) {
  const { t, idioma } = useIdioma()
  const grupos = [
    { tipo: "entrega", titulo: t("Entrega del proveedor") },
    { tipo: "rechazo_entrega", titulo: t("Rechazo del cliente") },
  ].map((grupo) => ({ ...grupo, eventos: actualizaciones.filter((evento) => evento.tipo === grupo.tipo) }))
  if (!grupos.some((grupo) => grupo.eventos.length > 0)) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("Pruebas de la entrega y del rechazo")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4 md:grid-cols-2">
        {grupos.map((grupo) => (
          <section key={grupo.tipo} aria-label={grupo.titulo} className="min-w-0 space-y-3 rounded-lg border bg-muted/20 p-4">
            <h3 className="text-sm font-semibold">{grupo.titulo}</h3>
            {grupo.eventos.length === 0 && <p className="text-sm text-muted-foreground">{t("Sin registro de esta acción.")}</p>}
            {grupo.eventos.map((evento) => (
              <div key={evento.id} className="min-w-0 space-y-2 border-t pt-3">
                <time dateTime={evento.created_at} className="text-xs text-muted-foreground">
                  {new Date(evento.created_at).toLocaleString(localeDe(idioma), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </time>
                {evento.mensaje && <p className="whitespace-pre-wrap break-words text-sm">{evento.mensaje}</p>}
                {Array.isArray(evento.archivos) && evento.archivos.length > 0
                  ? <AdjuntosLista archivos={evento.archivos} />
                  : <p className="text-xs text-muted-foreground">{t("No adjuntó archivos.")}</p>}
              </div>
            ))}
          </section>
        ))}
      </CardContent>
    </Card>
  )
}

"use client"

import { useState } from "react"
import { Bell, CheckCheck, Loader2 } from "lucide-react"
import { useIdioma } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { traducirTextoNotificacion } from "@/lib/i18n-notificaciones"

export type AvisoTarjeta = { id: string; tipo: string; titulo?: string | null; mensaje?: string | null }

/** Mantiene visible el motivo del aviso hasta que la persona lo da por visto. */
export function AvisosTarjeta({ avisos, onMarcarLeidas, titulo = "Novedades de este trabajo" }: {
  avisos: AvisoTarjeta[]
  titulo?: string
  onMarcarLeidas?: (ids: string[]) => Promise<unknown> | void
}) {
  const { idioma, t } = useIdioma()
  const [guardando, setGuardando] = useState(false)
  if (!avisos.length) return null

  return (
    <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3" aria-label={t(titulo)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Bell className="h-4 w-4 shrink-0" />
          {t(titulo)} · {avisos.length}
        </p>
        {onMarcarLeidas && <Button variant="ghost" size="sm" className="h-auto min-h-8 whitespace-normal text-left" disabled={guardando} onClick={async () => {
          setGuardando(true)
          try { await onMarcarLeidas(avisos.map((aviso) => aviso.id)) }
          finally { setGuardando(false) }
        }}>
          {guardando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="mr-1.5 h-3.5 w-3.5" />}
          {t("Marcar novedades como vistas")}
        </Button>}
      </div>
      <ul className="space-y-2">
        {avisos.map((aviso) => (
          <li key={aviso.id} className="min-w-0 break-words text-sm">
            <p className="font-medium">{traducirTextoNotificacion(idioma, aviso.titulo || "Nueva actualización", aviso.tipo)}</p>
            {aviso.mensaje && <p className="mt-0.5 text-muted-foreground">{traducirTextoNotificacion(idioma, aviso.mensaje, aviso.tipo)}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

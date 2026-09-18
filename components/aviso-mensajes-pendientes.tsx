"use client"

import Link from "next/link"
import { MessageSquare, ArrowUpRight } from "lucide-react"
import { useIdioma } from "@/components/idioma-provider"
import { useResumenNotificaciones } from "@/hooks/use-notificaciones-seccion"
import { Button } from "@/components/ui/button"
import { localeDe } from "@/lib/i18n"

/** Chat unread state comes from mensajes.leido, never a duplicate notification row. */
export function AvisoMensajesPendientes({ enPanelAdmin = false, onAbrir }: { enPanelAdmin?: boolean; onAbrir?: () => void }) {
  const { t, idioma } = useIdioma()
  const { resumen } = useResumenNotificaciones()
  if (!resumen.mensajesNoLeidos) return null
  const ultimo = resumen.ultimoMensajeNoLeido
  const ruta = enPanelAdmin ? "/admin/mensajes" : "/mensajes"
  return <article className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
    <p className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4 shrink-0 text-emerald-600" />{t(enPanelAdmin ? "Mensajes pendientes de soporte" : "Mensajes sin leer")}<span className="ml-auto rounded-full bg-emerald-500/15 px-2 text-xs">{resumen.mensajesNoLeidos}</span></p>
    {ultimo && <>
      <p className="mt-2 break-words text-sm font-medium">{ultimo.remitente}</p>
      <p className="mt-0.5 break-words text-sm text-muted-foreground">{ultimo.preview}</p>
      <time dateTime={ultimo.created_at} className="mt-1 block text-xs text-muted-foreground">{new Date(ultimo.created_at).toLocaleString(localeDe(idioma), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
    </>}
    <div className="mt-2 flex flex-wrap gap-2">
      {ultimo && <Button asChild variant="ghost" size="sm" className="h-8 px-2"><Link href={`${ruta}?c=${encodeURIComponent(ultimo.conversacion_id)}`} onClick={onAbrir}><ArrowUpRight className="mr-1 h-3.5 w-3.5" />{t("Abrir conversación")}</Link></Button>}
      <Button asChild variant="ghost" size="sm" className="h-8 px-2"><Link href={`${ruta}?filtro=no-leidos`} onClick={onAbrir}>{t("Ver mensajes pendientes")}</Link></Button>
    </div>
  </article>
}

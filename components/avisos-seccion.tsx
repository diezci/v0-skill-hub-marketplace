"use client"

import Link from "next/link"
import { useState } from "react"
import { Bell, Check, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useIdioma, useT } from "@/components/idioma-provider"
import { traducirTextoNotificacion } from "@/lib/i18n-notificaciones"
import { localeDe } from "@/lib/i18n"
import { enlaceDeAviso, type NotificacionContextual } from "@/lib/notificaciones-contexto"
import { useNotificacionesSeccion } from "@/hooks/use-notificaciones-seccion"

const SECCIONES: Record<string, string> = {
  "/demandas": "Solicitudes de terceros", "/mis-solicitudes": "Mis Solicitudes", "/mis-ofertas": "Mis Pujas",
  "/mis-trabajos": "Gestión de proyectos", "/mi-perfil": "Mi perfil", "/incidencias": "Incidencias", "/mensajes": "Mensajes",
  "/admin/mensajes": "Soporte", "/admin/incidencias": "Incidencias", "/admin/disputas": "Disputas",
  "/admin/verificaciones": "Verificaciones", "/admin/pagos": "Pagos", "/admin/trabajos": "Trabajos y justificantes",
  "/admin/usuarios": "Usuarios", "/admin/operaciones": "Operaciones",
}

export function FilaAviso({ aviso, onMarcar, onAbrir }: { aviso: NotificacionContextual; onMarcar: (ids: string[]) => Promise<boolean>; onAbrir?: () => void }) {
  const t = useT()
  const { idioma } = useIdioma()
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState(false)
  return <article id={`aviso-${aviso.id}`} className={`min-w-0 rounded-lg border p-3 scroll-mt-24 ${aviso.leida ? "border-border" : "border-emerald-500/30 bg-emerald-500/5"}`}>
    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {!aviso.leida && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-label={t("Sin leer")} />}
      <span className="font-medium text-emerald-700 dark:text-emerald-400">{t(aviso.aspecto)}</span>
      <span className="text-muted-foreground">{t(SECCIONES[aviso.seccion] || "Notificaciones")}</span>
      <time dateTime={aviso.created_at} className="text-muted-foreground">{new Date(aviso.created_at).toLocaleString(localeDe(idioma), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
    </div>
    {aviso.tituloEntidad && <p className="break-words text-sm font-semibold">{aviso.tituloEntidad}</p>}
    <p className="break-words text-sm font-medium">{traducirTextoNotificacion(idioma, aviso.titulo, aviso.tipo)}</p>
    {aviso.mensaje && <p className="mt-1 whitespace-pre-line break-words text-sm text-muted-foreground">{traducirTextoNotificacion(idioma, aviso.mensaje, aviso.tipo)}</p>}
    <div className="mt-2 flex flex-wrap gap-2">
      <Button asChild variant="ghost" size="sm" className="h-8 px-2">
        <Link href={enlaceDeAviso(aviso)} onClick={onAbrir}><ArrowUpRight className="mr-1 h-3.5 w-3.5" />{t(aviso.solicitud_id || aviso.trabajo_id || aviso.oferta_id ? "Ver trabajo" : "Ver detalle")}</Link>
      </Button>
      {!aviso.leida && <Button variant="ghost" size="sm" className="h-8 px-2" disabled={guardando} onClick={async () => {
        setGuardando(true); setFallo(false)
        try { setFallo(!(await onMarcar([aviso.id]))) } catch { setFallo(true) } finally { setGuardando(false) }
      }}><Check className="mr-1 h-3.5 w-3.5" />{t("Marcar como visto")}</Button>}
    </div>
    {fallo && <p role="alert" className="mt-1 text-xs text-destructive">{t("No se pudieron marcar las notificaciones")}</p>}
  </article>
}

export function AvisosSeccion({ seccion }: { seccion: string }) {
  const t = useT()
  const { pendientes, marcarLeidas } = useNotificacionesSeccion(seccion)
  const [ampliado, setAmpliado] = useState(false)
  if (!pendientes.length || seccion === "/notificaciones" || seccion === "/admin/notificaciones" || seccion === "/mensajes") return null
  return <aside aria-label={t("Novedades de esta sección")} className="container mx-auto px-4 pt-5">
    <div className="rounded-xl border border-emerald-500/30 bg-background p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4 text-emerald-600" />{t("Novedades de esta sección")}<span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs">{pendientes.length}</span></div>
      <p className="mb-3 text-xs text-muted-foreground">{t("Cada aviso indica qué ha cambiado. Ábrelo o márcalo como visto cuando lo hayas revisado.")}</p>
      <div className="grid gap-2 md:grid-cols-2">{(ampliado ? pendientes : pendientes.slice(0, 2)).map(n => <FilaAviso key={n.id} aviso={n} onMarcar={marcarLeidas} />)}</div>
      {pendientes.length > 2 && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAmpliado(!ampliado)}>{t(ampliado ? "Mostrar menos" : "Ver todas las novedades")}</Button>}
    </div>
  </aside>
}

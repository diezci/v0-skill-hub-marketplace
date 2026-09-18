"use client"

import { useState } from "react"
import Link from "next/link"
import { Bell } from "lucide-react"
import { useT } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useResumenNotificaciones } from "@/hooks/use-notificaciones-seccion"
import { FilaAviso } from "@/components/avisos-seccion"
import { AvisoMensajesPendientes } from "@/components/aviso-mensajes-pendientes"

export function CampanaNotificaciones({ enPanelAdmin = false }: { enPanelAdmin?: boolean }) {
  const t = useT()
  const [abierta, setAbierta] = useState(false)
  const { resumen, error, cargando, recargar, marcarLeidas } = useResumenNotificaciones()
  const notificaciones = enPanelAdmin ? resumen.notificaciones.filter(n => n.seccion.startsWith("/admin/")) : resumen.notificaciones
  const pendientes = notificaciones.length + (enPanelAdmin ? resumen.mensajesNoLeidos : 0)
  const centroHref = enPanelAdmin ? "/admin/notificaciones" : "/notificaciones"
  return <Popover open={abierta} onOpenChange={open => { setAbierta(open); if (open) void recargar() }}>
    <PopoverTrigger asChild>
      <Button size="icon" variant="ghost" className="relative shrink-0" aria-label={t("Notificaciones pendientes: {count}", { count: pendientes })}>
        <Bell className="h-5 w-5" />
        {pendientes > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{pendientes > 99 ? "99+" : pendientes}</span>}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-[min(26rem,calc(100vw-1rem))] p-3">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{t("Notificaciones")}</h2><Button asChild size="sm" variant="ghost"><Link href={centroHref} onClick={() => setAbierta(false)}>{t("Ver todas")}</Link></Button></div>
      {error && <p role="alert" className="mb-2 text-sm text-destructive">{t(error)}</p>}
      <div className="max-h-[min(65dvh,32rem)] space-y-2 overflow-y-auto">
        {enPanelAdmin && <AvisoMensajesPendientes enPanelAdmin onAbrir={() => setAbierta(false)} />}
        {notificaciones.slice(0, 20).map(n => <FilaAviso key={n.id} aviso={n} onMarcar={marcarLeidas} onAbrir={() => setAbierta(false)} />)}
        {!pendientes && <p className="p-5 text-center text-sm text-muted-foreground">{t(cargando ? "Cargando..." : "No tienes notificaciones pendientes")}</p>}
      </div>
      {notificaciones.length > 20 && <Button asChild variant="ghost" className="mt-2 w-full"><Link href={centroHref} onClick={() => setAbierta(false)}>{t("Ver todas las novedades")}</Link></Button>}
    </PopoverContent>
  </Popover>
}

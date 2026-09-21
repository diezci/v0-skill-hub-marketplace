"use client"

import { useEffect, useRef, useState } from "react"
import { Bell, Check, CheckCheck, CircleHelp, MapPin, MessageSquare, RotateCcw, Sparkles, TrendingUp, Wallet } from "lucide-react"
import { useIdioma } from "@/components/idioma-provider"
import { FilaAviso } from "@/components/avisos-seccion"
import { AvisosTarjeta } from "@/components/avisos-tarjeta"
import { ContenidoAvisoMensajesPendientes } from "@/components/aviso-mensajes-pendientes"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { NotificacionContextual } from "@/lib/notificaciones-contexto"

const EJEMPLOS = [
  { id: "solicitud", es: "Nueva solicitud", en: "New request", icono: Sparkles },
  { id: "actualizacion", es: "Actualización", en: "Work update", icono: TrendingUp },
  { id: "reembolso", es: "Reembolso", en: "Refund", icono: Wallet },
  { id: "soporte", es: "Soporte admin", en: "Admin support", icono: MessageSquare },
] as const
type Ejemplo = typeof EJEMPLOS[number]["id"]
const ejemploValido = (valor?: string): Ejemplo => EJEMPLOS.find(e => e.id === valor)?.id || "solicitud"
const FECHA = "2026-09-19T09:45:00+02:00"
const URL_DEMO = "/demo/notificaciones"

// These records exist only in this development view. Links stay inside the
// demo, and every read action below changes React state only.
const AVISOS: Record<Exclude<Ejemplo, "soporte">, NotificacionContextual> = {
  solicitud: {
    id: "d0000000-0000-4000-8000-000000000001", tipo: "demanda_nueva",
    titulo: "Nueva demanda en tu área",
    mensaje: 'Se ha publicado "Pintar un salón de 25 m²" (Pintura) en Madrid. Presupuesto: 250 – 400 €. Échale un vistazo y envía tu oferta.',
    link: `${URL_DEMO}?ejemplo=solicitud#demo-detalle`, leida: false, created_at: FECHA,
    seccion: "/demandas", aspecto: "Nueva solicitud", tituloEntidad: "Pintar un salón de 25 m²",
    solicitud_id: "d1000000-0000-4000-8000-000000000001", trabajo_id: null, oferta_id: null, incidencia_id: null,
  },
  actualizacion: {
    id: "d0000000-0000-4000-8000-000000000002", tipo: "progreso_trabajo",
    titulo: "Progreso actualizado: 60%",
    mensaje: "Ya están reparadas las paredes y aplicada la primera mano. Mañana terminaré la segunda mano y los remates.",
    link: `${URL_DEMO}?ejemplo=actualizacion#demo-detalle`, leida: false, created_at: FECHA,
    seccion: "/mis-solicitudes", aspecto: "Progreso", tituloEntidad: "Pintar un salón de 25 m²",
    solicitud_id: "d1000000-0000-4000-8000-000000000002", trabajo_id: "d2000000-0000-4000-8000-000000000002", oferta_id: null, incidencia_id: null,
  },
  reembolso: {
    id: "d0000000-0000-4000-8000-000000000003", tipo: "reembolso_emitido",
    titulo: "Cancelación reembolsada",
    mensaje: "Se ha cancelado el servicio de mutuo acuerdo. Se han reembolsado 20.00 EUR. Diime conserva 2.00 EUR de comisión del cliente.",
    link: `${URL_DEMO}?ejemplo=reembolso#demo-detalle`, leida: false, created_at: FECHA,
    seccion: "/mis-solicitudes", aspecto: "Pago", tituloEntidad: "Ajustar una puerta interior",
    solicitud_id: "d1000000-0000-4000-8000-000000000003", trabajo_id: "d2000000-0000-4000-8000-000000000003", oferta_id: null, incidencia_id: null,
  },
}
const MENSAJE_SOPORTE = {
  id: "d0000000-0000-4000-8000-000000000004",
  remitente: "Cliente de ejemplo",
  preview: 'Sobre "Ajustar una puerta interior": veo el reembolso de 20 €, pero pagué 22 €. ¿Podéis aclararme los 2 € de diferencia?',
  conversacion_id: "d3000000-0000-4000-8000-000000000004", created_at: FECHA,
}

export function DemoNotificaciones({ ejemploInicial }: { ejemploInicial?: string }) {
  const { idioma } = useIdioma()
  const texto = (es: string, en: string) => idioma === "en" ? en : es
  const [ejemplo, setEjemplo] = useState<Ejemplo>(() => ejemploValido(ejemploInicial))
  const [vistos, setVistos] = useState<string[]>([])
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  const detalle = useRef<HTMLDivElement>(null)
  useEffect(() => { setEjemplo(ejemploValido(ejemploInicial)) }, [ejemploInicial])

  const esSoporte = ejemplo === "soporte"
  const base = esSoporte ? null : AVISOS[ejemplo]
  const aviso = base ? { ...base, leida: vistos.includes(base.id) } : null
  const visto = vistos.includes(esSoporte ? MENSAJE_SOPORTE.id : base!.id)
  const pendientes = aviso && !visto ? [aviso] : []
  const marcar = async (ids: string[]) => { setVistos(actual => [...new Set([...actual, ...ids])]); return true }
  const abrir = () => {
    setDetalleAbierto(true)
    if (esSoporte) void marcar([MENSAJE_SOPORTE.id])
    requestAnimationFrame(() => {
      detalle.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      detalle.current?.focus({ preventScroll: true })
    })
  }
  const cambiar = (valor: Ejemplo) => {
    setEjemplo(valor); setDetalleAbierto(false)
    window.history.replaceState(null, "", `${URL_DEMO}?ejemplo=${valor}`)
  }
  const restablecer = () => { setVistos([]); setDetalleAbierto(false) }

  return <div className="container mx-auto max-w-6xl px-4 py-7 sm:py-10" onClickCapture={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const enlace = event.target instanceof Element ? event.target.closest("a") : null
    if (!enlace) return
    const url = new URL(enlace.href, window.location.href)
    // The production row still runs onAbrir, but a demo click must not start
    // a delayed server navigation that could replace the next chosen example.
    if (url.origin === window.location.origin && url.pathname === URL_DEMO) event.preventDefault()
  }}>
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <Badge variant="outline" className="mb-3 gap-1.5 text-xs font-normal"><CircleHelp className="h-3.5 w-3.5" />{texto("Ejemplos con datos ficticios", "Examples with fictional data")}</Badge>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{texto("Así se ven las notificaciones", "What notifications look like")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{texto("Elige un caso para ver el aviso y el trabajo al que se refiere. Puedes abrirlo, marcarlo como visto y restablecer los ejemplos.", "Choose a case to see the notification and its work item. Open it, mark it as seen and reset the examples.")}</p>
      </div>
      <Button variant="outline" size="sm" className="w-fit shrink-0" onClick={restablecer}><RotateCcw className="mr-2 h-3.5 w-3.5" />{texto("Restablecer ejemplos", "Reset examples")}</Button>
    </div>

    <div role="group" aria-label={texto("Elegir ejemplo", "Choose an example")} className="mb-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {EJEMPLOS.map(({ id, es, en, icono: Icono }) => <Button key={id} variant={ejemplo === id ? "default" : "outline"} aria-pressed={ejemplo === id} className="h-auto min-h-11 justify-start whitespace-normal px-3 py-2.5" onClick={() => cambiar(id)}><Icono className="mr-2 h-4 w-4 shrink-0" />{texto(es, en)}</Button>)}
    </div>

    <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Badge variant="secondary">{esSoporte ? texto("Vista de administración", "Administrator view") : ejemplo === "solicitud" ? texto("Vista del profesional", "Professional view") : texto("Vista del cliente", "Client view")}</Badge>
      <span>{ejemplo === "solicitud" ? texto("Coincide con categoría, zona y presupuesto del profesional.", "Matches the professional’s category, area and budget.") : ejemplo === "actualizacion" ? texto("El aviso identifica el trabajo y el progreso comunicado.", "The notification identifies the job and the progress update.") : ejemplo === "reembolso" ? texto("Cancelación pagada: 20 € al cliente y 2 € de comisión retenida.", "Paid cancellation: €20 refunded and a €2 fee retained.") : texto("El aviso muestra quién escribe y el contenido del mensaje.", "The notification shows who wrote and the message content.")}</span>
    </div>

    <div className="grid items-start gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="min-w-0" aria-labelledby="demo-aviso-titulo">
        <div className="mb-3 flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /><h2 id="demo-aviso-titulo" className="text-sm font-semibold">{texto("En Notificaciones", "In Notifications")}</h2><Badge variant="outline" className="ml-auto text-xs">{visto ? texto("Visto", "Seen") : texto("1 pendiente", "1 pending")}</Badge></div>
        {aviso && <FilaAviso key={aviso.id} aviso={aviso} onMarcar={marcar} onAbrir={abrir} />}
        {esSoporte && !visto && <ContenidoAvisoMensajesPendientes mensajesNoLeidos={1} ultimo={MENSAJE_SOPORTE} enPanelAdmin onAbrir={abrir} enlaceConversacion={`${URL_DEMO}?ejemplo=soporte#demo-detalle`} enlacePendientes={`${URL_DEMO}?ejemplo=soporte#demo-detalle`} />}
        {esSoporte && visto && <div className="rounded-lg border p-5 text-center"><CheckCheck className="mx-auto mb-2 h-6 w-6 text-emerald-600" /><p className="text-sm font-medium">{texto("No hay mensajes pendientes de soporte", "No pending support messages")}</p><p className="mt-1 text-xs text-muted-foreground">{texto("La conversación permanece disponible en Mensajes.", "The conversation remains available in Messages.")}</p></div>}
        <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">{visto ? texto("El pendiente desaparece del contador. El aviso sigue disponible en el historial.", "The pending count decreases. The notification remains in history.") : texto("El contador se mantiene hasta revisar este aviso concreto.", "The count remains until this specific notification is reviewed.")}</p>
      </section>

      <section className="min-w-0" aria-labelledby="demo-tarjeta-titulo">
        <h2 id="demo-tarjeta-titulo" className="mb-3 text-sm font-semibold">{esSoporte ? texto("En la conversación de soporte", "In the support conversation") : ejemplo === "solicitud" ? texto("En Solicitudes de terceros", "In Third-party requests") : texto("En Mis Solicitudes", "In My Requests")}</h2>
        <Card ref={detalle} id="demo-detalle" tabIndex={-1} className={`scroll-mt-24 overflow-hidden outline-none ${!visto ? "ring-2 ring-primary/50 border-primary/40" : ""} ${detalleAbierto ? "focus:ring-2 focus:ring-primary/50" : ""}`}>
          <CardContent className="px-4 sm:px-6">
            {!esSoporte && <AvisosTarjeta avisos={pendientes} onMarcarLeidas={marcar} />}
            {esSoporte ? <>
              <div className="mb-4 flex items-center gap-3 border-b pb-4"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">CE</div><div><h3 className="text-sm font-semibold">{MENSAJE_SOPORTE.remitente}</h3><p className="text-xs text-muted-foreground">{texto("Soporte · Ajustar una puerta interior", "Support · Adjust an interior door")}</p></div></div>
              <div className="max-w-sm rounded-2xl rounded-bl-md border bg-card px-4 py-2.5 shadow-sm"><p className="whitespace-pre-wrap break-words text-sm">{MENSAJE_SOPORTE.preview}</p></div>
              <p className="mt-1 px-1 text-[10px] text-muted-foreground">09:45</p>
              <div className="mt-5 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">{texto("Ejemplo de conversación. No se envía ninguna respuesta desde esta vista.", "Example conversation. This view does not send replies.")}</div>
            </> : <>
              <div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="outline" className="font-normal">{ejemplo === "reembolso" ? texto("Carpintería", "Carpentry") : texto("Pintura", "Painting")}</Badge><Badge variant="secondary">{ejemplo === "solicitud" ? texto("Abierta", "Open") : ejemplo === "actualizacion" ? texto("En progreso", "In progress") : texto("Cancelado", "Cancelled")}</Badge></div>
              <h3 className="text-lg font-semibold leading-snug">{aviso!.tituloEntidad}</h3>
              {ejemplo === "solicitud" && <>
                <p className="mt-2 text-sm text-muted-foreground">{texto("Pintar paredes y techo en blanco. Hay que reparar dos pequeñas grietas antes de empezar.", "Paint the walls and ceiling white. Two small cracks need repairing before starting.")}</p>
                <div className="mt-4 flex flex-wrap items-end justify-between gap-3"><span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />Madrid</span><div className="text-right"><p className="text-xs text-muted-foreground">{texto("Presupuesto", "Budget")}</p><p className="text-lg font-bold text-primary">250 – 400 €</p></div></div>
              </>}
              {ejemplo === "actualizacion" && <div className="mt-5"><div className="mb-2 flex justify-between text-sm"><span className="text-muted-foreground">{texto("Progreso del trabajo", "Work progress")}</span><span className="font-medium">60%</span></div><Progress value={60} /><p className="mt-3 text-xs text-muted-foreground">{texto("Las paredes están preparadas y ya se ha aplicado la primera mano.", "The walls are prepared and the first coat has been applied.")}</p></div>}
              {ejemplo === "reembolso" && <dl className="mt-4 space-y-2 rounded-lg bg-muted/40 p-4 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">{texto("Total pagado", "Total paid")}</dt><dd>22 €</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">{texto("Comisión de Diime conservada", "Diime fee retained")}</dt><dd>2 €</dd></div><div className="flex justify-between gap-3 border-t pt-2 font-semibold"><dt>{texto("Reembolsado al cliente", "Refunded to the client")}</dt><dd className="text-emerald-700 dark:text-emerald-400">20 €</dd></div></dl>}
            </>}
            {visto && !esSoporte && <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5" />{texto("Novedad vista: se retira el resaltado de la tarjeta.", "Update seen: the card highlight is removed.")}</p>}
          </CardContent>
        </Card>
      </section>
    </div>
    <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">{texto("Demostración local con los componentes actuales de Diime. Todos los trabajos, mensajes e importes de esta página son ejemplos ficticios. El estado se restablece al recargar.", "Local demonstration using Diime’s current components. All jobs, messages and amounts on this page are fictional examples. Reloading resets the state.")}</p>
  </div>
}

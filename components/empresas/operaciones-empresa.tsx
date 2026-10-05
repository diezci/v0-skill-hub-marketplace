"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ClipboardList, Loader2, MessageSquare, Search, Users } from "lucide-react"
import { crearConversacionTrabajoEmpresa } from "@/app/actions/messages"
import { actualizarTrabajoEmpresa, reasignarTrabajoEmpresa } from "@/app/actions/empresa-workspace"
import { IncidenciasTrabajoEmpresa } from "@/components/empresas/incidencias-trabajo-empresa"
import { AccionesPagoTrabajoEmpresa } from "@/components/empresas/acciones-pago-trabajo-empresa"
import { useIdioma, useT } from "@/components/idioma-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { localeDe } from "@/lib/i18n"
import type { EspacioEmpresa, OperacionEmpresa } from "@/lib/empresas/types"

const selectClass = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
const TIPOS = { solicitudes: "Solicitudes", ofertas: "Ofertas", trabajos: "Trabajos" } as const
const ESTADOS: Record<string, string> = { pendiente: "Pendiente", abierta: "Abierta", abierta_subasta: "Abierta", aceptada: "Aceptada", rechazada: "Rechazada", cancelada: "Cancelada", cancelado: "Cancelado", completado: "Completado", en_progreso: "En curso", entregado: "Entregado", pendiente_pago: "Pendiente de pago", en_revision: "En revisión", publicada: "Publicada", cerrada: "Cerrada", caducada: "Caducada" }

export function OperacionesEmpresa({ espacio }: { espacio: EspacioEmpresa }) {
  const t = useT()
  const { idioma } = useIdioma()
  const router = useRouter()
  const [tipo, setTipo] = useState<keyof typeof TIPOS>("trabajos")
  const [persona, setPersona] = useState("todas")
  const [busqueda, setBusqueda] = useState("")
  const [asignacion, setAsignacion] = useState<OperacionEmpresa | null>(null)
  const [usuarioId, setUsuarioId] = useState("")
  const [actualizacion, setActualizacion] = useState<OperacionEmpresa | null>(null)
  const [progreso, setProgreso] = useState(0)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [pending, startTransition] = useTransition()
  const operaciones = espacio.operaciones ?? { solicitudes: [], ofertas: [], trabajos: [] }
  const esGestion = espacio.miembroActual?.rol === "principal" || espacio.miembroActual?.rol === "administrador"
  const puedeAsignar = esGestion && !!espacio.miembroActual?.permisos.encargos
  const personas = new Map<string, string>()
  for (const m of espacio.miembros) personas.set(m.usuarioId, m.nombre)
  for (const lista of Object.values(operaciones)) for (const op of lista) {
    if (op.actorUsuarioId) personas.set(op.actorUsuarioId, op.actorNombre)
    if (op.operadorUsuarioId) personas.set(op.operadorUsuarioId, op.operadorNombre || t("Miembro del equipo"))
  }
  const texto = busqueda.trim().toLocaleLowerCase()
  const visibles = operaciones[tipo].filter((op) => (persona === "todas" || op.actorUsuarioId === persona || op.operadorUsuarioId === persona) && (!texto || `${op.titulo} ${op.descripcion} ${op.actorNombre} ${op.operadorNombre || ""}`.toLocaleLowerCase().includes(texto)))
  const candidatos = espacio.miembros.filter((m) => m.estado === "activo" && m.permisos.encargos)
  const fecha = (valor: string) => new Date(valor).toLocaleDateString(localeDe(idioma), { day: "numeric", month: "short", year: "numeric" })

  function reasignar() {
    if (!asignacion || !usuarioId || !asignacion.parte) return
    setError("")
    startTransition(async () => {
      try {
        const result = await reasignarTrabajoEmpresa({ trabajoId: asignacion.trabajoId || asignacion.id, usuarioId, parte: asignacion.parte! })
        if (result.error) { setError(result.error); return }
        setAsignacion(null); setMensaje("Responsable actualizado. La empresa conserva el contrato y su historial."); router.refresh()
      } catch { setError("No se pudo completar la acción. Vuelve a intentarlo.") }
    })
  }

  function abrirConversacion(trabajoId: string) {
    setError("")
    startTransition(async () => {
      try {
        const result = await crearConversacionTrabajoEmpresa(trabajoId)
        if (result.error || !result.data?.id) { setError(result.error || "No se pudo abrir el chat."); return }
        router.push(`/mensajes?c=${encodeURIComponent(result.data.id)}`)
      } catch { setError("No se pudo abrir el chat.") }
    })
  }

  function actualizar(entregar = false) {
    if (!actualizacion) return
    setError("")
    startTransition(async () => {
      try {
        const result = await actualizarTrabajoEmpresa({ trabajoId: actualizacion.trabajoId || actualizacion.id, progreso, entregar })
        if (result.error) { setError(result.error); return }
        setActualizacion(null); setMensaje(entregar ? "Trabajo entregado. Queda pendiente la confirmación del cliente." : "Progreso actualizado."); router.refresh()
      } catch { setError("No se pudo completar la acción. Vuelve a intentarlo.") }
    })
  }

  return <div className="space-y-5">
    <div><h2 className="text-lg font-semibold">{t("Operaciones de la empresa")}</h2><p className="mt-1 text-sm text-muted-foreground">{t(esGestion || espacio.actor.plataformaAdmin ? "Consulta las solicitudes, ofertas y trabajos de todo el equipo." : "Aquí aparecen las operaciones que puedes consultar con tus permisos.")}</p></div>
    <div className="grid gap-3 sm:grid-cols-3">
      {(Object.keys(TIPOS) as Array<keyof typeof TIPOS>).map((clave) => <button key={clave} type="button" aria-pressed={tipo === clave} onClick={() => setTipo(clave)} className={`flex items-center justify-between rounded-xl border p-4 text-left transition-colors ${tipo === clave ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/40"}`}><span className="text-sm font-medium">{t(TIPOS[clave])}</span><span className="text-xl font-semibold">{operaciones[clave].length}</span></button>)}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor="operacion-persona">{t("Persona que actuó o responsable")}</Label><select id="operacion-persona" value={persona} onChange={(e) => setPersona(e.target.value)} className={selectClass}><option value="todas">{t("Todo el equipo")}</option>{Array.from(personas).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}</select></div>
      <div className="space-y-1.5"><Label htmlFor="operacion-busqueda">{t("Buscar operaciones")}</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input id="operacion-busqueda" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-9" placeholder={t("Título, descripción o persona")} /></div></div>
    </div>
    {error && !asignacion && !actualizacion && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    {mensaje && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{t(mensaje)}</p>}
    {visibles.length ? <div className="space-y-3">{visibles.map((op) => <Card key={`${op.id}-${op.parte || tipo}`} className="py-0"><CardContent className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="break-words font-semibold">{op.titulo}</h3><p className="mt-1 text-xs text-muted-foreground">{fecha(op.fecha)}{op.parte && <> · {t(op.parte === "cliente" ? "La empresa contrata" : "La empresa presta el servicio")}</>}</p></div><Badge variant="secondary" className="max-w-full whitespace-normal">{t(ESTADOS[op.estado] || op.estado.replaceAll("_", " "))}</Badge></div>
      {op.descripcion && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{op.descripcion}</p>}
      <dl className="grid gap-3 border-t pt-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">{t("Persona que actuó")}</dt><dd className="mt-1 break-words">{op.actorNombre || t("Sin asignar")}</dd></div>{tipo === "trabajos" && <div><dt className="text-xs text-muted-foreground">{t("Responsable actual")}</dt><dd className="mt-1 break-words">{op.operadorNombre || t("Pendiente de asignar")}</dd></div>}{typeof op.precio === "number" && <div><dt className="text-xs text-muted-foreground">{t("Importe")}</dt><dd className="mt-1 font-medium">{new Intl.NumberFormat(localeDe(idioma), { style: "currency", currency: "EUR" }).format(op.precio)}</dd></div>}</dl>
      {tipo === "trabajos" && typeof op.progreso === "number" && <p className="text-xs text-muted-foreground">{t("Progreso")}: {op.progreso}%</p>}
      {tipo === "trabajos" && op.disputaActual && <div className="space-y-2 rounded-lg border bg-muted/30 p-3"><p className="text-sm font-medium">{t("Disputa")}: {t(op.disputaActual.estado === "en_revision" ? "En revisión" : op.disputaActual.estado === "abierta" ? "Abierta" : op.disputaActual.estado === "resuelta" ? "Resuelta" : op.disputaActual.estado)}</p><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{op.disputaActual.motivo}</p>{op.disputaActual.resolucion && <p className="whitespace-pre-wrap break-words text-sm"><strong>{t("Resolución")}: </strong>{op.disputaActual.resolucion}</p>}</div>}
      {tipo === "trabajos" && op.parte === "cliente" && espacio.miembroActual?.permisos.gestionar_cobros && op.cancelacionEstado !== "pendiente" && typeof op.precio === "number" && (esGestion || op.operadorUsuarioId === espacio.actor.id) && <AccionesPagoTrabajoEmpresa trabajoId={op.trabajoId || op.id} estado={op.estado} precio={op.precio} titulo={op.titulo} onActualizado={() => router.refresh()} />}
      <div className="flex flex-wrap gap-2">{tipo === "trabajos" && espacio.miembroActual?.permisos.mensajes && <Button variant="outline" size="sm" disabled={pending} onClick={() => abrirConversacion(op.trabajoId || op.id)}><MessageSquare className="size-4" />{t("Ver conversación")}</Button>}{tipo === "trabajos" && op.parte === "proveedor" && op.estado === "en_progreso" && op.cancelacionEstado !== "pendiente" && espacio.miembroActual?.permisos.encargos && (esGestion || op.operadorUsuarioId === espacio.actor.id) && <Button variant="outline" size="sm" onClick={() => { setActualizacion(op); setProgreso(op.progreso || 0); setError("") }}>{t("Actualizar trabajo")}</Button>}
      {tipo === "trabajos" && puedeAsignar && op.parte && !["completado", "cancelado", "cancelada"].includes(op.estado) && <Button variant="outline" size="sm" onClick={() => { setAsignacion(op); setUsuarioId(op.operadorUsuarioId || ""); setError("") }}><Users className="size-4" />{t("Cambiar responsable")}</Button>}</div>
      {tipo === "trabajos" && op.parte && <IncidenciasTrabajoEmpresa trabajoId={op.trabajoId || op.id} titulo={op.titulo} estado={op.estado} parte={op.parte} puedeGestionar={!!espacio.miembroActual?.permisos.encargos && (esGestion || op.operadorUsuarioId === espacio.actor.id)} puedeAceptarCancelacion={!!espacio.miembroActual?.permisos.gestionar_cobros} cancelacionEstado={op.cancelacionEstado} cancelacionParteSolicitante={op.cancelacionParteSolicitante} cancelacionRazon={op.cancelacionRazon} />}
    </CardContent></Card>)}</div> : <div className="rounded-xl border border-dashed p-8 text-center"><ClipboardList className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{t("No hay operaciones para estos filtros")}</p><p className="mt-1 text-sm text-muted-foreground">{t("Las operaciones de la empresa aparecerán aquí con la persona que las realiza.")}</p></div>}
    <Dialog open={!!actualizacion} onOpenChange={(open) => { if (!open && !pending) setActualizacion(null) }}><DialogContent><DialogHeader><DialogTitle>{t("Actualizar trabajo")}</DialogTitle><DialogDescription>{actualizacion?.titulo}</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="trabajo-progreso">{t("Progreso")}: {progreso}%</Label><Input id="trabajo-progreso" type="number" min={0} max={100} step={1} value={progreso} disabled={pending} onChange={(e) => setProgreso(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /></div><p className="text-sm text-muted-foreground">{t("Al entregar el trabajo, el cliente podrá revisarlo y confirmar su finalización.")}</p>{error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}</div><DialogFooter className="flex-wrap"><Button variant="outline" disabled={pending} onClick={() => actualizar(false)}>{t("Guardar progreso")}</Button><Button disabled={pending} onClick={() => actualizar(true)}>{pending && <Loader2 className="size-4 animate-spin" />}{t("Entregar trabajo")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!asignacion} onOpenChange={(open) => { if (!open && !pending) setAsignacion(null) }}><DialogContent><DialogHeader><DialogTitle>{t("Cambiar responsable")}</DialogTitle><DialogDescription>{asignacion?.titulo}</DialogDescription></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">{t("La nueva persona continuará la gestión. El contrato, el proveedor y el destino de cobro se conservan.")}</p><div className="space-y-2"><Label htmlFor="responsable-trabajo">{t("Responsable actual")}</Label><select id="responsable-trabajo" className={selectClass} value={usuarioId} disabled={pending} onChange={(e) => setUsuarioId(e.target.value)}><option value="">{t("Seleccionar persona")}</option>{candidatos.map((m) => <option key={m.id} value={m.usuarioId}>{m.nombre}</option>)}</select><p className="text-xs text-muted-foreground">{t("Solo pueden asignarse miembros activos con permiso para gestionar encargos.")}</p></div>{error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}</div><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setAsignacion(null)}>{t("Cancelar")}</Button><Button onClick={reasignar} disabled={pending || !usuarioId || usuarioId === asignacion?.operadorUsuarioId}>{pending && <Loader2 className="size-4 animate-spin" />}{t("Guardar cambios")}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

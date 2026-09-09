"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { BadgeCheck, Building2, ExternalLink, History, Loader2, RefreshCw, Search, UserRound } from "lucide-react"
import {
  obtenerHistorialVerificacionAdmin,
  obtenerSolicitudesVerificacionAdmin,
  revisarVerificacionProfesional,
} from "@/app/actions/verificacion-profesionales"
import { AdminChatUsuarioButton } from "@/components/admin-chat-usuario-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatearFecha } from "@/lib/utils"
import {
  etiquetasVerificacion,
  type EstadoVerificacionProfesional,
  type EventoVerificacionProfesional,
  type VerificacionAdmin,
} from "@/lib/verificacion-profesional"

const coloresEstado: Record<EstadoVerificacionProfesional, string> = {
  pendiente: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  en_revision: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  verificado: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  no_aprobado: "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200",
  retirada: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
}

const decisiones = ["en_revision", "verificado", "no_aprobado", "retirada"] as const
type Decision = (typeof decisiones)[number]

const decisionesPorEstado: Record<EstadoVerificacionProfesional, readonly Decision[]> = {
  pendiente: decisiones,
  en_revision: ["verificado", "no_aprobado", "retirada"],
  verificado: ["retirada"],
  no_aprobado: [],
  retirada: [],
}

const textoDecision: Record<Decision, { accion: string; descripcion: string }> = {
  en_revision: { accion: "Marcar en revisión", descripcion: "La solicitud quedará en revisión por el equipo de Diime." },
  verificado: { accion: "Verificar proveedor", descripcion: "Confirma que el equipo ha contactado con el proveedor y revisado su perfil antes de conceder la insignia «Verificado por Diime». Las licencias y titulaciones requieren una comprobación específica." },
  no_aprobado: { accion: "Solicitar corrección", descripcion: "El proveedor podrá corregir su solicitud y volver a enviarla. No tendrá la insignia de verificación." },
  retirada: { accion: "Retirar verificación", descripcion: "La solicitud quedará cerrada y el proveedor no tendrá la insignia de verificación. Explica el motivo para que sepa cómo proceder." },
}

function EstadoBadge({ estado }: { estado: EstadoVerificacionProfesional }) {
  return <Badge variant="outline" className={coloresEstado[estado]}>{etiquetasVerificacion[estado]}</Badge>
}

function nombreProveedor(solicitud: VerificacionAdmin) {
  return `${solicitud.nombre || ""} ${solicitud.apellido || ""}`.trim() || "Proveedor sin nombre"
}

function normalizarBusqueda(valor: string) {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es")
}

export default function AdminVerificacionesPage() {
  const [solicitudes, setSolicitudes] = useState<VerificacionAdmin[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const [busqueda, setBusqueda] = useState("")
  const [estado, setEstado] = useState("todos")
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null)
  const [historial, setHistorial] = useState<EventoVerificacionProfesional[]>([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [errorHistorial, setErrorHistorial] = useState("")
  const [decision, setDecision] = useState<Decision | null>(null)
  const [comentarioPublico, setComentarioPublico] = useState("")
  const [notaInterna, setNotaInterna] = useState("")
  const [contactoRevisado, setContactoRevisado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorDecision, setErrorDecision] = useState("")
  const [confirmacion, setConfirmacion] = useState("")
  const [revision, setRevision] = useState(0)
  const montado = useRef(true)

  useEffect(() => {
    montado.current = true
    return () => { montado.current = false }
  }, [])

  useEffect(() => {
    let activo = true
    async function cargar() {
      setCargando(true)
      setError("")
      try {
        const resultado = await obtenerSolicitudesVerificacionAdmin()
        if (!activo) return
        if (resultado.error || !resultado.data) {
          setError(resultado.error || "No se pudieron cargar las solicitudes.")
        } else {
          setSolicitudes(resultado.data)
        }
      } catch {
        if (activo) setError("No se pudieron cargar las solicitudes. Inténtalo de nuevo.")
      } finally {
        if (activo) setCargando(false)
      }
    }
    void cargar()
    return () => { activo = false }
  }, [revision])

  useEffect(() => {
    if (!seleccionadaId) return
    let activo = true
    async function cargar() {
      setCargandoHistorial(true)
      setErrorHistorial("")
      setHistorial([])
      try {
        const resultado = await obtenerHistorialVerificacionAdmin(seleccionadaId!)
        if (!activo) return
        if (resultado.error || !resultado.data) {
          setErrorHistorial(resultado.error || "No se pudo cargar el historial.")
        } else {
          setHistorial(resultado.data)
        }
      } catch {
        if (activo) setErrorHistorial("No se pudo cargar el historial. Inténtalo de nuevo.")
      } finally {
        if (activo) setCargandoHistorial(false)
      }
    }
    void cargar()
    return () => { activo = false }
  }, [seleccionadaId, revision])

  const seleccionada = solicitudes.find((solicitud) => solicitud.profesional_id === seleccionadaId)
  const termino = normalizarBusqueda(busqueda.trim())
  const filtradas = solicitudes.filter((solicitud) =>
    (estado === "todos" || solicitud.estado === estado) &&
    (!termino || normalizarBusqueda([
      solicitud.nombre, solicitud.apellido, solicitud.email, solicitud.telefono,
      solicitud.empresa_nombre, solicitud.titulo, solicitud.cargo_empresa,
    ].filter(Boolean).join(" ")).includes(termino)),
  )
  const comentarioObligatorio = decision === "no_aprobado" || decision === "retirada"

  function abrirSolicitud(solicitud: VerificacionAdmin) {
    setDecision(null)
    setErrorDecision("")
    setHistorial([])
    setErrorHistorial("")
    setConfirmacion("")
    setCargandoHistorial(true)
    setSeleccionadaId(solicitud.profesional_id)
  }

  function prepararDecision(nuevaDecision: Decision) {
    setComentarioPublico("")
    setNotaInterna("")
    setContactoRevisado(false)
    setErrorDecision("")
    setDecision(nuevaDecision)
  }

  async function guardarDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!seleccionada || !decision || guardando) return
    if (decision === "verificado" && !contactoRevisado) {
      setErrorDecision("Confirma que has contactado con el proveedor y revisado su perfil.")
      return
    }
    if (comentarioObligatorio && !comentarioPublico.trim()) {
      setErrorDecision("Escribe un comentario para que el proveedor sepa qué debe corregir o por qué se retira la verificación.")
      return
    }
    setGuardando(true)
    setErrorDecision("")
    setConfirmacion("")
    try {
      const resultado = await revisarVerificacionProfesional({
        profesionalId: seleccionada.profesional_id,
        actualizadaAt: seleccionada.actualizada_at,
        estado: decision,
        comentarioPublico: comentarioPublico.trim() || undefined,
        notaInterna: notaInterna.trim() || undefined,
      })
      if (!montado.current) return
      if (resultado.error || !resultado.success) {
        setErrorDecision(resultado.error || "No se pudo guardar la decisión.")
        return
      }
      setConfirmacion(`Decisión guardada para ${nombreProveedor(seleccionada)}: ${etiquetasVerificacion[decision]}.`)
      setDecision(null)
      setRevision((actual) => actual + 1)
    } catch {
      if (montado.current) setErrorDecision("No se pudo confirmar el resultado. Actualiza la bandeja antes de volver a intentarlo.")
    } finally {
      if (montado.current) setGuardando(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
            <BadgeCheck className="h-7 w-7 shrink-0 text-primary" /> Verificaciones
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Revisa solicitudes de particulares y proveedores que trabajan a nombre de una empresa.</p>
        </div>
        <Button variant="outline" disabled={cargando || guardando} onClick={() => setRevision((actual) => actual + 1)} className="gap-2">
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      {confirmacion && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{confirmacion}</p>}
      {error && <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error} <Button variant="link" size="sm" disabled={cargando} onClick={() => setRevision((actual) => actual + 1)}>Reintentar</Button></div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([
          ["pendiente", "Pendientes"],
          ["en_revision", "En revisión"],
          ["verificado", "Verificados"],
        ] as const).map(([valor, etiqueta]) => (
          <Card key={valor}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{etiqueta}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{cargando ? "…" : solicitudes.filter((solicitud) => solicitud.estado === valor).length}</p></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-2">
          <Label htmlFor="buscar-verificacion">Buscar proveedor</Label>
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input id="buscar-verificacion" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Nombre, empresa, email o teléfono" className="pl-9" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="estado-verificacion">Estado</Label>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger id="estado-verificacion" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {Object.entries(etiquetasVerificacion).map(([valor, etiqueta]) => <SelectItem key={valor} value={valor}>{etiqueta}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {cargando && solicitudes.length === 0 ? (
        <div role="status" className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Cargando solicitudes…</div>
      ) : (
        <section aria-label="Solicitudes de verificación" aria-busy={cargando} className="space-y-3">
          <p className="text-sm text-muted-foreground">{filtradas.length} de {solicitudes.length} solicitudes</p>
          {filtradas.length === 0 && !error ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{solicitudes.length === 0 ? "Todavía no hay solicitudes de verificación." : "No hay solicitudes que coincidan con estos filtros."}</CardContent></Card> : null}
          {filtradas.map((solicitud) => (
            <Card key={solicitud.id}>
              <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-semibold">{nombreProveedor(solicitud)}</h2><EstadoBadge estado={solicitud.estado} /></div>
                  {solicitud.titulo && <p className="break-words text-sm">{solicitud.titulo}</p>}
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    {solicitud.empresa_id ? <Building2 className="mt-0.5 h-4 w-4 shrink-0" /> : <UserRound className="mt-0.5 h-4 w-4 shrink-0" />}
                    <span className="min-w-0 break-words">{solicitud.empresa_id ? `Empresa: ${solicitud.empresa_nombre || "Sin nombre disponible"}${solicitud.cargo_empresa ? ` · ${solicitud.cargo_empresa}` : ""}` : "Particular"}</span>
                  </p>
                  <p className="break-all text-sm text-muted-foreground">{solicitud.email || "Sin email disponible"}{solicitud.telefono ? ` · ${solicitud.telefono}` : ""}</p>
                  <p className="text-xs text-muted-foreground">Solicitada: {formatearFecha(solicitud.solicitada_at)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" asChild size="sm"><Link href={`/profesional/${solicitud.profesional_id}`} target="_blank" rel="noopener noreferrer">Perfil<ExternalLink className="ml-1 h-3 w-3" /><span className="sr-only"> de {nombreProveedor(solicitud)} (nueva pestaña)</span></Link></Button>
                  <AdminChatUsuarioButton usuarioId={solicitud.profesional_id} nombre={nombreProveedor(solicitud)} compacto />
                  <Button size="sm" disabled={cargando} onClick={() => abrirSolicitud(solicitud)} aria-label={`Revisar solicitud de ${nombreProveedor(solicitud)}`}>Revisar</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <Dialog open={Boolean(seleccionada)} onOpenChange={(abierto) => { if (!abierto && !guardando) setSeleccionadaId(null) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={!guardando}>
          {seleccionada && (
            <>
              <DialogHeader className="pr-6 text-left">
                <DialogTitle>{decision ? textoDecision[decision].accion : "Revisar solicitud"}</DialogTitle>
                <DialogDescription className="break-words">{nombreProveedor(seleccionada)}{seleccionada.empresa_id ? ` · ${seleccionada.empresa_nombre || "Empresa"}` : " · Particular"}</DialogDescription>
              </DialogHeader>
              {decision ? (
                <form onSubmit={guardarDecision} className="space-y-4">
                  <p className="text-sm">{textoDecision[decision].descripcion}</p>
                  {decision === "verificado" && <div className="flex items-start gap-3 rounded-lg border p-3">
                    <Checkbox id="contacto-revisado-verificacion" checked={contactoRevisado} onCheckedChange={(valor) => setContactoRevisado(valor === true)} disabled={guardando} />
                    <Label htmlFor="contacto-revisado-verificacion" className="leading-relaxed">He contactado con el proveedor y revisado su perfil.</Label>
                  </div>}
                  <div className="space-y-2">
                    <Label htmlFor="comentario-verificacion">Comentario para el proveedor {comentarioObligatorio ? "(obligatorio)" : "(opcional)"}</Label>
                    <Textarea id="comentario-verificacion" value={comentarioPublico} onChange={(event) => setComentarioPublico(event.target.value)} rows={4} maxLength={2000} required={comentarioObligatorio} disabled={guardando} aria-describedby="ayuda-comentario-verificacion" />
                    <p id="ayuda-comentario-verificacion" className="text-xs text-muted-foreground">El proveedor podrá ver este comentario en su solicitud.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nota-verificacion">Nota interna (opcional)</Label>
                    <Textarea id="nota-verificacion" value={notaInterna} onChange={(event) => setNotaInterna(event.target.value)} rows={3} maxLength={4000} disabled={guardando} aria-describedby="ayuda-nota-verificacion" />
                    <p id="ayuda-nota-verificacion" className="text-xs text-muted-foreground">Solo la verá el equipo de administración de Diime.</p>
                  </div>
                  {errorDecision && <div className="space-y-2">
                    <p role="alert" className="text-sm text-destructive">{errorDecision}</p>
                    <Button type="button" variant="outline" size="sm" disabled={guardando} onClick={() => { setDecision(null); setRevision((actual) => actual + 1) }}>Actualizar solicitud</Button>
                  </div>}
                  <DialogFooter>
                    <Button type="button" variant="outline" disabled={guardando} onClick={() => setDecision(null)}>Volver a la solicitud</Button>
                    <Button type="submit" variant={decision === "retirada" ? "destructive" : "default"} disabled={guardando || cargando || Boolean(error) || (decision === "verificado" && !contactoRevisado) || (comentarioObligatorio && !comentarioPublico.trim())}>
                      {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {guardando ? "Guardando…" : "Confirmar decisión"}
                    </Button>
                  </DialogFooter>
                </form>
              ) : (
                <div className="space-y-5">
                  {confirmacion && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{confirmacion}</p>}
                  {error && <p role="alert" className="text-sm text-destructive">{error} Actualiza la bandeja antes de tomar otra decisión.</p>}
                  <div className="flex flex-wrap items-center gap-2"><EstadoBadge estado={seleccionada.estado} /><span className="text-xs text-muted-foreground">Actualizada: {formatearFecha(seleccionada.actualizada_at)}</span></div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-muted-foreground">Email</dt><dd className="break-all">{seleccionada.email || "No disponible"}</dd></div>
                    <div><dt className="text-muted-foreground">Teléfono</dt><dd>{seleccionada.telefono || "No disponible"}</dd></div>
                    <div><dt className="text-muted-foreground">Actividad</dt><dd className="break-words">{seleccionada.titulo || "No indicada"}</dd></div>
                    <div><dt className="text-muted-foreground">Actúa como</dt><dd className="break-words">{seleccionada.empresa_id ? `${seleccionada.empresa_nombre || "Empresa"} · ${seleccionada.cargo_empresa || "Cargo no indicado"}` : "Particular"}</dd></div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm"><Link href={`/profesional/${seleccionada.profesional_id}`} target="_blank" rel="noopener noreferrer">Ver perfil<ExternalLink className="ml-2 h-3 w-3" /><span className="sr-only"> (nueva pestaña)</span></Link></Button>
                    <AdminChatUsuarioButton usuarioId={seleccionada.profesional_id} nombre={nombreProveedor(seleccionada)} compacto />
                  </div>
                  <section className="space-y-2"><h3 className="text-sm font-semibold">Mensaje del proveedor</h3><p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">{seleccionada.mensaje || "Sin mensaje adjunto."}</p></section>
                  {seleccionada.comentario_publico && <section className="space-y-2"><h3 className="text-sm font-semibold">Último comentario para el proveedor</h3><p className="whitespace-pre-wrap break-words text-sm">{seleccionada.comentario_publico}</p></section>}
                  <section className="space-y-3 border-t pt-4">
                    <h3 className="text-sm font-semibold">Decisión de Diime</h3>
                    {decisionesPorEstado[seleccionada.estado].length === 0 && <p className="text-sm text-muted-foreground">Esta solicitud está cerrada. El proveedor debe volver a solicitar la verificación para iniciar una nueva revisión.</p>}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {decisionesPorEstado[seleccionada.estado].map((valor) => (
                        <Button key={valor} variant={valor === "verificado" ? "default" : "outline"} disabled={cargando || Boolean(error)} onClick={() => prepararDecision(valor)}>{textoDecision[valor].accion}</Button>
                      ))}
                    </div>
                  </section>
                  <section className="space-y-3 border-t pt-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> Historial</h3>
                    {cargandoHistorial ? <p role="status" className="text-sm text-muted-foreground">Cargando historial…</p> : errorHistorial ? <div role="alert" className="text-sm text-destructive">{errorHistorial} <Button variant="link" size="sm" onClick={() => setRevision((actual) => actual + 1)}>Reintentar</Button></div> : historial.length === 0 ? <p className="text-sm text-muted-foreground">Sin cambios registrados.</p> : (
                      <ol className="space-y-3">
                        {historial.map((evento) => <li key={evento.id} className="space-y-2 rounded-lg border p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2"><EstadoBadge estado={evento.estado} /><span className="text-xs text-muted-foreground">{formatearFecha(evento.creado_at)}</span></div>
                          {evento.comentario_publico && <div><p className="font-medium">Comentario para el proveedor</p><p className="whitespace-pre-wrap break-words">{evento.comentario_publico}</p></div>}
                          {evento.nota_interna && <div className="rounded bg-muted p-2"><p className="font-medium">Nota interna</p><p className="whitespace-pre-wrap break-words">{evento.nota_interna}</p></div>}
                        </li>)}
                      </ol>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

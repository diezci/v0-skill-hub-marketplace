"use client"

import { useState, useTransition, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Building2, Check, ClipboardList, Copy, Eye, EyeOff, Loader2, MessageSquare, SlidersHorizontal, UserPlus } from "lucide-react"
import { actualizarMiembroEmpresa, cancelarInvitacionEmpresa, invitarMiembroEmpresa, revocarMiembroEmpresa } from "@/app/actions/empresa-workspace"
import { useIdioma, useT } from "@/components/idioma-provider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CobrosEmpresa } from "@/components/empresas/cobros-empresa"
import { PerfilEmpresaEditor } from "@/components/empresas/perfil-empresa-editor"
import { OperacionesEmpresa } from "@/components/empresas/operaciones-empresa"
import { PermisosEmpresaFields } from "@/components/empresas/permisos-empresa"
import { ESTADOS_VERIFICACION_EMPRESA, VerificacionEmpresa } from "@/components/empresas/verificacion-empresa"
import { NOMBRES_ROL_EMPRESA, PERMISOS_EMPRESA, PERMISOS_MIEMBRO, type EspacioEmpresa, type MiembroEmpresa, type PermisosEmpresa, type ResultadoEmpresa, type RolEmpresa } from "@/lib/empresas/types"
import { localeDe } from "@/lib/i18n"

const selectClass = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
const tabClass = "h-auto flex-none shrink-0 rounded-none border-0 border-b-2 border-transparent px-4 py-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:border-primary dark:data-[state=active]:bg-transparent"
const ACCIONES: Record<string, string> = { empresa_creada: "Creó la empresa", perfil_actualizado: "Actualizó el perfil de la empresa", invitacion_creada: "Creó una invitación", invitacion_revocada: "Canceló una invitación", invitacion_aceptada: "Se unió a la empresa", miembro_actualizado: "Actualizó los permisos de un miembro", miembro_revocado: "Dio de baja a un miembro", oferta_creada: "Envió una puja", oferta_actualizada: "Actualizó una puja", solicitud_creada: "Publicó una solicitud", solicitud_actualizada: "Actualizó una solicitud", oferta_aceptada: "Aceptó una oferta", trabajo_creado: "Contrató un trabajo", trabajo_actualizado: "Actualizó un trabajo", trabajo_reasignado: "Cambió el responsable de un trabajo", verificacion_solicitada: "Envió la documentación de representación", verificacion_revisada: "Revisó la acreditación" }

export function EmpresaWorkspaceReal({ espacio }: { espacio: EspacioEmpresa }) {
  const t = useT()
  const { idioma } = useIdioma()
  const router = useRouter()
  const { empresa, miembros, miembroActual, actor } = espacio
  const principal = miembroActual?.rol === "principal"
  const puedeEquipo = !!miembroActual?.permisos.equipo
  const puedePerfil = !!miembroActual?.permisos.perfil
  const puedeVerCobros = !!miembroActual?.permisos.ver_cobros
  const verificada = empresa.estadoVerificacion === "verificada"
  const [editor, setEditor] = useState<MiembroEmpresa | "invitacion" | null>(null)
  const [email, setEmail] = useState("")
  const [cargo, setCargo] = useState("")
  const [rol, setRol] = useState<RolEmpresa>("miembro")
  const [permisos, setPermisos] = useState<PermisosEmpresa>({ ...PERMISOS_MIEMBRO })
  const [perfilPublico, setPerfilPublico] = useState(false)
  const [editorError, setEditorError] = useState("")
  const [enlace, setEnlace] = useState("")
  const [copiado, setCopiado] = useState(false)
  const [baja, setBaja] = useState<MiembroEmpresa | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const activos = miembros.filter((m) => m.estado === "activo")
  const invitaciones = espacio.invitaciones.filter((i) => i.estado === "pendiente" && new Date(i.expiraEn).getTime() > Date.now())
  const fecha = (valor: string) => new Date(valor).toLocaleDateString(localeDe(idioma), { day: "numeric", month: "short", year: "numeric" })

  function ejecuta(action: () => Promise<ResultadoEmpresa<unknown>>, confirmacion: string, completar?: () => void) {
    setError(""); setMensaje("")
    startTransition(async () => {
      try {
        const result = await action()
        if (result.error) { setError(result.error); return }
        setMensaje(confirmacion); completar?.(); router.refresh()
      } catch { setError("No se pudo completar la acción. Vuelve a intentarlo.") }
    })
  }

  function abrir(miembro?: MiembroEmpresa) {
    setEditorError(""); setError(""); setEmail(miembro?.email || ""); setCargo(miembro?.cargo || ""); setRol(miembro?.rol || "miembro")
    const iniciales = { ...(miembro?.permisos || PERMISOS_MIEMBRO) }
    if (!principal && miembroActual) for (const { clave } of PERMISOS_EMPRESA) iniciales[clave] = iniciales[clave] && miembroActual.permisos[clave]
    setPermisos(iniciales); setPerfilPublico(miembro?.perfilPublico ?? false); setEditor(miembro || "invitacion")
  }

  function guardarEquipo(event: FormEvent) {
    event.preventDefault(); setEditorError(""); setMensaje("")
    startTransition(async () => {
      try {
        if (editor === "invitacion") {
          if (rol === "principal") return
          const result = await invitarMiembroEmpresa({ nombre: email.trim(), email: email.trim(), cargo, rol, permisos, perfilPublico })
          if (result.error || !result.data) { setEditorError(result.error || "No se pudo crear la invitación."); return }
          setEnlace(new URL(result.data.url, window.location.origin).href); setCopiado(false)
          setMensaje("Invitación creada. Comparte el enlace con la persona indicada.")
        } else if (editor) {
          const result = await actualizarMiembroEmpresa({ miembroId: editor.id, cargo, rol, permisos, perfilPublico })
          if (result.error) { setEditorError(result.error); return }
          setMensaje("Miembro actualizado.")
        }
        setEditor(null); router.refresh()
      } catch { setEditorError("No se pudieron guardar los cambios. Vuelve a intentarlo.") }
    })
  }

  function puedeEditar(miembro: MiembroEmpresa) {
    if (!puedeEquipo) return false
    if (principal) return true
    return miembro.rol === "miembro" && miembro.usuarioId !== actor.id && PERMISOS_EMPRESA.every(({ clave }) => !miembro.permisos[clave] || !!miembroActual?.permisos[clave])
  }

  return <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:py-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 items-start gap-3"><Avatar className="size-14 shrink-0 rounded-xl"><AvatarImage src={empresa.logoUrl} alt={empresa.nombre} className="object-contain" /><AvatarFallback className="rounded-xl"><Building2 className="size-6" /></AvatarFallback></Avatar><div className="min-w-0"><p className="text-xs text-muted-foreground">{t("Mi empresa")}</p><h1 className="break-words text-2xl font-bold">{empresa.nombre}</h1><div className="mt-2 flex flex-wrap gap-2"><Badge variant="secondary">{t(miembroActual ? NOMBRES_ROL_EMPRESA[miembroActual.rol] : "Administrador de plataforma")}</Badge><Badge variant="outline">{t(ESTADOS_VERIFICACION_EMPRESA[empresa.estadoVerificacion])}</Badge></div></div></div><div className="flex flex-wrap gap-2">{verificada && <Button asChild variant="outline" size="sm"><Link href={`/empresa/${encodeURIComponent(empresa.id)}`}>{t("Ver perfil público")}<ArrowUpRight className="size-4" /></Link></Button>}{miembroActual?.permisos.mensajes && <Button asChild variant="outline" size="sm"><Link href={`/mensajes?empresa=${encodeURIComponent(empresa.id)}`}><MessageSquare className="size-4" />{t("Mensajes")}</Link></Button>}</div></header>
    {error && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{t(error)}</p>}{mensaje && <p role="status" className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">{t(mensaje)}</p>}
    <Tabs defaultValue="perfil" className="min-w-0 space-y-5"><div className="border-b"><TabsList aria-label={t("Gestión de empresa")} className="h-auto w-full flex-wrap justify-start rounded-none bg-transparent p-0"><TabsTrigger value="perfil" className={tabClass}>{t("Perfil")}</TabsTrigger><TabsTrigger value="equipo" className={tabClass}>{t("Equipo")}</TabsTrigger><TabsTrigger value="operaciones" className={tabClass}>{t("Operaciones")}</TabsTrigger><TabsTrigger value="actividad" className={tabClass}>{t("Actividad")}</TabsTrigger>{puedeVerCobros && <TabsTrigger value="cobros" className={tabClass}>{t("Cobros")}</TabsTrigger>}</TabsList></div>
      <TabsContent value="perfil" className="space-y-5"><PerfilEmpresaEditor key={empresa.id} empresa={empresa} puedeEditar={puedePerfil} /><VerificacionEmpresa espacio={espacio} /></TabsContent>
      <TabsContent value="equipo" className="space-y-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-semibold">{t("Equipo")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("Cada persona accede con su cuenta y actúa según los permisos que le concedas.")}</p><p className="mt-2 text-xs text-muted-foreground">{t("No hace falta tener un perfil profesional público para gestionar la empresa.")}</p></div>{puedeEquipo && <Button className="shrink-0" onClick={() => abrir()} disabled={pending}><UserPlus className="size-4" />{t("Invitar miembro")}</Button>}</div>
        {enlace && <Card><CardContent className="space-y-3"><p className="text-sm font-medium">{t("Invitación creada. Comparte el enlace con la persona indicada.")}</p><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label={t("Enlace de invitación")} readOnly value={enlace} onFocus={(e) => e.target.select()} /><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(enlace); setCopiado(true) } catch { setError("No se pudo copiar automáticamente. Selecciona y copia el enlace.") } }}>{copiado ? <Check className="size-4" /> : <Copy className="size-4" />}{t(copiado ? "Copiado" : "Copiar enlace")}</Button></div><p className="text-xs text-muted-foreground">{t("No se ha enviado ningún correo. El enlace es personal, de un solo uso y caduca en 7 días.")}</p></CardContent></Card>}
        <div className="space-y-3">{activos.map((miembro) => <article key={miembro.id} className="rounded-xl border bg-card p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start"><div className="flex min-w-0 flex-1 items-start gap-3"><Avatar className="size-11 shrink-0"><AvatarImage src={miembro.fotoUrl} alt={miembro.nombre} /><AvatarFallback>{miembro.nombre.split(" ").slice(0, 2).map((p) => p[0]).join("")}</AvatarFallback></Avatar><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-semibold">{miembro.nombre}</h3>{miembro.usuarioId === actor.id && <Badge variant="secondary">{t("Tú")}</Badge>}</div>{miembro.email && <p className="mt-1 break-all text-xs text-muted-foreground">{miembro.email}</p>}<p className="mt-1 text-sm">{miembro.cargo || t("Sin cargo indicado")}</p><p className="mt-1 text-xs text-muted-foreground">{t(NOMBRES_ROL_EMPRESA[miembro.rol])}</p></div></div>{puedeEditar(miembro) && <Button variant="outline" size="sm" disabled={pending} onClick={() => abrir(miembro)}><SlidersHorizontal className="size-4" />{t("Gestionar miembro")}</Button>}</div><div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3"><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">{miembro.perfilPublico ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}{t(miembro.perfilPublico ? "Visible en el equipo público" : "Solo visible dentro de la empresa")}</span>{miembro.tienePerfilProfesional && <Link className="text-xs font-medium text-primary hover:underline" href={`/profesional/${encodeURIComponent(miembro.usuarioId)}`}>{t("Ver perfil profesional")}</Link>}</div><div className="mt-3 flex flex-wrap gap-1.5">{PERMISOS_EMPRESA.filter(({ clave }) => miembro.permisos[clave]).map(({ clave, titulo }) => <Badge key={clave} variant="secondary" className="max-w-full whitespace-normal text-xs font-normal">{t(titulo)}</Badge>)}</div></article>)}</div>
        {puedeEquipo && invitaciones.length > 0 && <Card><CardHeader><CardTitle className="text-lg">{t("Invitaciones pendientes")}</CardTitle></CardHeader><CardContent className="space-y-3">{invitaciones.map((invitacion) => <div key={invitacion.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-all text-sm font-medium">{invitacion.email}</p><p className="mt-1 text-xs text-muted-foreground">{invitacion.cargo} · {t(NOMBRES_ROL_EMPRESA[invitacion.rol])}</p><p className="mt-1 text-xs text-muted-foreground">{t("Caduca")}: {fecha(invitacion.expiraEn)}</p></div>{(principal || invitacion.rol === "miembro") && <Button variant="outline" size="sm" disabled={pending} onClick={() => ejecuta(() => cancelarInvitacionEmpresa(invitacion.id), "Invitación cancelada.")}>{t("Cancelar invitación")}</Button>}</div>)}</CardContent></Card>}
        <p className="text-xs leading-relaxed text-muted-foreground">{t("El rol de administrador de la cuenta no acredita la representación legal de la empresa.")}</p>
      </TabsContent>
      <TabsContent value="operaciones"><OperacionesEmpresa espacio={espacio} /></TabsContent>
      <TabsContent value="actividad"><ActividadEmpresaPanel espacio={espacio} /></TabsContent>
      {puedeVerCobros && <TabsContent value="cobros"><CobrosEmpresa key={empresa.id} empresaId={empresa.id} nombreEmpresa={empresa.nombre} puedeVer={puedeVerCobros} esResponsablePrincipal={principal} /></TabsContent>}
    </Tabs>
    <Dialog open={!!editor} onOpenChange={(open) => { if (!open && !pending) setEditor(null) }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{t(editor === "invitacion" ? "Invitar a una persona" : "Gestionar miembro")}</DialogTitle><DialogDescription>{t(editor === "invitacion" ? "La invitación está vinculada a su correo. Podrá aceptarla desde su propia cuenta." : "Define qué puede hacer esta persona en nombre de la empresa.")}</DialogDescription></DialogHeader><form onSubmit={guardarEquipo} className="space-y-4"><fieldset disabled={pending} className="space-y-4"><div className="space-y-2"><Label htmlFor="miembro-email">{t("Correo de su cuenta Diime")}</Label><Input id="miembro-email" type="email" required maxLength={254} value={email} disabled={editor !== "invitacion"} onChange={(e) => setEmail(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="miembro-cargo">{t("Cargo en la empresa")}</Label><Input id="miembro-cargo" required minLength={2} maxLength={120} value={cargo} onChange={(e) => setCargo(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="miembro-rol">{t("Rol en la cuenta")}</Label><select id="miembro-rol" className={selectClass} value={rol} disabled={rol === "principal"} onChange={(e) => setRol(e.target.value as RolEmpresa)}>{rol === "principal" && <option value="principal">{t("Responsable principal")}</option>}<option value="miembro">{t("Miembro del equipo")}</option>{principal && <option value="administrador">{t("Administrador de la cuenta")}</option>}</select></div>{rol !== "principal" && <div className="space-y-2"><p className="text-sm font-medium">{t("Permisos individuales")}</p><PermisosEmpresaFields permisos={permisos} onChange={setPermisos} limites={principal ? undefined : miembroActual?.permisos} /></div>}<label className="flex items-start gap-3 rounded-xl border p-3"><Checkbox className="mt-0.5" checked={perfilPublico} onCheckedChange={(checked) => setPerfilPublico(checked === true)} /><span><span className="block text-sm font-medium">{t("Mostrar en el equipo público")}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{t("Se mostrarán su nombre, cargo y presentación. Su correo y sus permisos seguirán siendo privados.")}</span></span></label><p className="text-xs leading-relaxed text-muted-foreground">{t("El rol de administrador de la cuenta no acredita la representación legal de la empresa.")}</p></fieldset>{editorError && <p role="alert" className="text-sm text-destructive">{t(editorError)}</p>}<DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setEditor(null)}>{t("Cancelar")}</Button><Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />}{t(editor === "invitacion" ? "Crear invitación" : "Guardar cambios")}</Button></DialogFooter>{editor && editor !== "invitacion" && editor.rol !== "principal" && editor.usuarioId !== actor.id && <div className="border-t pt-3"><Button type="button" variant="ghost" className="px-0 text-destructive hover:text-destructive" disabled={pending} onClick={() => { setBaja(editor); setEditor(null); setError("") }}>{t("Revocar acceso a la empresa")}</Button></div>}</form></DialogContent></Dialog>
    <Dialog open={!!baja} onOpenChange={(open) => { if (!open && !pending) setBaja(null) }}><DialogContent><DialogHeader><DialogTitle>{t("Revocar acceso")}: {baja?.nombre}</DialogTitle><DialogDescription>{t("Perderá inmediatamente sus permisos de empresa. Se conservarán sus acciones, los trabajos y las reseñas; los encargos pendientes podrán reasignarse.")}</DialogDescription></DialogHeader>{error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}<DialogFooter><Button variant="outline" disabled={pending} onClick={() => setBaja(null)}>{t("Cancelar")}</Button><Button variant="destructive" disabled={pending} onClick={() => { if (baja) ejecuta(() => revocarMiembroEmpresa(baja.id), "Acceso revocado. El historial de la empresa se conserva.", () => setBaja(null)) }}>{pending && <Loader2 className="size-4 animate-spin" />}{t("Revocar acceso")}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

function ActividadEmpresaPanel({ espacio }: { espacio: EspacioEmpresa }) {
  const t = useT()
  const { idioma } = useIdioma()
  const [persona, setPersona] = useState("todas")
  const [tipo, setTipo] = useState("todos")
  const personas = new Map<string, string>()
  for (const a of espacio.actividad) if (a.actorUsuarioId) personas.set(a.actorUsuarioId, a.actorNombre)
  const tipos = Array.from(new Set(espacio.actividad.map((a) => a.entidadTipo).filter((valor): valor is string => !!valor)))
  const visibles = espacio.actividad.filter((a) => (persona === "todas" || a.actorUsuarioId === persona) && (tipo === "todos" || a.entidadTipo === tipo))
  const TIPOS: Record<string, string> = { empresa: "Empresa", miembro: "Miembros", invitacion: "Invitaciones", solicitud: "Solicitudes", oferta: "Ofertas", trabajo: "Trabajos", verificacion: "Verificación", ofertas: "Ofertas", solicitudes: "Solicitudes", trabajos: "Trabajos", miembros: "Miembros", invitaciones: "Invitaciones" }
  function detalle(valor: unknown): string {
    if (valor === null || valor === undefined) return "—"
    if (typeof valor === "number") return String(valor)
    if (typeof valor === "boolean") return t(valor ? "Sí" : "No")
    if (typeof valor === "string") return t(valor.replaceAll("_", " "))
    if (typeof valor === "object" && "antes" in valor && "despues" in valor) return `${detalle(valor.antes)} → ${detalle(valor.despues)}`
    return ""
  }
  const CAMPOS: Record<string, string> = { estado: "Estado", precio: "Precio", precio_acordado: "Importe acordado", progreso: "Progreso", cancelacion_estado: "Cancelación", fecha_entrega: "Fecha de entrega", cargo: "Cargo", rol: "Rol en la cuenta", perfil_publico: "Visible en el equipo público" }
  return <div className="space-y-5"><div><h2 className="text-lg font-semibold">{t("Actividad de la empresa")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("Las acciones conservan la identidad de la persona que las realizó, aunque deje el equipo.")}</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="actividad-persona">{t("Persona que actuó")}</Label><select id="actividad-persona" className={selectClass} value={persona} onChange={(e) => setPersona(e.target.value)}><option value="todas">{t("Todo el equipo")}</option>{Array.from(personas).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}</select></div><div className="space-y-2"><Label htmlFor="actividad-tipo">{t("Tipo de actividad")}</Label><select id="actividad-tipo" className={selectClass} value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="todos">{t("Todas las actividades")}</option>{tipos.map((valor) => <option key={valor} value={valor}>{t(TIPOS[valor] || valor)}</option>)}</select></div></div>{visibles.length ? <div className="divide-y rounded-xl border bg-card px-4 sm:px-5">{visibles.map((a) => {
    const titulo = a.detalle?.solicitud_titulo || a.detalle?.titulo_solicitud || a.detalle?.titulo
    const campos = Object.entries(a.detalle || {}).filter(([clave, valor]) => CAMPOS[clave] && detalle(valor))
    return <article key={a.id} className="py-4"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm"><span className="font-semibold">{a.actorNombre}</span> · {t(ACCIONES[a.accion] || a.accion)}</p><time dateTime={a.fecha} className="text-xs text-muted-foreground">{new Date(a.fecha).toLocaleString(localeDe(idioma), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>{typeof titulo === "string" && <p className="mt-2 break-words text-sm">{titulo}</p>}{campos.length > 0 && <dl className="mt-2 space-y-1 text-xs text-muted-foreground">{campos.map(([clave, valor]) => <div key={clave} className="flex flex-wrap gap-1"><dt>{t(CAMPOS[clave])}:</dt><dd className="break-words">{detalle(valor)}</dd></div>)}</dl>}</article>
  })}</div> : <div className="rounded-xl border border-dashed p-8 text-center"><ClipboardList className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">{t("No hay actividad para estos filtros.")}</p></div>}</div>
}

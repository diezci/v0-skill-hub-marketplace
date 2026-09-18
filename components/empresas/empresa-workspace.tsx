"use client"

import { useState, useTransition, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Building2, Users, ShieldCheck, Wallet, UserPlus, SlidersHorizontal, Copy, Check, Clock3, FileText, LockKeyhole, ArrowUpRight, Loader2, Mail, ClipboardList, AlertCircle } from "lucide-react"
import { useT, useIdioma } from "@/components/idioma-provider"
import { localeDe } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { guardarPerfilEmpresa, invitarMiembroEmpresa, actualizarMiembroEmpresa, revocarMiembroEmpresa, cancelarInvitacionEmpresa, solicitarVerificacionEmpresa, revisarVerificacionEmpresa } from "@/app/actions/empresa-workspace"
import { PERMISOS_EMPRESA, PERMISOS_MIEMBRO, NOMBRES_ROL_EMPRESA, type EspacioEmpresa, type MiembroEmpresa, type PermisosEmpresa, type RolEmpresa, type ResultadoEmpresa } from "@/lib/empresas/types"
import { CobrosEmpresaLocal } from "@/components/empresas/cobros-empresa-local"

const ESTADOS = { borrador: "Pendiente de acreditar", en_revision: "En revisión", verificada: "Representación verificada", requiere_informacion: "Necesita información" }
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
const tabClass = "min-w-0 rounded-none border-0 border-b-2 border-transparent px-1 py-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:border-primary dark:data-[state=active]:bg-transparent sm:flex-none sm:px-5 sm:text-sm"

function PermissionFields({ permisos, onChange, limites, disabled = false }: { permisos: PermisosEmpresa; onChange: (p: PermisosEmpresa) => void; limites?: PermisosEmpresa; disabled?: boolean }) {
  const t = useT()
  return <div className="divide-y rounded-xl border px-3 sm:px-4">
    {PERMISOS_EMPRESA.map(({ clave, titulo, descripcion }) => <label key={clave} className="flex cursor-pointer items-start gap-3 py-3">
      <Checkbox className="mt-0.5" checked={permisos[clave]} disabled={disabled || (limites && !limites[clave])} onCheckedChange={(checked) => {
        const next = { ...permisos, [clave]: checked === true }
        if (clave === "gestionar_cobros" && checked) next.ver_cobros = true
        if (clave === "ver_cobros" && !checked) next.gestionar_cobros = false
        onChange(next)
      }} />
      <span className="min-w-0"><span className="block text-sm font-medium">{t(titulo)}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{t(descripcion)}</span></span>
    </label>)}
  </div>
}

export function EmpresaWorkspace({ espacio }: { espacio: EspacioEmpresa }) {
  const t = useT()
  const { idioma } = useIdioma()
  const router = useRouter()
  const { empresa, miembroActual, actor, miembros, invitaciones, verificacion } = espacio
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [perfil, setPerfil] = useState({ nombre: empresa.nombre, descripcion: empresa.descripcion, web: empresa.web, ubicacion: empresa.ubicacion, servicios: empresa.servicios.join(", ") })
  const [editor, setEditor] = useState<"invitacion" | MiembroEmpresa | null>(null)
  const [editorError, setEditorError] = useState("")
  const [nombre, setNombre] = useState("")
  const [email, setEmail] = useState("")
  const [rol, setRol] = useState<Exclude<RolEmpresa, "principal">>("miembro")
  const [permisos, setPermisos] = useState<PermisosEmpresa>({ ...PERMISOS_MIEMBRO })
  const [enlace, setEnlace] = useState("")
  const [copiado, setCopiado] = useState(false)
  const [revocar, setRevocar] = useState<MiembroEmpresa | null>(null)
  const [metodo, setMetodo] = useState<"certificado" | "documental">("certificado")
  const [actualizarAcreditacion, setActualizarAcreditacion] = useState(false)
  const [notaRevision, setNotaRevision] = useState("")
  const [tab, setTab] = useState(actor.plataformaAdmin ? "verificacion" : "perfil")
  const esPrincipal = miembroActual?.rol === "principal"
  const verificada = empresa.estadoVerificacion === "verificada"
  const puedePerfil = !!miembroActual?.permisos.perfil
  const puedeEquipo = !!miembroActual?.permisos.equipo
  const activos = miembros.filter((m) => m.estado === "activo")
  const pendientes = invitaciones.filter((i) => i.estado === "pendiente")
  const fecha = (value: string) => new Date(value).toLocaleDateString(localeDe(idioma), { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" })

  function ejecutar(action: () => Promise<ResultadoEmpresa<unknown>>, mensaje: string, completar?: () => void) {
    setError(""); setSuccess("")
    startTransition(async () => {
      try {
        const result = await action()
        if (result.error) { setError(result.error); return }
        setSuccess(mensaje); completar?.(); router.refresh()
      } catch { setError(t("No se pudo completar la acción. Vuelve a intentarlo.")) }
    })
  }
  function abrirEditor(miembro?: MiembroEmpresa) {
    setEditorError(""); setNombre(miembro?.nombre || "Elena Torres"); setEmail(miembro?.email || "elena@empresa.example")
    setRol(miembro?.rol === "administrador" ? "administrador" : "miembro")
    setPermisos({ ...(miembro?.permisos || PERMISOS_MIEMBRO) }); setEditor(miembro || "invitacion")
  }
  function guardarEquipo(event: FormEvent) {
    event.preventDefault(); setEditorError(""); setError(""); setSuccess("")
    startTransition(async () => {
      try {
        if (editor === "invitacion") {
          const result = await invitarMiembroEmpresa({ nombre, email, rol, permisos })
          if (result.error || !result.data) { setEditorError(result.error || t("No se pudo crear la invitación.")); return }
          setEnlace(new URL(result.data.url, window.location.origin).href); setCopiado(false)
          setSuccess(t("Invitación creada. Comparte el enlace con la persona indicada."))
        } else if (editor) {
          const result = await actualizarMiembroEmpresa({ miembroId: editor.id, rol, permisos })
          if (result.error) { setEditorError(result.error); return }
          setSuccess(t("Permisos actualizados."))
        }
        setEditor(null); router.refresh()
      } catch { setEditorError(t("No se pudieron guardar los cambios. Vuelve a intentarlo.")) }
    })
  }
  async function copiarEnlace() {
    try { await navigator.clipboard.writeText(enlace); setCopiado(true) }
    catch { setError(t("No se pudo copiar automáticamente. Selecciona y copia el enlace.")) }
  }
  function guardarAcreditacion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const datos = new FormData(form)
    const archivo = datos.get("documento")
    if (!(archivo instanceof File) || !archivo.size || archivo.size > 5 * 1024 * 1024 || !archivo.name.toLowerCase().endsWith(".pdf")) {
      setError(t("Adjunta un documento PDF de hasta 5 MB.")); return
    }
    ejecutar(() => solicitarVerificacionEmpresa(datos), t("Documentación recibida y pendiente de revisión por Diime."), () => { form.reset(); setActualizarAcreditacion(false) })
  }

  return <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight">{t("Mi empresa")}</h1>
        <p className="mt-2 break-words text-muted-foreground">{empresa.nombre}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />{t(ESTADOS[empresa.estadoVerificacion])}</span>
          <span>{t(actor.plataformaAdmin ? "Revisor de Diime" : miembroActual ? NOMBRES_ROL_EMPRESA[miembroActual.rol] : "Sin acceso de miembro")}</span>
        </div>
      </div>
      <Button asChild variant="outline" size="sm" className="w-fit shrink-0"><Link href={`/empresa/${empresa.slug}`}>{t("Ver perfil público")}<ArrowUpRight className="ml-2 h-4 w-4" /></Link></Button>
    </header>

    {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{t(error)}</div>}
    {success && <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-emerald-800 dark:text-emerald-300"><Check className="mt-0.5 h-4 w-4 shrink-0" />{success}</div>}

    <Tabs value={tab} onValueChange={setTab} className="gap-6">
      <TabsList aria-label={t("Gestión de empresa")} className="grid h-auto w-full grid-cols-[1fr_1fr_1.4fr_1fr] justify-start rounded-none border-b bg-transparent p-0 sm:flex">
        <TabsTrigger value="perfil" className={tabClass}><Building2 className="hidden h-4 w-4 sm:block" />{t("Perfil")}</TabsTrigger>
        <TabsTrigger value="equipo" className={tabClass}><Users className="hidden h-4 w-4 sm:block" />{t("Equipo")}</TabsTrigger>
        <TabsTrigger value="verificacion" className={tabClass}><ShieldCheck className="hidden h-4 w-4 sm:block" />{t("Verificación")}</TabsTrigger>
        <TabsTrigger value="cobros" className={tabClass}><Wallet className="hidden h-4 w-4 sm:block" />{t("Cobros")}</TabsTrigger>
      </TabsList>

      <TabsContent value="perfil" className="space-y-6">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card><CardHeader><CardTitle className="text-lg">{t("Perfil de empresa")}</CardTitle><CardDescription>{t("Información que aparece en vuestro perfil público.")}</CardDescription></CardHeader>
            <CardContent><form onSubmit={(e) => { e.preventDefault(); ejecutar(() => guardarPerfilEmpresa({ ...perfil, servicios: perfil.servicios.split(",").map((s) => s.trim()).filter(Boolean) }), t("Perfil guardado. Los cambios ya aparecen en el perfil público.")) }} className="space-y-5">
              <fieldset disabled={!puedePerfil || pending} className="space-y-5">
                <div className="space-y-2"><Label htmlFor="empresa-nombre-publico">{t("Nombre comercial")}</Label><Input id="empresa-nombre-publico" required maxLength={100} value={perfil.nombre} onChange={(e) => setPerfil({ ...perfil, nombre: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="empresa-descripcion">{t("A qué se dedica la empresa")}</Label><Textarea id="empresa-descripcion" required minLength={30} maxLength={1500} rows={5} className="min-h-32" value={perfil.descripcion} onChange={(e) => setPerfil({ ...perfil, descripcion: e.target.value })} /><p className="text-xs text-muted-foreground">{t("Explica vuestra actividad, experiencia y forma de trabajar.")}</p></div>
                <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="empresa-web">{t("Web corporativa")}</Label><Input id="empresa-web" type="url" maxLength={300} placeholder="https://" value={perfil.web} onChange={(e) => setPerfil({ ...perfil, web: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="empresa-ubicacion">{t("Zona de trabajo")}</Label><Input id="empresa-ubicacion" required maxLength={120} value={perfil.ubicacion} onChange={(e) => setPerfil({ ...perfil, ubicacion: e.target.value })} /></div></div>
                <div className="space-y-2"><Label htmlFor="empresa-servicios">{t("Servicios")}</Label><Input id="empresa-servicios" required value={perfil.servicios} onChange={(e) => setPerfil({ ...perfil, servicios: e.target.value })} /><p className="text-xs text-muted-foreground">{t("Separa cada servicio con una coma.")}</p></div>
              </fieldset>
              {puedePerfil ? <Button disabled={pending} type="submit">{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("Guardar cambios")}</Button> : <p className="flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole className="h-4 w-4" />{t("Tu rol permite consultar este perfil, pero no editarlo.")}</p>}
            </form></CardContent>
          </Card>
          <aside>
            <Card><CardHeader><CardTitle className="text-lg">{t("Datos de la empresa")}</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div><p className="text-xs text-muted-foreground">{t("Razón social")}</p><p className="mt-1 break-words">{empresa.razonSocial}</p></div>{empresa.nif && <div><p className="text-xs text-muted-foreground">NIF</p><p className="mt-1">{empresa.nif}</p></div>}<p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">{t("Los cambios en la identidad legal requieren una nueva revisión.")}</p><Button variant="outline" size="sm" className="w-full" onClick={() => setTab("verificacion")}>{t("Ver acreditación")}</Button></CardContent></Card>
          </aside>
        </div>
        {(miembroActual?.permisos.mensajes || miembroActual?.permisos.encargos) && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5" />{t("Solicitudes de la empresa")}</CardTitle><CardDescription>{t("El cliente contrata a la empresa. La persona que lo atiende queda identificada.")}</CardDescription></CardHeader><CardContent>{espacio.solicitudes.length ? <div className="space-y-3">{espacio.solicitudes.map((s) => <article key={s.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{s.titulo}</h3><Badge variant="secondary">{t("Recibida")}</Badge></div><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{s.descripcion}</p><p className="mt-3 text-xs text-muted-foreground">{s.clienteNombre} · {fecha(s.creadaEn)}</p><p className="mt-1 text-xs">{t("Proveedor")}: {s.empresaRazonSocial} · {t("Responsable")}: {miembros.find((m) => m.usuarioId === s.responsableUsuarioId)?.nombre || t("Pendiente de asignar")}</p></article>)}</div> : <div className="rounded-xl border border-dashed px-5 py-7 text-center"><Mail className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{t("Todavía no hay solicitudes")}</p><p className="mt-1 text-sm text-muted-foreground">{t("Las solicitudes del perfil público aparecerán aquí.")}</p></div>}</CardContent></Card>}
      </TabsContent>

      <TabsContent value="equipo" className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h2 className="text-lg font-semibold">{t("Equipo")}</h2><p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{puedeEquipo || actor.plataformaAdmin ? <>{activos.length} {t("miembros activos")}{pendientes.length > 0 && <> · {pendientes.length} {t("invitaciones pendientes")}</>}</> : t("Tu acceso a la empresa está activo.")}</p><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("Cada persona accede con su cuenta y actúa según los permisos que le concedas.")}</p></div>{puedeEquipo && <Button disabled={!verificada || pending} onClick={() => abrirEditor()} className="shrink-0"><UserPlus className="mr-2 h-4 w-4" />{t("Invitar miembro")}</Button>}</div>
        {!verificada && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><p className="font-medium">{t("Verifica la representación para ampliar el equipo")}</p><p className="mt-1 text-muted-foreground">{t("Las nuevas invitaciones estarán disponibles cuando Diime apruebe la documentación.")}</p><Button variant="link" className="mt-1 h-auto p-0" onClick={() => setTab("verificacion")}>{t("Ir a verificación")}</Button></div>}
        {enlace && <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4"><div><p className="font-medium">{t("Invitación lista para compartir")}</p><p className="mt-1 text-sm text-muted-foreground">{t("Dirigida a")}: <span className="break-all font-medium">{email}</span>. {t("Solo esa cuenta podrá aceptarla. No se ha enviado ningún correo.")}</p></div><div className="flex min-w-0 gap-2"><Input aria-label={t("Enlace de invitación")} readOnly value={enlace} className="min-w-0 bg-background text-xs" onFocus={(e) => e.currentTarget.select()} /><Button variant="outline" size="icon" title={t("Copiar enlace")} aria-label={t("Copiar enlace")} onClick={copiarEnlace}>{copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button></div><Link className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4" href={enlace}>{t("Abrir invitación")}<ArrowUpRight className="h-3.5 w-3.5" /></Link></div>}
        <div className="space-y-3">{activos.map((miembro) => {
          const editable = puedeEquipo && miembro.rol !== "principal" && miembro.usuarioId !== actor.id && (esPrincipal || miembro.rol === "miembro")
          return <article key={miembro.id} className="rounded-xl border bg-card p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{miembro.nombre.split(" ").map((n) => n[0]).slice(0, 2).join("")}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{miembro.nombre}</h3>{miembro.usuarioId === actor.id && <Badge variant="secondary">{t("Tú")}</Badge>}</div><p className="mt-0.5 break-all text-sm text-muted-foreground">{miembro.email}</p><p className="mt-2 text-xs font-medium">{t(NOMBRES_ROL_EMPRESA[miembro.rol])}</p></div></div>{editable ? <Button variant="outline" size="sm" disabled={pending} onClick={() => abrirEditor(miembro)}><SlidersHorizontal className="mr-2 h-3.5 w-3.5" />{t("Gestionar permisos")}</Button> : miembro.rol === "principal" ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5" />{t("Cuenta principal protegida")}</span> : null}</div><div className="mt-4 flex flex-wrap gap-1.5 border-t pt-3">{PERMISOS_EMPRESA.filter((p) => miembro.permisos[p.clave]).map((p) => <span key={p.clave} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{t(p.titulo)}</span>)}</div></article>
        })}</div>
        {pendientes.length > 0 && <Card><CardHeader><CardTitle className="text-lg">{t("Invitaciones pendientes")}</CardTitle><CardDescription>{t("Cada enlace caduca y solo puede aceptarse una vez.")}</CardDescription></CardHeader><CardContent className="space-y-3">{pendientes.map((invitacion) => <div key={invitacion.id} className="flex flex-col justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"><div className="min-w-0"><p className="font-medium">{invitacion.nombre}</p><p className="break-all text-sm text-muted-foreground">{invitacion.email}</p><p className="mt-1 text-xs text-muted-foreground">{t(NOMBRES_ROL_EMPRESA[invitacion.rol])} · {t("Caduca")}: {fecha(invitacion.expiraEn)}</p></div>{puedeEquipo && <Button variant="outline" size="sm" disabled={pending} onClick={() => ejecutar(() => cancelarInvitacionEmpresa(invitacion.id), t("Invitación cancelada. El enlace ya no permite unirse."))}>{t("Cancelar invitación")}</Button>}</div>)}</CardContent></Card>}
        <div className="grid gap-5 md:grid-cols-2"><div className="rounded-xl border p-5"><h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />{t("Accesos personales y revocables")}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("Al revocar a un miembro pierde el acceso de empresa. Sus acciones y los trabajos realizados se conservan en el historial.")}</p><p className="mt-3 text-xs text-muted-foreground">{t("Los permisos económicos se guardan para el diseño de roles. Esta versión local no permite realizar cobros ni cambiar cuentas bancarias.")}</p></div><div className="rounded-xl border p-5"><h3 className="text-sm font-semibold">{t("Actividad reciente")}</h3><div className="mt-3 space-y-3">{espacio.actividad.slice(0, 4).map((a) => <div key={a.id} className="border-l-2 border-primary/20 pl-3"><p className="text-xs leading-relaxed"><span className="font-medium">{a.actorNombre}</span> · {t(a.accion)}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{fecha(a.fecha)}</p></div>)}{!espacio.actividad.length && <p className="text-sm text-muted-foreground">{t("Aquí quedarán registradas las acciones del equipo.")}</p>}</div></div></div>
      </TabsContent>

      <TabsContent value="verificacion" className="space-y-6">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            <Card><CardHeader><CardTitle className="text-lg">{t("Representación de la empresa")}</CardTitle><CardDescription>{t("Acreditación del representante y autorización para gestionar la cuenta.")}</CardDescription></CardHeader><CardContent className="space-y-5"><div className="rounded-lg border bg-muted/30 p-4"><p className="flex items-center gap-2 text-sm font-semibold">{verificada ? <ShieldCheck className="h-4 w-4 text-primary" /> : <Clock3 className="h-4 w-4 text-muted-foreground" />}{t(ESTADOS[empresa.estadoVerificacion])}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(verificada ? verificacion ? "Solicitud aprobada en el entorno local. El equipo puede actuar dentro de sus permisos." : "Estado verificado de ejemplo, con datos ficticios. Puedes probar una nueva acreditación y su revisión." : empresa.estadoVerificacion === "en_revision" ? "La solicitud está en la cola de revisión de Diime. No es posible sustituirla mientras se revisa." : "Presenta una autorización y la documentación que acredita las facultades del representante.")}</p>{verificacion?.notaRevision && <p className="mt-3 rounded-lg bg-background p-3 text-sm"><span className="font-medium">{t("Observación de Diime")}: </span>{verificacion.notaRevision}</p>}</div>
              <div className="grid gap-4 sm:grid-cols-2">{miembros.some((m) => m.rol === "principal") && <div><p className="text-xs text-muted-foreground">{t("Responsable de la cuenta Diime")}</p><p className="mt-1 text-sm font-medium">{miembros.find((m) => m.rol === "principal")?.nombre || t("Sin asignar")}</p></div>}{(esPrincipal || actor.plataformaAdmin) && <div><p className="text-xs text-muted-foreground">{t("Representante legal acreditado")}</p><p className="mt-1 text-sm font-medium">{verificada ? empresa.representanteNombre || t("Pendiente") : t("Pendiente de acreditación")}</p>{verificada && <p className="mt-0.5 text-xs text-muted-foreground">{empresa.cargoLegal}</p>}</div>}</div>
              {verificacion && <div className="flex items-start gap-3 rounded-lg border p-3"><FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="break-all text-sm font-medium">{verificacion.documentoNombre}</p><p className="mt-1 text-xs text-muted-foreground">{t("Presentado el")} {fecha(verificacion.creadaEn)} · {t("Acceso restringido")}</p>{(esPrincipal || actor.plataformaAdmin) && <a href="/api/local/empresas/documento" className="mt-2 inline-flex text-xs font-medium text-primary underline underline-offset-4">{t("Descargar documento para revisión")}</a>}</div></div>}
              {verificada && esPrincipal && !actualizarAcreditacion && <Button variant="outline" onClick={() => setActualizarAcreditacion(true)}>{t("Actualizar acreditación")}</Button>}
            </CardContent></Card>

            {esPrincipal && empresa.estadoVerificacion !== "en_revision" && (!verificada || actualizarAcreditacion) && <Card><CardHeader><CardTitle className="text-lg">{t("Documentación de representación")}</CardTitle><CardDescription>{t("Adjunta una autorización para la cuenta principal y la acreditación del representante en un único PDF.")}</CardDescription></CardHeader><CardContent><form onSubmit={guardarAcreditacion} className="space-y-5"><fieldset disabled={pending} className="space-y-5"><div className="space-y-2"><Label htmlFor="verificacion-metodo">{t("Método de acreditación")}</Label><select id="verificacion-metodo" name="metodo" className={selectClass} value={metodo} onChange={(e) => setMetodo(e.target.value as typeof metodo)}><option value="certificado">{t("Documento firmado con certificado de representante")}</option><option value="documental">{t("Revisión de identidad, poderes y autorización")}</option></select><p className="text-xs leading-relaxed text-muted-foreground">{t(metodo === "certificado" ? "Entrega el PDF firmado. No adjuntes tu certificado privado ni su contraseña." : "Incluye la autorización firmada y la documentación que permite comprobar la identidad y las facultades vigentes.")}</p></div><div className="space-y-2"><Label htmlFor="representante-nombre">{t("Nombre del representante legal")}</Label><Input id="representante-nombre" name="representanteNombre" required maxLength={100} defaultValue={empresa.representanteNombre} /></div><div className="space-y-2"><Label htmlFor="representante-cargo">{t("Cargo o facultades de representación")}</Label><Input id="representante-cargo" name="cargoLegal" required maxLength={100} defaultValue={empresa.cargoLegal} placeholder={t("Administrador único, apoderado…")} /></div><div className="space-y-2"><Label htmlFor="representante-documento">{t("Autorización y acreditación")}</Label><Input className="h-auto min-h-10 py-2 text-xs file:mr-2" id="representante-documento" name="documento" type="file" accept="application/pdf,.pdf" required /><p className="text-xs text-muted-foreground">{t("PDF de hasta 5 MB. Solo visible para el proceso de revisión.")}</p></div><label className="flex items-start gap-3 rounded-lg bg-muted/50 p-3 text-sm leading-relaxed"><input className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]" type="checkbox" name="consentimiento" value="true" required /><span>{t("Confirmo que tengo autorización para aportar esta documentación y solicitar la gestión de la empresa en Diime.")}</span></label></fieldset><div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("Enviar a revisión")}</Button>{actualizarAcreditacion && <Button type="button" variant="ghost" onClick={() => setActualizarAcreditacion(false)}>{t("Cancelar")}</Button>}</div></form></CardContent></Card>}

            {actor.plataformaAdmin && verificacion?.estado === "en_revision" && <Card className="border-primary/30"><CardHeader><Badge className="mb-2" variant="secondary">{t("Revisión de Diime")}</Badge><CardTitle className="text-lg">{t("Resolver acreditación")}</CardTitle><CardDescription>{t("Solo el administrador de plataforma puede resolver esta solicitud. La decisión y su autor quedan registrados.")}</CardDescription></CardHeader><CardContent className="space-y-4"><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">{t("Solicitante")}</dt><dd className="mt-1 font-medium">{verificacion.representanteNombre}</dd></div><div><dt className="text-muted-foreground">{t("Cargo declarado")}</dt><dd className="mt-1 font-medium">{verificacion.cargoLegal}</dd></div></dl><p className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">{t("En esta instalación local puedes recorrer la decisión con documentos de prueba. No se valida criptográficamente la firma ni se consulta el Registro Mercantil.")}</p><div className="space-y-2"><Label htmlFor="nota-revision">{t("Nota de revisión")}</Label><Textarea id="nota-revision" value={notaRevision} onChange={(e) => setNotaRevision(e.target.value)} placeholder={t("Explica las comprobaciones o qué documentación falta.")} /></div><div className="flex flex-col gap-3 sm:flex-row"><Button disabled={pending || !notaRevision.trim()} onClick={() => ejecutar(() => revisarVerificacionEmpresa({ decision: "verificada", nota: notaRevision }), t("Solicitud aprobada. El estado de la empresa se ha actualizado."))}>{t("Aprobar en local")}</Button><Button disabled={pending || !notaRevision.trim()} variant="outline" onClick={() => ejecutar(() => revisarVerificacionEmpresa({ decision: "requiere_informacion", nota: notaRevision }), t("Información adicional solicitada. El responsable puede volver a presentar la documentación."))}>{t("Pedir información")}</Button></div></CardContent></Card>}
          </div>
          <aside className="rounded-xl border bg-card p-5"><h2 className="text-base font-semibold">{t("Cómo funciona")}</h2><ol className="mt-5 space-y-6">{[{ title: "Identificar la empresa", detail: "Razón social y NIF vinculados a una única cuenta de empresa." }, { title: "Acreditar la representación", detail: "Autorización firmada e identidad y facultades comprobables." }, { title: "Revisión de Diime", detail: "El equipo revisa la documentación antes de habilitar la representación." }, { title: "Delegar con control", detail: "El responsable principal invita al equipo y concede permisos individuales." }].map((paso, i) => <li key={paso.title} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span><div><p className="text-sm font-medium">{t(paso.title)}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(paso.detail)}</p></div></li>)}</ol><div className="mt-6 border-t pt-4"><p className="text-xs leading-relaxed text-muted-foreground">{t("La verificación acredita identidad y representación. La calidad del servicio se refleja en las reseñas de los clientes.")}</p></div></aside>
        </div>
      </TabsContent>
      <TabsContent value="cobros">
        <CobrosEmpresaLocal espacio={espacio} />
      </TabsContent>
    </Tabs>

    <Dialog open={!!editor} onOpenChange={(open) => { if (!open && !pending) setEditor(null) }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{t(editor === "invitacion" ? "Invitar a una persona" : "Gestionar permisos")}</DialogTitle><DialogDescription>{t(editor === "invitacion" ? "La invitación está vinculada a su correo. Podrá aceptarla desde su propia cuenta." : "Define qué puede hacer esta persona en nombre de la empresa.")}</DialogDescription></DialogHeader><form onSubmit={guardarEquipo} className="space-y-4"><fieldset disabled={pending} className="space-y-4"><div className="space-y-2"><Label htmlFor="miembro-nombre">{t("Nombre")}</Label><Input id="miembro-nombre" required maxLength={100} value={nombre} disabled={editor !== "invitacion"} onChange={(e) => setNombre(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="miembro-email">{t("Correo de su cuenta Diime")}</Label><Input id="miembro-email" type="email" required maxLength={254} value={email} disabled={editor !== "invitacion"} onChange={(e) => setEmail(e.target.value)} />{editor === "invitacion" && <p className="text-xs text-muted-foreground">{t("En esta prueba local utiliza elena@empresa.example y luego cambia a la cuenta Invitada para aceptar.")}</p>}</div><div className="space-y-2"><Label htmlFor="miembro-rol">{t("Rol en la cuenta")}</Label><select className={selectClass} id="miembro-rol" value={rol} onChange={(e) => setRol(e.target.value as typeof rol)}><option value="miembro">{t("Miembro del equipo")}</option>{esPrincipal && <option value="administrador">{t("Administrador de la cuenta")}</option>}</select></div><div><p className="mb-2 text-sm font-medium">{t("Permisos individuales")}</p><PermissionFields permisos={permisos} onChange={setPermisos} limites={miembroActual?.permisos} /></div><p className="text-xs leading-relaxed text-muted-foreground">{t("El rol de administrador de la cuenta no acredita la representación legal de la empresa.")}</p></fieldset>{editorError && <p role="alert" className="text-sm text-destructive">{t(editorError)}</p>}<DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setEditor(null)}>{t("Cancelar")}</Button><Button type="submit" disabled={pending}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t(editor === "invitacion" ? "Crear invitación" : "Guardar permisos")}</Button></DialogFooter>{editor && editor !== "invitacion" && <div className="border-t pt-3"><Button type="button" variant="ghost" className="h-auto px-0 text-destructive hover:text-destructive" disabled={pending} onClick={() => { setError(""); setRevocar(editor); setEditor(null) }}>{t("Revocar acceso a la empresa")}</Button></div>}</form></DialogContent></Dialog>
    <AlertDialog open={!!revocar} onOpenChange={(open) => { if (!open && !pending) setRevocar(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("Revocar acceso")}: {revocar?.nombre}</AlertDialogTitle><AlertDialogDescription>{t("Perderá inmediatamente sus permisos de empresa. Se conservarán sus acciones, los trabajos y las reseñas; los encargos pendientes podrán reasignarse.")}</AlertDialogDescription></AlertDialogHeader>{error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}<AlertDialogFooter><AlertDialogCancel disabled={pending}>{t("Cancelar")}</AlertDialogCancel><Button variant="destructive" disabled={pending} onClick={() => { if (revocar) ejecutar(() => revocarMiembroEmpresa(revocar.id), t("Acceso revocado. El historial de la empresa se conserva."), () => setRevocar(null)) }}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("Revocar acceso")}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}

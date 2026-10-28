"use client"

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Building2, ChevronDown, Globe2, ImagePlus, Loader2, MapPin, Save, Upload, Wrench, X } from "lucide-react"
import { guardarPerfilEmpresa } from "@/app/actions/empresa-workspace"
import { useT } from "@/components/idioma-provider"
import { SelectorCategorias, SelectorProvincias } from "@/components/selector-cobertura"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import type { EmpresaFicha } from "@/lib/empresas/types"
import { CATEGORIAS_SERVICIO_NOMBRES } from "@/lib/categorias"
import { PROVINCIAS_ES } from "@/lib/provincias"

const LOGO_MAX_BYTES = 3 * 1024 * 1024
const LOGO_TIPOS = ["image/png", "image/jpeg", "image/webp"]
const selectorClass = "max-h-[min(70dvh,var(--radix-popover-content-available-height))] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto"

export function PerfilEmpresaEditor({ empresa, puedeEditar, onGuardar = guardarPerfilEmpresa }: { empresa: EmpresaFicha; puedeEditar: boolean; onGuardar?: typeof guardarPerfilEmpresa }) {
  const t = useT()
  const router = useRouter()
  const [perfil, setPerfil] = useState(() => ({ nombre: empresa.nombre, descripcion: empresa.descripcion, web: empresa.web, provincias: (empresa.provincias || []).filter((p) => PROVINCIAS_ES.includes(p)), servicios: empresa.servicios.filter((s) => CATEGORIAS_SERVICIO_NOMBRES.includes(s)), logoUrl: empresa.logoUrl || "" }))
  const serviciosAnteriores = empresa.servicios.filter((s) => !CATEGORIAS_SERVICIO_NOMBRES.includes(s))
  const [serviciosRevisados, setServiciosRevisados] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vistaLogo, setVistaLogo] = useState(empresa.logoUrl || "")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [provinciasAbiertas, setProvinciasAbiertas] = useState(false)
  const [serviciosAbiertos, setServiciosAbiertos] = useState(false)
  const inputLogo = useRef<HTMLInputElement>(null)
  const logoTemporal = useRef<string | null>(null)
  const guardadoEnCurso = useRef(false)
  const bloqueado = guardando || !puedeEditar

  useEffect(() => () => { if (logoTemporal.current) URL.revokeObjectURL(logoTemporal.current) }, [])

  function cambiarVistaLogo(url: string, temporal = false) {
    if (logoTemporal.current) URL.revokeObjectURL(logoTemporal.current)
    logoTemporal.current = temporal ? url : null
    setVistaLogo(url)
  }

  function elegirLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || bloqueado) return
    setMensaje("")
    if (!LOGO_TIPOS.includes(file.type)) { setError("Elige una imagen PNG, JPG o WebP."); return }
    if (!file.size || file.size > LOGO_MAX_BYTES) { setError("El logotipo debe ocupar como máximo 3 MB."); return }
    setError("")
    setArchivo(file)
    cambiarVistaLogo(URL.createObjectURL(file), true)
  }

  function quitarLogo() {
    if (bloqueado) return
    setArchivo(null)
    cambiarVistaLogo("")
    setPerfil((actual) => ({ ...actual, logoUrl: "" }))
    setError(""); setMensaje("")
  }

  async function guardar(event: FormEvent) {
    event.preventDefault()
    if (!puedeEditar || guardadoEnCurso.current) return
    if (!perfil.provincias.length || !perfil.servicios.length) {
      setError("Selecciona al menos una provincia y un servicio."); setMensaje(""); return
    }
    if (serviciosAnteriores.length && !serviciosRevisados) {
      setError("Revisa los servicios anteriores antes de guardar."); setMensaje(""); return
    }
    guardadoEnCurso.current = true
    setGuardando(true); setError(""); setMensaje("")
    setProvinciasAbiertas(false); setServiciosAbiertos(false)
    try {
      let logoUrl = perfil.logoUrl
      if (archivo) {
        const body = new FormData()
        body.append("file", archivo)
        body.append("empresaId", empresa.id)
        const response = await fetch("/api/empresas/logo", { method: "POST", body })
        const result = await response.json().catch(() => null)
        if (!response.ok || typeof result?.url !== "string" || !result.url) {
          setError(typeof result?.error === "string" ? result.error : "No se pudo subir el logotipo. Vuelve a intentarlo.")
          return
        }
        logoUrl = result.url
        // A profile-save retry reuses the uploaded logo instead of uploading it twice.
        setPerfil((actual) => ({ ...actual, logoUrl }))
        setArchivo(null)
      }
      const result = await onGuardar({ ...perfil, ubicacion: perfil.provincias.join(", "), logoUrl })
      if (result.error) { setError(result.error); return }
      cambiarVistaLogo(logoUrl)
      setMensaje("Perfil actualizado.")
      router.refresh()
    } catch { setError("No se pudieron guardar los cambios. Vuelve a intentarlo.") }
    finally { guardadoEnCurso.current = false; setGuardando(false) }
  }

  return <Card className="gap-0 overflow-hidden rounded-2xl border-border/70 py-0 shadow-sm">
    <CardHeader className="flex flex-row items-center gap-3 border-b border-border/60 px-5 py-5 sm:px-6">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0 space-y-1.5"><CardTitle><h2 className="text-base leading-tight">{t("Perfil de la empresa")}</h2></CardTitle><CardDescription className="text-xs leading-relaxed sm:text-sm">{t("Presentación, servicios y web corporativa.")}</CardDescription></div>
    </CardHeader>
    <CardContent className="px-0">
      <form onSubmit={guardar} aria-busy={guardando}>
        <fieldset disabled={bloqueado} className="grid min-w-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-6 p-5 sm:p-6">
            <section className="space-y-4" aria-labelledby="empresa-identidad-titulo">
              <div className="flex items-center gap-2"><ImagePlus className="size-4 text-primary" aria-hidden="true" /><h3 id="empresa-identidad-titulo" className="text-sm font-semibold">{t("Identidad visual")}</h3></div>
              <div className="space-y-3 rounded-xl border border-dashed border-border bg-muted/25 p-4">
                <Label htmlFor="empresa-logo">{t("Logotipo de la empresa")}</Label>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Avatar className="size-20 shrink-0 rounded-2xl border border-border/60 bg-background shadow-xs"><AvatarImage src={vistaLogo || undefined} alt={t("Vista previa del logotipo")} className="object-contain p-1" /><AvatarFallback className="rounded-2xl bg-primary/5"><Building2 className="size-8 text-primary/60" aria-hidden="true" /></AvatarFallback></Avatar>
                  <div className="min-w-0 space-y-2"><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" className="rounded-lg bg-background" onClick={() => inputLogo.current?.click()} disabled={bloqueado}><Upload className="size-3.5" aria-hidden="true" />{t(vistaLogo ? "Cambiar logotipo" : "Subir logotipo")}</Button>{vistaLogo && <Button type="button" variant="ghost" size="sm" onClick={quitarLogo} disabled={bloqueado}><X className="size-3.5" aria-hidden="true" />{t("Quitar logotipo")}</Button>}</div>{archivo && <p className="break-all text-xs text-muted-foreground">{archivo.name}</p>}<p id="empresa-logo-ayuda" className="text-xs leading-relaxed text-muted-foreground">{t("PNG, JPG o WebP de hasta 3 MB. Se subirá al guardar los cambios.")}</p></div>
                </div>
                <input ref={inputLogo} id="empresa-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={elegirLogo} aria-describedby="empresa-logo-ayuda" className="sr-only" disabled={bloqueado} />
              </div>
            </section>
            <section className="space-y-4" aria-labelledby="empresa-datos-titulo">
              <h3 id="empresa-datos-titulo" className="text-sm font-semibold">{t("Datos de la empresa")}</h3>
              <div className="space-y-2"><Label htmlFor="empresa-nombre">{t("Nombre comercial")}</Label><Input id="empresa-nombre" className="h-10 rounded-lg" required maxLength={120} value={perfil.nombre} onChange={(e) => setPerfil({ ...perfil, nombre: e.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="empresa-descripcion">{t("Descripción")}</Label><Textarea id="empresa-descripcion" className="min-h-32 rounded-lg leading-relaxed" maxLength={2000} value={perfil.descripcion} onChange={(e) => setPerfil({ ...perfil, descripcion: e.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="empresa-web">{t("Web corporativa")}</Label><div className="relative"><Globe2 className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" /><Input id="empresa-web" type="url" className="h-10 rounded-lg pl-9" placeholder="https://" maxLength={500} value={perfil.web} onChange={(e) => setPerfil({ ...perfil, web: e.target.value })} /></div></div>
            </section>
          </div>
          <div className="min-w-0 space-y-6 border-t border-border/60 bg-muted/20 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <section className="space-y-4" aria-labelledby="empresa-cobertura-titulo">
              <div className="flex items-center gap-2"><MapPin className="size-4 text-primary" aria-hidden="true" /><h3 id="empresa-cobertura-titulo" className="text-sm font-semibold">{t("Cobertura y servicios")}</h3></div>
              <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
                <Label htmlFor="empresa-provincias">{t("Provincias que cubres")}</Label>
                <SelectorProvincias seleccionadas={perfil.provincias} onChange={() => {}} disabled />
                <Popover open={provinciasAbiertas && !bloqueado} onOpenChange={setProvinciasAbiertas}>
                  <PopoverTrigger asChild><Button id="empresa-provincias" type="button" variant="outline" className="w-full justify-between rounded-lg" disabled={bloqueado}>{t("Seleccionar provincias")}<ChevronDown className="size-4 shrink-0" aria-hidden="true" /></Button></PopoverTrigger>
                  <PopoverContent align="start" className={selectorClass}><SelectorProvincias seleccionadas={perfil.provincias} onChange={(provincias) => setPerfil((actual) => ({ ...actual, provincias }))} disabled={bloqueado} /><Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => setProvinciasAbiertas(false)}>{t("Listo")}</Button></PopoverContent>
                </Popover>
                {!perfil.provincias.length && empresa.ubicacion && <p className="text-xs text-muted-foreground">{t("Zona guardada anteriormente")}: {empresa.ubicacion}</p>}
              </div>
              <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
                <div className="flex items-center gap-2"><Wrench className="size-3.5 text-muted-foreground" aria-hidden="true" /><Label htmlFor="empresa-servicios">{t("Servicios que ofreces")}</Label></div>
                <SelectorCategorias seleccionadas={perfil.servicios} onChange={() => {}} disabled />
                <Popover open={serviciosAbiertos && !bloqueado} onOpenChange={setServiciosAbiertos}>
                  <PopoverTrigger asChild><Button id="empresa-servicios" type="button" variant="outline" className="w-full justify-between rounded-lg" disabled={bloqueado}>{t("Seleccionar servicios")}<ChevronDown className="size-4 shrink-0" aria-hidden="true" /></Button></PopoverTrigger>
                  <PopoverContent align="start" className={selectorClass}><SelectorCategorias seleccionadas={perfil.servicios} onChange={(servicios) => { setPerfil((actual) => ({ ...actual, servicios })); setServiciosRevisados(true) }} disabled={bloqueado} /><Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => setServiciosAbiertos(false)}>{t("Listo")}</Button></PopoverContent>
                </Popover>
                {serviciosAnteriores.length > 0 && <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><p>{t("Estos servicios anteriores no coinciden con la lista actual. Revisa la selección antes de guardar.")}</p><p className="break-words text-muted-foreground">{serviciosAnteriores.join(", ")}</p><label className="flex items-start gap-2"><Checkbox className="mt-0.5" checked={serviciosRevisados} onCheckedChange={(checked) => setServiciosRevisados(checked === true)} disabled={bloqueado} /><span>{t("He revisado los servicios seleccionados.")}</span></label></div>}
              </div>
            </section>
          </div>
        </fieldset>
        <div className="space-y-3 border-t border-border/60 px-5 py-4 sm:px-6">
          {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{t(error)}</p>}
          {mensaje && <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{t(mensaje)}</p>}
          {puedeEditar ? <div className="flex justify-end"><Button type="submit" className="w-full rounded-lg sm:w-auto" disabled={guardando}>{guardando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}{t(guardando ? "Guardando cambios…" : "Guardar cambios")}</Button></div> : <p className="text-sm text-muted-foreground">{t("Tu acceso permite consultar el perfil. Para editarlo necesitas permiso.")}</p>}
        </div>
      </form>
    </CardContent>
  </Card>
}

"use client"

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Camera, Loader2, Pencil } from "lucide-react"
import { guardarPerfilEmpresa } from "@/app/actions/empresa-workspace"
import { useT } from "@/components/idioma-provider"
import { SelectorCategorias, SelectorProvincias } from "@/components/selector-cobertura"
import PerfilEmpresa from "@/components/empresas/perfil-empresa"
import { PreferenciasDemandas } from "@/components/preferencias-demandas"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { EmpresaPublica } from "@/lib/empresas/types"
import { CATEGORIAS_SERVICIO_NOMBRES } from "@/lib/categorias"
import { PROVINCIAS_ES } from "@/lib/provincias"
import { PRECIO_MAX } from "@/lib/precios"

const LOGO_MAX_BYTES = 3 * 1024 * 1024
const LOGO_TIPOS = ["image/png", "image/jpeg", "image/webp"]
type Empresa = EmpresaPublica["empresa"]

function borradorDe(empresa: Empresa) {
  return { nombre: empresa.nombre, descripcion: empresa.descripcion, web: empresa.web, provincias: (empresa.provincias || []).filter((p) => PROVINCIAS_ES.includes(p)), servicios: empresa.servicios.filter((s) => CATEGORIAS_SERVICIO_NOMBRES.includes(s)), logoUrl: empresa.logoUrl || "", portadaUrl: empresa.portadaUrl || "", presupuestoMinInteres: empresa.presupuestoMinInteres ?? null, presupuestoMaxInteres: empresa.presupuestoMaxInteres ?? null }
}

export function PerfilEmpresaEditor({ datos, puedeEditar, integrado = false, lateral, onGuardar = guardarPerfilEmpresa }: {
  datos: EmpresaPublica
  puedeEditar: boolean
  integrado?: boolean
  lateral?: ReactNode
  onGuardar?: typeof guardarPerfilEmpresa
}) {
  const t = useT()
  const router = useRouter()
  const formId = useId()
  const [guardado, setGuardado] = useState<{ origen: Empresa; empresa: Empresa } | null>(null)
  // Show the saved result immediately; a server refresh becomes the new source.
  const empresa = guardado?.origen === datos.empresa ? guardado.empresa : datos.empresa
  const [perfil, setPerfil] = useState(() => borradorDe(empresa))
  const [editando, setEditando] = useState(false)
  const [serviciosRevisados, setServiciosRevisados] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [archivoPortada, setArchivoPortada] = useState<File | null>(null)
  const [vistaLogo, setVistaLogo] = useState(empresa.logoUrl || "")
  const [vistaPortada, setVistaPortada] = useState(empresa.portadaUrl || "")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const inputLogo = useRef<HTMLInputElement>(null)
  const inputPortada = useRef<HTMLInputElement>(null)
  const inputNombre = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const logoTemporal = useRef<string | null>(null)
  const portadaTemporal = useRef<string | null>(null)
  const guardadoEnCurso = useRef(false)
  const enEdicion = editando && puedeEditar
  const bloqueado = guardando || !puedeEditar
  const serviciosAnteriores = empresa.servicios.filter((s) => !CATEGORIAS_SERVICIO_NOMBRES.includes(s))

  useEffect(() => () => {
    if (logoTemporal.current) URL.revokeObjectURL(logoTemporal.current)
    if (portadaTemporal.current) URL.revokeObjectURL(portadaTemporal.current)
  }, [])
  useEffect(() => { if (enEdicion) inputNombre.current?.focus() }, [enEdicion])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  const cambiarVistaLogo = useCallback((url: string, temporal = false) => {
    if (logoTemporal.current) URL.revokeObjectURL(logoTemporal.current)
    logoTemporal.current = temporal ? url : null
    setVistaLogo(url)
  }, [])
  const cambiarVistaPortada = useCallback((url: string, temporal = false) => {
    if (portadaTemporal.current) URL.revokeObjectURL(portadaTemporal.current)
    portadaTemporal.current = temporal ? url : null
    setVistaPortada(url)
  }, [])

  const iniciarEdicion = useCallback(() => {
    if (!puedeEditar || guardadoEnCurso.current) return
    if (editando) { inputNombre.current?.focus(); return }
    setPerfil(borradorDe(empresa)); setArchivo(null); setArchivoPortada(null)
    cambiarVistaLogo(empresa.logoUrl || "")
    cambiarVistaPortada(empresa.portadaUrl || "")
    setServiciosRevisados(false); setError(""); setMensaje(""); setEditando(true)
  }, [puedeEditar, editando, empresa, cambiarVistaLogo, cambiarVistaPortada])

  function cancelar() {
    if (guardadoEnCurso.current) return
    setArchivo(null); setArchivoPortada(null); cambiarVistaLogo(empresa.logoUrl || ""); cambiarVistaPortada(empresa.portadaUrl || "")
    setPerfil(borradorDe(empresa)); setEditando(false); setError(""); setMensaje("")
  }

  function elegirLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || bloqueado) return
    setMensaje("")
    if (!LOGO_TIPOS.includes(file.type)) { setError("Elige una imagen PNG, JPG o WebP."); return }
    if (!file.size || file.size > LOGO_MAX_BYTES) { setError("El logotipo debe ocupar como máximo 3 MB."); return }
    setError(""); setArchivo(file); cambiarVistaLogo(URL.createObjectURL(file), true)
  }

  function elegirPortada(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || bloqueado) return
    setMensaje("")
    if (!LOGO_TIPOS.includes(file.type)) { setError("Elige una imagen PNG, JPG o WebP."); return }
    if (!file.size || file.size > LOGO_MAX_BYTES) { setError("La portada debe ocupar como máximo 3 MB."); return }
    setError(""); setArchivoPortada(file); cambiarVistaPortada(URL.createObjectURL(file), true)
  }

  async function guardar(event: FormEvent) {
    event.preventDefault()
    if (!enEdicion || guardadoEnCurso.current) return
    if (!perfil.provincias.length || !perfil.servicios.length) {
      setError("Selecciona al menos una provincia y un servicio."); setMensaje(""); return
    }
    if (serviciosAnteriores.length && !serviciosRevisados) {
      setError("Revisa los servicios anteriores antes de guardar."); setMensaje(""); return
    }
    guardadoEnCurso.current = true
    setGuardando(true); setError(""); setMensaje("")
    try {
      let logoUrl = perfil.logoUrl
      let portadaUrl = perfil.portadaUrl
      if (archivo) {
        const body = new FormData()
        body.append("file", archivo); body.append("empresaId", empresa.id)
        const response = await fetch("/api/empresas/logo", { method: "POST", body })
        const result = await response.json().catch(() => null)
        if (!response.ok || typeof result?.url !== "string" || !result.url) {
          setError(typeof result?.error === "string" ? result.error : "No se pudo subir el logotipo. Vuelve a intentarlo.")
          return
        }
        logoUrl = result.url
        // Retrying a failed save reuses the uploaded logo.
        setPerfil((actual) => ({ ...actual, logoUrl })); setArchivo(null)
      }
      if (archivoPortada) {
        const body = new FormData()
        body.append("file", archivoPortada); body.append("empresaId", empresa.id)
        const response = await fetch("/api/empresas/portada", { method: "POST", body })
        const result = await response.json().catch(() => null)
        if (!response.ok || typeof result?.url !== "string" || !result.url) {
          setError(typeof result?.error === "string" ? result.error : "No se pudo subir la portada. Vuelve a intentarlo.")
          return
        }
        portadaUrl = result.url
        setPerfil((actual) => ({ ...actual, portadaUrl })); setArchivoPortada(null)
      }
      const cambios = { ...perfil, nombre: perfil.nombre.trim(), descripcion: perfil.descripcion.trim(), web: perfil.web.trim(), ubicacion: perfil.provincias.join(", "), logoUrl, portadaUrl }
      const result = await onGuardar(cambios)
      if (result.error) { setError(result.error); return }
      setGuardado({ origen: datos.empresa, empresa: { ...empresa, ...cambios } })
      cambiarVistaLogo(logoUrl); cambiarVistaPortada(portadaUrl); setEditando(false); setMensaje("Perfil actualizado.")
      router.refresh()
    } catch { setError("No se pudieron guardar los cambios. Vuelve a intentarlo.") }
    finally { guardadoEnCurso.current = false; setGuardando(false) }
  }

  const acciones = puedeEditar ? <div className="flex shrink-0 flex-col gap-2">
    {enEdicion ? <>
      <Button key="guardar" type="submit" form={formId} disabled={guardando}>{guardando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{t(guardando ? "Guardando cambios…" : "Guardar cambios")}</Button>
      <Button key="cancelar" type="button" variant="outline" onClick={cancelar} disabled={guardando}>{t("Cancelar")}</Button>
    </> : <Button key="editar" type="button" onClick={(event) => { event.preventDefault(); iniciarEdicion() }}><Pencil className="size-4" aria-hidden="true" />{t("Editar perfil")}</Button>}
  </div> : undefined

  const campos = enEdicion ? {
    nombre: <div className="w-full"><Label htmlFor="empresa-nombre" className="sr-only">{t("Nombre comercial")}</Label><Input ref={inputNombre} id="empresa-nombre" form={formId} className="h-auto py-1 text-xl font-bold" required maxLength={120} value={perfil.nombre} onChange={(e) => setPerfil({ ...perfil, nombre: e.target.value })} disabled={bloqueado} /></div>,
    logotipo: <>
      <Button type="button" variant="secondary" size="icon" className="absolute bottom-0 right-0" aria-label={t("Cambiar foto de perfil")} onClick={() => inputLogo.current?.click()} disabled={bloqueado}><Camera className="size-4" aria-hidden="true" /></Button>
      <input ref={inputLogo} id="empresa-logo" type="file" aria-label={t("Foto de perfil")} accept="image/png,image/jpeg,image/webp" onChange={elegirLogo} className="hidden" disabled={bloqueado} />
    </>,
    portada: <>
      <Button type="button" size="sm" variant="secondary" className="absolute top-4 right-4" onClick={() => inputPortada.current?.click()} disabled={bloqueado}><Camera className="size-4" aria-hidden="true" />{t("Cambiar portada")}</Button>
      <input ref={inputPortada} id="empresa-portada" type="file" aria-label={t("Cambiar portada")} accept="image/png,image/jpeg,image/webp" onChange={elegirPortada} className="hidden" disabled={bloqueado} />
    </>,
    descripcion: <><Label htmlFor="empresa-descripcion" className="sr-only">{t("Descripción")}</Label><Textarea id="empresa-descripcion" form={formId} rows={5} maxLength={2000} value={perfil.descripcion} onChange={(e) => setPerfil({ ...perfil, descripcion: e.target.value })} disabled={bloqueado} /></>,
    servicios: <fieldset disabled={bloqueado} className="space-y-3"><legend className="sr-only">{t("Servicios que ofreces")}</legend>
      <SelectorCategorias seleccionadas={perfil.servicios} onChange={(servicios) => { setPerfil((actual) => ({ ...actual, servicios })); setServiciosRevisados(true) }} disabled={bloqueado} />
      {serviciosAnteriores.length > 0 && <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><p>{t("Estos servicios anteriores no coinciden con la lista actual. Revisa la selección antes de guardar.")}</p><p className="break-words text-muted-foreground">{serviciosAnteriores.join(", ")}</p><label className="flex items-start gap-2"><Checkbox className="mt-0.5" checked={serviciosRevisados} onCheckedChange={(checked) => setServiciosRevisados(checked === true)} disabled={bloqueado} /><span>{t("He revisado los servicios seleccionados.")}</span></label></div>}
    </fieldset>,
    zona: <fieldset disabled={bloqueado} className="space-y-3"><legend className="sr-only">{t("Provincias que cubres")}</legend><SelectorProvincias seleccionadas={perfil.provincias} onChange={(provincias) => setPerfil((actual) => ({ ...actual, provincias }))} disabled={bloqueado} />{!perfil.provincias.length && empresa.ubicacion && <p className="text-xs text-muted-foreground">{t("Zona guardada anteriormente")}: {empresa.ubicacion}</p>}</fieldset>,
    web: <div className="min-w-0 flex-1"><Label htmlFor="empresa-web" className="sr-only">{t("Web corporativa")}</Label><Input id="empresa-web" form={formId} type="url" placeholder="https://" maxLength={500} value={perfil.web} onChange={(e) => setPerfil({ ...perfil, web: e.target.value })} disabled={bloqueado} /></div>,
  } : undefined

  const preferencias = puedeEditar ? <PreferenciasDemandas
    presupuesto={enEdicion ? [perfil.presupuestoMinInteres ?? 0, perfil.presupuestoMaxInteres ?? PRECIO_MAX] : [empresa.presupuestoMinInteres ?? 0, empresa.presupuestoMaxInteres ?? PRECIO_MAX]}
    onChange={([minimo, maximo]) => setPerfil((actual) => ({ ...actual, presupuestoMinInteres: minimo <= 0 ? null : minimo, presupuestoMaxInteres: maximo >= PRECIO_MAX ? null : maximo }))}
    editando={enEdicion} disabled={bloqueado}
    sinCobertura={!(enEdicion ? perfil : empresa).servicios.length || !(enEdicion ? perfil : empresa).provincias?.length}>
    {empresa.estadoVerificacion !== "verificada" && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{t("Los avisos de la empresa se activarán cuando su representación esté verificada.")}</p>}
  </PreferenciasDemandas> : undefined

  return <div id="perfil-empresa" className="scroll-mt-24" aria-busy={guardando}>
    <form id={formId} onSubmit={guardar} />
    <PerfilEmpresa datos={{ ...datos, empresa: enEdicion ? { ...empresa, ...perfil, ubicacion: perfil.provincias.join(", "), logoUrl: vistaLogo, portadaUrl: vistaPortada } : empresa }} vistaPrevia integrado={integrado} acciones={acciones} edicion={campos} preferencias={preferencias} lateral={lateral} estado={error || mensaje ? <>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{t(error)}</p>}
      {mensaje && <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{t(mensaje)}</p>}
    </> : undefined} />
  </div>
}

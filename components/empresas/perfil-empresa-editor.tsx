"use client"

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pencil, Save, Upload, X } from "lucide-react"
import { guardarPerfilEmpresa } from "@/app/actions/empresa-workspace"
import { useT } from "@/components/idioma-provider"
import { SelectorCategorias, SelectorProvincias } from "@/components/selector-cobertura"
import PerfilEmpresa from "@/components/empresas/perfil-empresa"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { EmpresaPublica } from "@/lib/empresas/types"
import { CATEGORIAS_SERVICIO_NOMBRES } from "@/lib/categorias"
import { PROVINCIAS_ES } from "@/lib/provincias"

const LOGO_MAX_BYTES = 3 * 1024 * 1024
const LOGO_TIPOS = ["image/png", "image/jpeg", "image/webp"]
type Empresa = EmpresaPublica["empresa"]

function borradorDe(empresa: Empresa) {
  return { nombre: empresa.nombre, descripcion: empresa.descripcion, web: empresa.web, provincias: (empresa.provincias || []).filter((p) => PROVINCIAS_ES.includes(p)), servicios: empresa.servicios.filter((s) => CATEGORIAS_SERVICIO_NOMBRES.includes(s)), logoUrl: empresa.logoUrl || "" }
}

export function PerfilEmpresaEditor({ datos, puedeEditar, solicitudEdicion = 0, integrado = false, onGuardar = guardarPerfilEmpresa }: {
  datos: EmpresaPublica
  puedeEditar: boolean
  solicitudEdicion?: number
  integrado?: boolean
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
  const [vistaLogo, setVistaLogo] = useState(empresa.logoUrl || "")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const inputLogo = useRef<HTMLInputElement>(null)
  const inputNombre = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const logoTemporal = useRef<string | null>(null)
  const guardadoEnCurso = useRef(false)
  const solicitudAtendida = useRef(0)
  const enEdicion = editando && puedeEditar
  const bloqueado = guardando || !puedeEditar
  const serviciosAnteriores = empresa.servicios.filter((s) => !CATEGORIAS_SERVICIO_NOMBRES.includes(s))

  useEffect(() => () => { if (logoTemporal.current) URL.revokeObjectURL(logoTemporal.current) }, [])
  useEffect(() => { if (enEdicion) inputNombre.current?.focus() }, [enEdicion])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  const cambiarVistaLogo = useCallback((url: string, temporal = false) => {
    if (logoTemporal.current) URL.revokeObjectURL(logoTemporal.current)
    logoTemporal.current = temporal ? url : null
    setVistaLogo(url)
  }, [])

  const iniciarEdicion = useCallback(() => {
    if (!puedeEditar || guardadoEnCurso.current) return
    if (editando) { inputNombre.current?.focus(); return }
    setPerfil(borradorDe(empresa)); setArchivo(null)
    cambiarVistaLogo(empresa.logoUrl || "")
    setServiciosRevisados(false); setError(""); setMensaje(""); setEditando(true)
  }, [puedeEditar, editando, empresa, cambiarVistaLogo])

  useEffect(() => {
    if (solicitudEdicion <= solicitudAtendida.current) return
    solicitudAtendida.current = solicitudEdicion
    iniciarEdicion()
  }, [solicitudEdicion, iniciarEdicion])

  function cancelar() {
    if (guardadoEnCurso.current) return
    setArchivo(null); cambiarVistaLogo(empresa.logoUrl || "")
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

  function quitarLogo() {
    if (bloqueado) return
    setArchivo(null); cambiarVistaLogo("")
    setPerfil((actual) => ({ ...actual, logoUrl: "" })); setError(""); setMensaje("")
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
      const cambios = { ...perfil, nombre: perfil.nombre.trim(), descripcion: perfil.descripcion.trim(), web: perfil.web.trim(), ubicacion: perfil.provincias.join(", "), logoUrl }
      const result = await onGuardar(cambios)
      if (result.error) { setError(result.error); return }
      setGuardado({ origen: datos.empresa, empresa: { ...empresa, ...cambios } })
      cambiarVistaLogo(logoUrl); setEditando(false); setMensaje("Perfil actualizado.")
      router.refresh()
    } catch { setError("No se pudieron guardar los cambios. Vuelve a intentarlo.") }
    finally { guardadoEnCurso.current = false; setGuardando(false) }
  }

  const acciones = puedeEditar ? <div className="flex flex-wrap gap-2">
    {enEdicion ? <>
      <Button key="guardar" type="submit" form={formId} disabled={guardando}>{guardando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}{t(guardando ? "Guardando cambios…" : "Guardar cambios")}</Button>
      <Button key="cancelar" type="button" variant="outline" onClick={cancelar} disabled={guardando}>{t("Cancelar")}</Button>
    </> : <Button key="editar" type="button" onClick={(event) => { event.preventDefault(); iniciarEdicion() }}><Pencil className="size-4" aria-hidden="true" />{t("Editar perfil de empresa")}</Button>}
  </div> : undefined

  const campos = enEdicion ? {
    nombre: <div className="w-full space-y-2"><Label htmlFor="empresa-nombre">{t("Nombre comercial")}</Label><Input ref={inputNombre} id="empresa-nombre" form={formId} className="text-xl font-semibold" required maxLength={120} value={perfil.nombre} onChange={(e) => setPerfil({ ...perfil, nombre: e.target.value })} disabled={bloqueado} /></div>,
    logotipo: <div className="space-y-2">
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => inputLogo.current?.click()} disabled={bloqueado}><Upload className="size-4" aria-hidden="true" />{t(vistaLogo ? "Cambiar logotipo" : "Subir logotipo")}</Button>{vistaLogo && <Button type="button" variant="ghost" size="sm" onClick={quitarLogo} disabled={bloqueado}><X className="size-4" aria-hidden="true" />{t("Quitar logotipo")}</Button>}</div>
      <input ref={inputLogo} id="empresa-logo" type="file" aria-label={t("Logotipo de la empresa")} accept="image/png,image/jpeg,image/webp" onChange={elegirLogo} className="sr-only" disabled={bloqueado} />
      {archivo && <p className="break-all text-xs text-muted-foreground">{archivo.name}</p>}
      <p className="text-xs text-muted-foreground">{t("PNG, JPG o WebP de hasta 3 MB. Se subirá al guardar los cambios.")}</p>
    </div>,
    descripcion: <><Label htmlFor="empresa-descripcion" className="sr-only">{t("Descripción")}</Label><Textarea id="empresa-descripcion" form={formId} className="min-h-32 leading-relaxed" maxLength={2000} value={perfil.descripcion} onChange={(e) => setPerfil({ ...perfil, descripcion: e.target.value })} disabled={bloqueado} /></>,
    servicios: <fieldset disabled={bloqueado} className="space-y-3"><legend className="sr-only">{t("Servicios que ofreces")}</legend>
      <SelectorCategorias seleccionadas={perfil.servicios} onChange={(servicios) => { setPerfil((actual) => ({ ...actual, servicios })); setServiciosRevisados(true) }} disabled={bloqueado} />
      {serviciosAnteriores.length > 0 && <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><p>{t("Estos servicios anteriores no coinciden con la lista actual. Revisa la selección antes de guardar.")}</p><p className="break-words text-muted-foreground">{serviciosAnteriores.join(", ")}</p><label className="flex items-start gap-2"><Checkbox className="mt-0.5" checked={serviciosRevisados} onCheckedChange={(checked) => setServiciosRevisados(checked === true)} disabled={bloqueado} /><span>{t("He revisado los servicios seleccionados.")}</span></label></div>}
    </fieldset>,
    zona: <fieldset disabled={bloqueado} className="space-y-3"><legend className="sr-only">{t("Provincias que cubres")}</legend><SelectorProvincias seleccionadas={perfil.provincias} onChange={(provincias) => setPerfil((actual) => ({ ...actual, provincias }))} disabled={bloqueado} />{!perfil.provincias.length && empresa.ubicacion && <p className="text-xs text-muted-foreground">{t("Zona guardada anteriormente")}: {empresa.ubicacion}</p>}</fieldset>,
    web: <div className="space-y-2"><Label htmlFor="empresa-web" className="sr-only">{t("Web corporativa")}</Label><Input id="empresa-web" form={formId} type="url" placeholder="https://" maxLength={500} value={perfil.web} onChange={(e) => setPerfil({ ...perfil, web: e.target.value })} disabled={bloqueado} /></div>,
  } : undefined

  return <div id="perfil-empresa" className="scroll-mt-24" aria-busy={guardando}>
    <form id={formId} onSubmit={guardar} />
    <PerfilEmpresa datos={{ ...datos, empresa: enEdicion ? { ...empresa, ...perfil, ubicacion: perfil.provincias.join(", "), logoUrl: vistaLogo } : empresa }} vistaPrevia integrado={integrado} acciones={acciones} edicion={campos} estado={error || mensaje ? <>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{t(error)}</p>}
      {mensaje && <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{t(mensaje)}</p>}
    </> : undefined} />
  </div>
}

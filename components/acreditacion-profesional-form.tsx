"use client"

import { useId, useState } from "react"
import { Building2, FileCheck2, Loader2, ShieldCheck, Upload, UserRound, X } from "lucide-react"
import { useT } from "@/components/idioma-provider"
import { subirDocumentoAcreditacionProfesional } from "@/app/actions/verificacion-profesionales"
import type { DatosAcreditacionProfesional } from "@/lib/verificacion-profesional"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export const acreditacionVacia: DatosAcreditacionProfesional = {
  tipoProveedor: "particular", nombreLegal: "", nif: "", domicilioFiscal: "", actividad: "", cualificacion: "",
  representanteNombre: "", cargoRepresentacion: "", documentos: [], consentimiento: false,
}

const cargos = ["Administrador único", "Administrador solidario", "Administrador mancomunado", "Consejero delegado", "Miembro del consejo con facultades de representación", "Apoderado individual o solidario", "Apoderado mancomunado", "Representante de administrador persona jurídica", "Otra representación acreditada"]

export function AcreditacionProfesionalForm({ value, onChange, disabled = false, identidadBloqueada = false, tipoBloqueado = false, demostracion = false, onCargando }: {
  value: DatosAcreditacionProfesional
  onChange: (datos: DatosAcreditacionProfesional) => void
  disabled?: boolean
  identidadBloqueada?: boolean
  tipoBloqueado?: boolean
  demostracion?: boolean
  onCargando?: (cargando: boolean) => void
}) {
  const t = useT()
  const id = useId()
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [error, setError] = useState("")
  const empresa = value.tipoProveedor === "empresa"
  const bloqueado = disabled || Boolean(subiendo)
  function campo(clave: keyof DatosAcreditacionProfesional, valor: unknown) { onChange({ ...value, [clave]: valor }) }

  async function subir(file: File | undefined, categoria: "identidad" | "cualificacion" | "representacion") {
    if (!file || bloqueado) return
    setError("")
    if (file.type !== "application/pdf" || !file.size || file.size > 5 * 1024 * 1024) {
      setError("Adjunta un PDF de hasta 5 MB.")
      return
    }
    if (demostracion) {
      campo("documentos", [...value.documentos.filter(d => d.categoria !== categoria), { categoria, url: `demo:${categoria}`, nombre: file.name }])
      return
    }
    setSubiendo(categoria)
    onCargando?.(true)
    try {
      const body = new FormData()
      body.append("file", file)
      body.append("categoria", categoria)
      const resultado = await subirDocumentoAcreditacionProfesional(body)
      if (resultado.error || !resultado.data) { setError(resultado.error || "No se pudo adjuntar el documento."); return }
      campo("documentos", [...value.documentos.filter(d => d.categoria !== categoria), resultado.data])
    } catch { setError("No se pudo adjuntar el documento.") }
    finally { setSubiendo(null); onCargando?.(false) }
  }

  const documentos = [
    { categoria: "identidad" as const, titulo: empresa ? "Identidad de la empresa" : "Identidad del profesional", ayuda: empresa ? "NIF de la sociedad y documento registral que identifique su razón social." : "Documento de identidad o acreditación fiscal que identifique al titular." },
    { categoria: "cualificacion" as const, titulo: "Acreditación de la actividad", ayuda: "Titulación, habilitación o colegiación cuando corresponda. Para otras actividades, aporta justificantes de experiencia o actividad profesional." },
    ...(empresa ? [{ categoria: "representacion" as const, titulo: "Facultades de representación", ayuda: "Nombramiento o poder vigente. Si la representación es mancomunada, acredita las autorizaciones necesarias." }] : []),
  ]

  return <div className="space-y-6">
    <fieldset disabled={bloqueado || identidadBloqueada || tipoBloqueado} className="space-y-3">
      <legend className="mb-3 text-sm font-semibold">{t("Cómo prestas tus servicios")}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {([['particular', UserRound, 'Profesional particular', 'Trabajas en tu propio nombre.'], ['empresa', Building2, 'Empresa', 'Prestas servicios a nombre de una sociedad.']] as const).map(([tipo, Icono, titulo, ayuda]) => <label key={tipo} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${value.tipoProveedor === tipo ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:bg-muted/40'} ${identidadBloqueada ? 'cursor-default opacity-70' : ''}`}>
          <input type="radio" name={`${id}-tipo`} value={tipo} checked={value.tipoProveedor === tipo} onChange={() => onChange({ ...value, tipoProveedor: tipo, documentos: value.documentos.filter(d => tipo === 'empresa' || d.categoria !== 'representacion') })} className="mt-1 accent-primary" />
          <Icono className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0"><span className="block text-sm font-semibold">{t(titulo)}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{t(ayuda)}</span></span>
        </label>)}
      </div>
    </fieldset>
    {identidadBloqueada && <p className="text-xs text-muted-foreground">{t("Tu identidad está vinculada a una cuenta de cobros. Contacta con Diime para cambiar el titular o el NIF.")}</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor={`${id}-nombre`}>{t(empresa ? "Razón social" : "Nombre y apellidos legales")}</Label><Input id={`${id}-nombre`} value={value.nombreLegal} onChange={e => campo('nombreLegal', e.target.value)} required maxLength={200} disabled={bloqueado || identidadBloqueada} autoComplete="organization" /></div>
      <div className="space-y-2"><Label htmlFor={`${id}-nif`}>{t(empresa ? "NIF de la empresa (CIF)" : "NIF / NIE")}</Label><Input id={`${id}-nif`} value={value.nif} onChange={e => campo('nif', e.target.value.toUpperCase())} required maxLength={20} disabled={bloqueado || identidadBloqueada} autoCapitalize="characters" /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor={`${id}-domicilio`}>{t("Domicilio fiscal")}</Label><Input id={`${id}-domicilio`} value={value.domicilioFiscal} onChange={e => campo('domicilioFiscal', e.target.value)} required maxLength={500} disabled={bloqueado} autoComplete="street-address" /></div>
      {empresa && <>
        <div className="space-y-2"><Label htmlFor={`${id}-representante`}>{t("Nombre del representante")}</Label><Input id={`${id}-representante`} value={value.representanteNombre || ''} onChange={e => campo('representanteNombre', e.target.value)} required maxLength={200} disabled={bloqueado} /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor={`${id}-cargo`}>{t("Cargo o facultades de representación")}</Label><select id={`${id}-cargo`} value={value.cargoRepresentacion || ''} onChange={e => campo('cargoRepresentacion', e.target.value)} required disabled={bloqueado} className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm"><option value="">{t("Selecciona una opción")}</option>{cargos.map(c => <option key={c} value={c}>{t(c)}</option>)}</select></div>
      </>}
      <div className="space-y-2 sm:col-span-2"><Label htmlFor={`${id}-actividad`}>{t("Servicios que quieres acreditar")}</Label><Textarea id={`${id}-actividad`} value={value.actividad} onChange={e => campo('actividad', e.target.value)} required maxLength={2000} disabled={bloqueado} rows={2} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor={`${id}-cualificacion`}>{t("Formación, habilitaciones y experiencia")}</Label><Textarea id={`${id}-cualificacion`} value={value.cualificacion} onChange={e => campo('cualificacion', e.target.value)} required maxLength={4000} disabled={bloqueado} rows={3} /><p className="text-xs leading-relaxed text-muted-foreground">{t("Describe qué acredita tu capacidad para prestar estos servicios. Diime revisará los requisitos que correspondan a la actividad.")}</p></div>
    </div>
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-primary" />{t("Documentación privada")}</div>
      <p className="text-xs text-muted-foreground">{t("Solo tú y el equipo autorizado de Diime podéis consultar estos documentos. No aparecerán en tu perfil público.")}</p>
      {documentos.map(({categoria, titulo, ayuda}) => {
        const documento = value.documentos.find(d => d.categoria === categoria)
        return <div key={categoria} className="rounded-xl border bg-muted/20 p-4">
          <p className="text-sm font-medium">{t(titulo)}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(ayuda)}</p>
          <div className="mt-3 flex min-w-0 items-center gap-2">
            <label className={`relative flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-background px-3 py-2 text-sm hover:bg-primary/5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${bloqueado ? 'pointer-events-none opacity-60' : ''}`}>
              {subiendo === categoria ? <Loader2 className="size-5 shrink-0 animate-spin text-primary" /> : documento ? <FileCheck2 className="size-5 shrink-0 text-primary" /> : <Upload className="size-5 shrink-0 text-primary" />}
              <span className="min-w-0"><span className="block truncate font-medium">{documento?.nombre || t("Adjuntar PDF")}</span><span className="text-xs text-muted-foreground">{documento ? t("Pulsa para sustituir el archivo") : t("Máximo 5 MB por documento")}</span></span>
              <input aria-label={`${t('Adjuntar PDF')}: ${t(titulo)}`} type="file" accept="application/pdf,.pdf" disabled={bloqueado} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={e => { void subir(e.target.files?.[0], categoria); e.target.value = '' }} />
            </label>
            {documento && <Button type="button" variant="ghost" size="icon" aria-label={`${t('Quitar')}: ${documento.nombre}`} disabled={bloqueado} onClick={() => campo('documentos', value.documentos.filter(d => d.categoria !== categoria))}><X className="size-4" /></Button>}
          </div>
        </div>
      })}
    </div>
    <div className="flex items-start gap-3 rounded-lg bg-primary/5 p-4"><Checkbox id={`${id}-consentimiento`} checked={value.consentimiento} onCheckedChange={checked => campo('consentimiento', checked === true)} disabled={bloqueado} /><Label htmlFor={`${id}-consentimiento`} className="text-xs leading-relaxed">{t("Confirmo que los datos y documentos son auténticos, que tengo las facultades declaradas y autorizo su revisión por Diime.")}</Label></div>
    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
  </div>
}

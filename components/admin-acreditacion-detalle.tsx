"use client"

import { useState } from "react"
import { ExternalLink, FileCheck2, Loader2 } from "lucide-react"
import { useT } from "@/components/idioma-provider"
import { abrirDocumentoAcreditacionProfesional } from "@/app/actions/verificacion-profesionales"
import type { DatosAcreditacionProfesional } from "@/lib/verificacion-profesional"
import { Button } from "@/components/ui/button"

export function AdminAcreditacionDetalle({ datos }: { datos: DatosAcreditacionProfesional | null | undefined }) {
  const t = useT()
  const [cargando, setCargando] = useState("")
  const [error, setError] = useState("")
  const [enlaces, setEnlaces] = useState<Record<string, string>>({})
  if (!datos) return <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{t("Este expediente anterior no incluye acreditaciones. Solicita al proveedor que complete su documentación antes de aprobarlo.")}</p>
  async function abrir(url: string) {
    setCargando(url); setError("")
    try {
      const resultado = await abrirDocumentoAcreditacionProfesional(url)
      if (resultado.error || !resultado.data) { setError(resultado.error || "No se pudo abrir el documento."); return }
      setEnlaces(actual => ({ ...actual, [url]: resultado.data!.url }))
    } catch { setError("No se pudo abrir el documento.") }
    finally { setCargando("") }
  }
  const campos = [
    ["Tipo de proveedor", datos.tipoProveedor === "empresa" ? t("Empresa") : t("Profesional particular")],
    [datos.tipoProveedor === "empresa" ? "Razón social" : "Nombre y apellidos legales", datos.nombreLegal],
    ["NIF / NIE", datos.nif], ["Domicilio fiscal", datos.domicilioFiscal],
    ...(datos.tipoProveedor === "empresa" ? [["Nombre del representante", datos.representanteNombre], ["Cargo o facultades de representación", datos.cargoRepresentacion ? t(datos.cargoRepresentacion) : undefined]] : []),
  ]
  return <section className="space-y-4 rounded-xl border bg-muted/20 p-4">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><FileCheck2 className="size-4 text-primary" />{t("Acreditaciones del proveedor")}</h3>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">{campos.map(([etiqueta, valor]) => <div key={etiqueta}><dt className="text-xs text-muted-foreground">{t(etiqueta!)}</dt><dd className="mt-1 break-words font-medium">{valor || t("No disponible")}</dd></div>)}</dl>
    <div><p className="text-xs text-muted-foreground">{t("Servicios que quieres acreditar")}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{datos.actividad}</p></div>
    <div><p className="text-xs text-muted-foreground">{t("Formación, habilitaciones y experiencia")}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{datos.cualificacion}</p></div>
    <ul className="space-y-2">{datos.documentos.map(doc => <li key={doc.url} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3">
      <span className="min-w-0 break-all text-sm">{doc.nombre}<span className="mt-1 block text-xs text-muted-foreground">{t(doc.categoria === 'identidad' ? 'Identidad' : doc.categoria === 'representacion' ? 'Representación' : 'Acreditación de la actividad')}</span></span>
      <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={Boolean(cargando)} onClick={() => void abrir(doc.url)}>{cargando === doc.url ? <Loader2 className="size-4 animate-spin" /> : null}{t(enlaces[doc.url] ? "Renovar acceso" : "Consultar documento")}</Button>
      {enlaces[doc.url] && <Button asChild size="sm"><a href={enlaces[doc.url]} target="_blank" rel="noopener noreferrer">{t("Abrir PDF")}<ExternalLink className="ml-1 size-3" /></a></Button>}</div>
    </li>)}</ul>
    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
  </section>
}

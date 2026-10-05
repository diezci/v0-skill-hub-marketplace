"use client"

import { useEffect, useState, useTransition } from "react"
import { obtenerVerificacionesEmpresas, descargarVerificacionEmpresa, revisarVerificacionEmpresa } from "@/app/actions/empresa-workspace"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useT } from "@/components/idioma-provider"

type Expediente = {
  empresaId: string; empresaNombre: string; nif: string; estado: string; metodo: string;
  representanteNombre: string; cargoLegal: string; documentoNombre: string; notaRevision?: string; creadaEn: string
}

export default function VerificacionesEmpresasPage() {
  const t = useT()
  const [expedientes, setExpedientes] = useState<Expediente[]>([])
  const [error, setError] = useState("")
  const [cargando, setCargando] = useState(true)
  const [revision, setRevision] = useState(0)
  const [pendiente, iniciar] = useTransition()
  const [seleccion, setSeleccion] = useState("")
  const [nota, setNota] = useState("")
  const [comprobado, setComprobado] = useState(false)
  useEffect(() => {
    let activo = true
    setCargando(true)
    obtenerVerificacionesEmpresas().then(resultado => {
      if (!activo) return
      if (resultado.error) setError(resultado.error)
      else { setExpedientes(resultado.data || []); setError("") }
    }).catch(() => { if (activo) setError("No se pudieron cargar las solicitudes.") })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [revision])
  const actual = expedientes.find(e => e.empresaId === seleccion)
  function descargar(empresaId: string) {
    iniciar(async () => {
      try {
        const resultado = await descargarVerificacionEmpresa(empresaId)
        if (resultado.error || !resultado.data) { setError(resultado.error || "Documento no disponible"); return }
        const bytes = Uint8Array.from(atob(resultado.data.base64), c => c.charCodeAt(0))
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))
        const enlace = document.createElement("a")
        enlace.href = url; enlace.download = resultado.data.nombre; enlace.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } catch { setError("No se pudo descargar el documento.") }
    })
  }
  function revisar(decision: "verificada" | "requiere_informacion") {
    if (!actual) return
    iniciar(async () => {
      try {
        const resultado = await revisarVerificacionEmpresa({ empresaId: actual.empresaId, decision, nota })
        if (resultado.error) { setError(resultado.error); return }
        setSeleccion(""); setNota(""); setComprobado(false); setRevision(v => v + 1)
      } catch { setError("No se pudo guardar la revisión.") }
    })
  }
  return <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <div><h1 className="text-2xl font-semibold">{t("Verificación de empresas")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("Revisa la identidad de la empresa y las facultades de su representante antes de publicar el perfil.")}</p></div>
    {error && <p role="alert" className="text-destructive">{t(error)}</p>}
    {cargando ? <p role="status">{t("Cargando...")}</p> : expedientes.length === 0 ? <p>{t("No hay solicitudes de verificación de empresas.")}</p> : <div className="grid gap-4 md:grid-cols-2">
      {expedientes.map(expediente => <Card key={expediente.empresaId}><CardHeader><CardTitle className="break-words text-lg">{expediente.empresaNombre}</CardTitle><Badge variant="outline" className="w-fit">{t(expediente.estado === "en_revision" ? "En revisión" : expediente.estado === "verificada" ? "Verificada" : "Requiere información")}</Badge></CardHeader>
        <CardContent className="space-y-3 text-sm"><p>{t("NIF")}: {expediente.nif}</p><p>{expediente.representanteNombre} · {expediente.cargoLegal}</p><p className="break-all">{expediente.documentoNombre}</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pendiente} onClick={() => descargar(expediente.empresaId)}>{t("Descargar documento")}</Button><Button disabled={pendiente || expediente.estado !== "en_revision"} onClick={() => { setSeleccion(expediente.empresaId); setNota(expediente.notaRevision || ""); setComprobado(false) }}>{t("Revisar")}</Button></div>
        </CardContent></Card>)}
    </div>}
    {actual && <Card><CardHeader><CardTitle>{actual.empresaNombre}</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="space-y-2"><Label htmlFor="nota-empresa">{t("Resultado de la revisión")}</Label><Textarea id="nota-empresa" value={nota} onChange={e => setNota(e.target.value)} maxLength={2000} placeholder={t("Indica qué se ha comprobado o qué información falta.")} /></div>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={comprobado} onChange={e => setComprobado(e.target.checked)} />{t("He comprobado la identidad de la empresa y la representación de esta persona. Esta revisión no acredita licencias ni especialidades profesionales.")}</label>
      <div className="flex flex-wrap gap-2"><Button disabled={pendiente || !comprobado || !nota.trim()} onClick={() => revisar("verificada")}>{t("Verificar y publicar empresa")}</Button><Button variant="outline" disabled={pendiente || !nota.trim()} onClick={() => revisar("requiere_informacion")}>{t("Solicitar información")}</Button></div>
    </CardContent></Card>}
  </div>
}

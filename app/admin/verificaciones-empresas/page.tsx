"use client"

import { useEffect, useState, useTransition } from "react"
import { obtenerVerificacionesEmpresas, descargarVerificacionEmpresa, revisarVerificacionEmpresa, retirarVerificacionEmpresa } from "@/app/actions/empresa-workspace"
import { verificarEmpresaConIdentidadCobros } from "@/app/actions/empresa-identidad-cobros"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useT } from "@/components/idioma-provider"

type Expediente = {
  id: string; empresaId: string; empresaNombre: string; nif: string; estado: string; metodo: string;
  identidadCobrosPendiente?: boolean; cifCobrosAnterior?: string; cuentaStripe?: string;
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
  const [cobrosComprobados, setCobrosComprobados] = useState(false)
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
  const retirando = actual?.estado === "verificada"
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
        const resultado = decision === "verificada" && actual.identidadCobrosPendiente
          ? await verificarEmpresaConIdentidadCobros({ empresaId: actual.empresaId, verificacionId: actual.id, cif: actual.nif, cuentaStripe: actual.cuentaStripe || "", confirmacion: cobrosComprobados, nota })
          : await revisarVerificacionEmpresa({ empresaId: actual.empresaId, verificacionId: actual.id, decision, nota })
        if (resultado.error) { setError(resultado.error); return }
        setSeleccion(""); setNota(""); setComprobado(false); setCobrosComprobados(false); setRevision(v => v + 1)
      } catch { setError("No se pudo guardar la revisión.") }
    })
  }
  function retirar() {
    if (!actual || !comprobado || nota.trim().length < 8) return
    iniciar(async () => {
      try {
        const resultado = await retirarVerificacionEmpresa({ empresaId: actual.empresaId, verificacionId: actual.id, motivo: nota })
        if (resultado.error) { setError(resultado.error); return }
        setError(""); setSeleccion(""); setNota(""); setComprobado(false); setCobrosComprobados(false); setRevision(v => v + 1)
      } catch { setError("No se pudo guardar la retirada de verificación.") }
    })
  }
  return <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <div><h1 className="text-2xl font-semibold">{t("Verificación de empresas")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("Revisa la identidad de la empresa y las facultades de su representante antes de publicar el perfil.")}</p></div>
    {error && <p role="alert" className="text-destructive">{t(error)}</p>}
    {cargando ? <p role="status">{t("Cargando...")}</p> : expedientes.length === 0 ? <p>{t("No hay solicitudes de verificación de empresas.")}</p> : <div className="grid gap-4 md:grid-cols-2">
      {expedientes.map(expediente => <Card key={expediente.empresaId}><CardHeader><CardTitle className="break-words text-lg">{expediente.empresaNombre}</CardTitle><Badge variant="outline" className="w-fit">{t(expediente.estado === "en_revision" ? "En revisión" : expediente.estado === "verificada" ? "Verificada" : "Requiere información")}</Badge></CardHeader>
        <CardContent className="space-y-3 text-sm"><p>{t("NIF")}: {expediente.nif}</p><p>{expediente.representanteNombre} · {expediente.cargoLegal}</p><p className="break-all">{expediente.documentoNombre}</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pendiente} onClick={() => descargar(expediente.empresaId)}>{t("Descargar documento")}</Button><Button disabled={pendiente || expediente.estado !== "en_revision"} onClick={() => { setSeleccion(expediente.empresaId); setNota(expediente.notaRevision || ""); setComprobado(false); setCobrosComprobados(false); setError("") }}>{t("Revisar")}</Button>{expediente.estado === "verificada" && <Button variant="outline" disabled={pendiente} onClick={() => { setSeleccion(expediente.empresaId); setNota(""); setComprobado(false); setCobrosComprobados(false); setError("") }}>{t("Retirar verificación")}</Button>}</div>
        </CardContent></Card>)}
    </div>}
    {actual && <Card><CardHeader><CardTitle>{actual.empresaNombre}</CardTitle></CardHeader><CardContent className="space-y-4">
      {retirando && <p className="text-sm text-muted-foreground">{t("La empresa deberá acreditar de nuevo su representación. Se bloquean nuevas solicitudes, ofertas y contrataciones; los contratos existentes siguen disponibles para gestionarlos y liquidarlos.")}</p>}
      {!retirando && actual.identidadCobrosPendiente && <section className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <h2 className="font-semibold">{t("Comprobar la identidad de cobros")}</h2>
        <p className="text-sm text-muted-foreground">{t("El CIF ha cambiado y existe una cuenta de cobros vinculada. Comprueba en Stripe que la entidad titular corresponde al CIF actual antes de publicar la empresa. Si no coincide, solicita información y mantén la revisión abierta.")}</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">{t("CIF anterior")}</dt><dd>{actual.cifCobrosAnterior}</dd></div><div><dt className="text-muted-foreground">{t("CIF actual")}</dt><dd className="font-semibold">{actual.nif}</dd></div></dl>
        {actual.cuentaStripe && /^acct_[A-Za-z0-9_]+$/.test(actual.cuentaStripe) && <a href={`https://dashboard.stripe.com/connect/accounts/${encodeURIComponent(actual.cuentaStripe)}`} target="_blank" rel="noopener noreferrer" className="inline-flex break-all text-sm font-medium text-primary underline underline-offset-4">{t("Abrir cuenta vinculada en Stripe")} · {actual.cuentaStripe}</a>}
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={cobrosComprobados} disabled={pendiente} onChange={e => setCobrosComprobados(e.target.checked)} className="mt-1" /><span>{t("He contrastado el CIF actual con la identidad legal de esta cuenta en Stripe y documento las evidencias en la nota de revisión.")}</span></label>
        <p className="text-xs text-muted-foreground">{t("Esta confirmación no modifica la cuenta Stripe ni los destinos de los contratos anteriores.")}</p>
      </section>}
      <div className="space-y-2"><Label htmlFor="nota-empresa">{t(retirando ? "Motivo de la retirada" : "Resultado de la revisión")}</Label><Textarea disabled={pendiente} id="nota-empresa" value={nota} onChange={e => setNota(e.target.value)} maxLength={2000} placeholder={t("Indica qué se ha comprobado o qué información falta.")} /></div>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" disabled={pendiente} className="mt-1" checked={comprobado} onChange={e => setComprobado(e.target.checked)} />{t(retirando ? "He revisado el motivo y confirmo la retirada de esta verificación." : "He comprobado la identidad de la empresa y la representación de esta persona. Esta revisión no acredita licencias ni especialidades profesionales.")}</label>
      <div className="flex flex-wrap gap-2">{retirando ? <Button variant="destructive" disabled={pendiente || !comprobado || nota.trim().length < 8} onClick={retirar}>{t("Confirmar retirada")}</Button> : <><Button disabled={pendiente || !comprobado || !nota.trim() || (actual.identidadCobrosPendiente && (!cobrosComprobados || nota.trim().length < 20))} onClick={() => revisar("verificada")}>{t("Verificar y publicar empresa")}</Button><Button variant="outline" disabled={pendiente || !nota.trim()} onClick={() => revisar("requiere_informacion")}>{t("Solicitar información")}</Button></>}<Button variant="ghost" disabled={pendiente} onClick={() => { setSeleccion(""); setNota(""); setComprobado(false) }}>{t("Cancelar")}</Button></div>
    </CardContent></Card>}
  </div>
}

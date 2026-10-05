"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { FileText, Loader2, ShieldCheck } from "lucide-react"
import { descargarVerificacionEmpresa, revisarVerificacionEmpresa, solicitarVerificacionEmpresa } from "@/app/actions/empresa-workspace"
import { useIdioma, useT } from "@/components/idioma-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { localeDe } from "@/lib/i18n"
import type { EspacioEmpresa } from "@/lib/empresas/types"

export const ESTADOS_VERIFICACION_EMPRESA = { borrador: "Pendiente de acreditar", en_revision: "En revisión", verificada: "Empresa verificada", requiere_informacion: "Necesita información" }

export function VerificacionEmpresa({ espacio }: { espacio: EspacioEmpresa }) {
  const t = useT()
  const { idioma } = useIdioma()
  const router = useRouter()
  const { empresa, verificacion, miembroActual, actor } = espacio
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [nota, setNota] = useState("")
  const principal = miembroActual?.rol === "principal"
  const verificada = empresa.estadoVerificacion === "verificada"
  const puedeDocumento = principal || actor.plataformaAdmin

  function presentar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const datos = new FormData(event.currentTarget)
    const documento = datos.get("documento")
    if (!(documento instanceof File) || documento.size > 5 * 1024 * 1024) { setError("Adjunta un documento PDF de hasta 5 MB."); return }
    setError(""); setMensaje("")
    startTransition(async () => {
      try {
        const result = await solicitarVerificacionEmpresa(datos)
        if (result.error) { setError(result.error); return }
        setMensaje("Documentación enviada. Diime revisará la representación antes de publicar la empresa."); router.refresh()
      } catch { setError("No se pudo enviar la documentación. Vuelve a intentarlo.") }
    })
  }

  function revisar(decision: "verificada" | "requiere_informacion") {
    setError(""); setMensaje("")
    startTransition(async () => {
      try {
        const result = await revisarVerificacionEmpresa({ decision, nota, empresaId: empresa.id })
        if (result.error) { setError(result.error); return }
        setMensaje("Revisión guardada."); router.refresh()
      } catch { setError("No se pudo completar la acción. Vuelve a intentarlo.") }
    })
  }

  function descargar() {
    setError("")
    startTransition(async () => {
      try {
        const result = await descargarVerificacionEmpresa(empresa.id)
        if (result.error || !result.data) { setError(result.error || "No se pudo descargar el documento."); return }
        const bytes = Uint8Array.from(atob(result.data.base64), (char) => char.charCodeAt(0))
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))
        const link = document.createElement("a")
        link.href = url; link.download = result.data.nombre; link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      } catch { setError("No se pudo descargar el documento.") }
    })
  }

  return <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="size-5" />{t("Verificación de la empresa")}</CardTitle><CardDescription>{t("La cuenta principal y la representación legal se acreditan por separado.")}</CardDescription></CardHeader><CardContent className="space-y-5">
    <div className="rounded-xl border bg-muted/30 p-4"><Badge variant={verificada ? "default" : "secondary"}>{t(ESTADOS_VERIFICACION_EMPRESA[empresa.estadoVerificacion])}</Badge><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(verificada ? "Diime ha revisado la identidad de la empresa y su representación. El perfil puede mostrarse al público." : empresa.estadoVerificacion === "en_revision" ? "Tu documentación está en revisión. Puedes seguir preparando el perfil y el equipo." : "Completa la acreditación para publicar el perfil y operar en nombre de la empresa.")}</p>{verificacion?.notaRevision && <p className="mt-3 border-t pt-3 text-sm"><strong>{t("Observación de Diime")}: </strong>{verificacion.notaRevision}</p>}</div>
    <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">{t("Responsable de la cuenta Diime")}</dt><dd className="mt-1 font-medium">{espacio.miembros.find((m) => m.rol === "principal")?.nombre || t("Sin asignar")}</dd></div>{puedeDocumento && <div><dt className="text-xs text-muted-foreground">{t(verificada ? "Representante legal acreditado" : "Representante legal declarado")}</dt><dd className="mt-1 font-medium">{verificacion?.representanteNombre || empresa.representanteNombre || t("Pendiente de acreditación")}</dd>{(verificacion?.cargoLegal || empresa.cargoLegal) && <dd className="mt-1 text-xs text-muted-foreground">{verificacion?.cargoLegal || empresa.cargoLegal}</dd>}</div>}</dl>
    {verificacion && puedeDocumento && <div className="flex items-start gap-3 rounded-lg border p-3"><FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="break-all text-sm font-medium">{verificacion.documentoNombre}</p><p className="mt-1 text-xs text-muted-foreground">{t("Presentado el")} {new Date(verificacion.creadaEn).toLocaleDateString(localeDe(idioma))} · {t("Acceso restringido")}</p><Button variant="link" size="sm" className="h-auto px-0 pt-2" onClick={descargar} disabled={pending}>{t("Descargar documento para revisión")}</Button></div></div>}
    {principal && !verificada && empresa.estadoVerificacion !== "en_revision" && <form onSubmit={presentar} className="space-y-4 border-t pt-5"><h3 className="font-semibold">{t("Documentación de representación")}</h3><p className="text-sm text-muted-foreground">{t("Adjunta una autorización para la cuenta principal y la acreditación del representante en un único PDF.")}</p><input type="hidden" name="metodo" value="documental" /><fieldset disabled={pending} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="representante-nombre">{t("Nombre del representante legal")}</Label><Input id="representante-nombre" name="representanteNombre" required minLength={3} maxLength={100} defaultValue={verificacion?.representanteNombre || empresa.representanteNombre} /></div><div className="space-y-2"><Label htmlFor="representante-cargo">{t("Cargo o facultades de representación")}</Label><Input id="representante-cargo" name="cargoLegal" required minLength={2} maxLength={100} defaultValue={verificacion?.cargoLegal || empresa.cargoLegal} /></div></div><div className="space-y-2"><Label htmlFor="representante-documento">{t("Autorización y acreditación")}</Label><Input id="representante-documento" name="documento" type="file" accept="application/pdf,.pdf" className="h-auto min-h-10 py-2 text-xs" required /><p className="text-xs text-muted-foreground">{t("PDF de hasta 5 MB. Solo visible para el proceso de revisión.")}</p></div><label className="flex items-start gap-3 rounded-lg bg-muted/40 p-3 text-sm leading-relaxed"><input type="checkbox" name="consentimiento" value="true" required className="mt-1 size-4 shrink-0" /><span>{t("Confirmo que tengo autorización para aportar esta documentación y solicitar la gestión de la empresa en Diime.")}</span></label></fieldset><Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />}{t("Enviar a revisión")}</Button></form>}
    {actor.plataformaAdmin && verificacion?.estado === "en_revision" && <div className="space-y-3 border-t pt-5"><h3 className="font-semibold">{t("Revisión de Diime")}</h3><Label htmlFor="revision-nota">{t("Nota de revisión")}</Label><Textarea id="revision-nota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder={t("Explica las comprobaciones o qué documentación falta.")} disabled={pending} /><div className="flex flex-col gap-3 sm:flex-row"><Button disabled={pending || !nota.trim()} onClick={() => revisar("verificada")}>{t("Aprobar verificación")}</Button><Button variant="outline" disabled={pending || !nota.trim()} onClick={() => revisar("requiere_informacion")}>{t("Pedir información")}</Button></div></div>}
    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}{mensaje && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{t(mensaje)}</p>}
  </CardContent></Card>
}

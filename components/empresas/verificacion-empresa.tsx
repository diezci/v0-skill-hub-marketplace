"use client"

import { useRef, useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Check, CheckCircle2, Clock3, FileText, Loader2, LockKeyhole, ShieldCheck, UploadCloud, X } from "lucide-react"
import { descargarVerificacionEmpresa, revisarVerificacionEmpresa, solicitarVerificacionEmpresa } from "@/app/actions/empresa-workspace"
import { useIdioma, useT } from "@/components/idioma-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CARGOS_REPRESENTACION, cargoRepresentacionValido } from "@/lib/empresas/representacion"
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
  const archivoRef = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const cargoPrevio = verificacion?.cargoLegal || empresa.cargoLegal
  const [cargoLegal, setCargoLegal] = useState(cargoRepresentacionValido(cargoPrevio) ? cargoPrevio : "")
  const ayudaCargo = CARGOS_REPRESENTACION.find((cargo) => cargo.valor === cargoLegal)?.ayuda
  const principal = miembroActual?.rol === "principal"
  const verificada = empresa.estadoVerificacion === "verificada"
  const puedeDocumento = principal || actor.plataformaAdmin

  function presentar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const datos = new FormData(event.currentTarget)
    const documento = datos.get("documento")
    if (!(documento instanceof File) || documento.size < 6 || documento.size > 5 * 1024 * 1024) { setError("Adjunta un documento PDF de hasta 5 MB."); return }
    setError(""); setMensaje("")
    startTransition(async () => {
      try {
        const result = await solicitarVerificacionEmpresa(datos)
        if (result.error) { setError(result.error); return }
        setArchivo(null); if (archivoRef.current) archivoRef.current.value = ""
        setMensaje("Documentación enviada. Diime revisará la representación antes de publicar la empresa."); router.refresh()
      } catch { setError("No se pudo enviar la documentación. Vuelve a intentarlo.") }
    })
  }

  function revisar(decision: "verificada" | "requiere_informacion") {
    setError(""); setMensaje("")
    startTransition(async () => {
      try {
        const result = await revisarVerificacionEmpresa({ decision, nota, empresaId: empresa.id, verificacionId: verificacion?.id })
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

  return <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
    <Card className="min-w-0 overflow-hidden rounded-2xl border bg-background py-0 shadow-sm">
      <CardHeader className="border-b bg-muted/20 p-6 sm:p-8">
        <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck aria-hidden="true" className="size-6" /></div>
        <CardTitle className="text-2xl font-semibold tracking-tight">{t("Verificación de la empresa")}</CardTitle>
        <CardDescription className="max-w-xl leading-relaxed">{t("Acredita quién representa a tu empresa para generar confianza desde el primer contacto.")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-6 sm:p-8">
        <div className={`rounded-xl border p-4 ${verificada ? "border-primary/20 bg-primary/5" : "bg-muted/30"}`}>
          <div className="flex flex-wrap items-center gap-2">{verificada ? <CheckCircle2 className="size-4 text-primary" aria-hidden="true" /> : <Clock3 className="size-4 text-muted-foreground" aria-hidden="true" />}<Badge variant="outline" className="border-0 p-0 text-sm">{t(ESTADOS_VERIFICACION_EMPRESA[empresa.estadoVerificacion])}</Badge></div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(verificada ? "Diime ha revisado la identidad de la empresa y su representación. El perfil puede mostrarse al público." : empresa.estadoVerificacion === "en_revision" ? "Tu documentación está en revisión. Puedes seguir preparando el perfil y el equipo." : "Completa la acreditación para publicar el perfil y operar en nombre de la empresa.")}</p>
          {verificacion?.notaRevision && <p className="mt-3 border-t pt-3 text-sm"><strong>{t("Observación de Diime")}: </strong>{verificacion.notaRevision}</p>}
        </div>
        {empresa.estadoVerificacion === "requiere_informacion" && <p className="text-sm leading-relaxed text-muted-foreground">{t("Hasta completar la acreditación no puedes iniciar nuevas operaciones. Los contratos existentes siguen disponibles para gestionarlos y liquidarlos.")}</p>}
        <dl className="grid gap-5 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">{t("Responsable de la cuenta Diime")}</dt><dd className="mt-1.5 font-medium">{espacio.miembros.find((m) => m.rol === "principal")?.nombre || t("Sin asignar")}</dd></div>
          {puedeDocumento && <div><dt className="text-xs text-muted-foreground">{t(verificada ? "Representante legal acreditado" : "Representante legal declarado")}</dt><dd className="mt-1.5 font-medium">{verificacion?.representanteNombre || empresa.representanteNombre || t("Pendiente de acreditación")}</dd>{cargoPrevio && <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(cargoPrevio)}</dd>}</div>}
        </dl>
        {verificacion && puedeDocumento && <div className="flex items-start gap-3 rounded-xl border p-4"><FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><div className="min-w-0"><p className="break-all text-sm font-medium">{verificacion.documentoNombre}</p><p className="mt-1 text-xs text-muted-foreground">{t("Presentado el")} {new Date(verificacion.creadaEn).toLocaleDateString(localeDe(idioma))} · {t("Acceso restringido")}</p><Button variant="link" size="sm" className="h-auto px-0 pt-2" onClick={descargar} disabled={pending}>{t("Descargar documento para revisión")}</Button></div></div>}
        {principal && !verificada && empresa.estadoVerificacion !== "en_revision" && <form onSubmit={presentar} className="space-y-6 border-t pt-6">
          <div><h3 className="text-base font-semibold">{t("Documentación de representación")}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t("Adjunta una autorización para la cuenta principal y la acreditación del representante en un único PDF.")}</p></div>
          <input type="hidden" name="metodo" value="documental" />
          <fieldset disabled={pending} className="space-y-5">
            <div className="space-y-2"><Label htmlFor="representante-nombre">{t("Nombre del representante legal")}</Label><Input id="representante-nombre" name="representanteNombre" required minLength={3} maxLength={100} autoComplete="name" defaultValue={verificacion?.representanteNombre || empresa.representanteNombre} className="h-11 bg-background" /></div>
            <div className="space-y-2"><Label htmlFor="representante-cargo">{t("Cargo o facultades de representación")}</Label><select id="representante-cargo" name="cargoLegal" required value={cargoLegal} onChange={(event) => setCargoLegal(event.target.value)} aria-describedby="cargo-ayuda" className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><option value="" disabled>{t("Selecciona el título de representación")}</option>{CARGOS_REPRESENTACION.map((cargo) => <option key={cargo.valor} value={cargo.valor}>{t(cargo.valor)}</option>)}</select><p id="cargo-ayuda" className="text-xs leading-relaxed text-muted-foreground">{t(ayudaCargo || "Selecciona la opción que conste en el nombramiento o poder vigente.")}</p></div>
            <div className="space-y-2">
              <Label htmlFor="representante-documento">{t("Autorización y acreditación")}</Label>
              <div className={`relative rounded-xl border-2 border-dashed p-5 transition-colors focus-within:ring-2 focus-within:ring-ring ${archivo ? "border-primary/35 bg-primary/5" : "border-border bg-muted/20 hover:border-primary/40"}`}>
                <input ref={archivoRef} id="representante-documento" name="documento" type="file" accept="application/pdf,.pdf" required aria-describedby="documento-ayuda" className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait" onChange={(event) => {
                  const file = event.target.files?.[0] || null
                  if (file && (file.size < 6 || file.size > 5 * 1024 * 1024 || (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf"))) { event.target.value = ""; setArchivo(null); setError("Adjunta un documento PDF de hasta 5 MB."); return }
                  setArchivo(file); setError("")
                }} />
                <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background text-primary">{archivo ? <FileText className="size-6" aria-hidden="true" /> : <UploadCloud className="size-6" aria-hidden="true" />}</span>
                  <div className="min-w-0 flex-1"><p className="break-all text-sm font-semibold">{archivo?.name || t("Seleccionar documento PDF")}</p><p id="documento-ayuda" className="mt-1 text-xs leading-relaxed text-muted-foreground">{archivo ? `${Math.max(1, Math.ceil(archivo.size / 1024))} KB · ${t("Pulsa para cambiar el archivo")}` : t("PDF de hasta 5 MB. Solo visible para el proceso de revisión.")}</p></div>
                  <span className="rounded-lg border bg-background px-3 py-2 text-xs font-medium">{t(archivo ? "Cambiar archivo" : "Elegir archivo")}</span>
                </div>
              </div>
              {archivo && <Button type="button" variant="ghost" size="sm" onClick={() => { if (archivoRef.current) archivoRef.current.value = ""; setArchivo(null) }}><X className="size-3.5" aria-hidden="true" />{t("Quitar archivo")}</Button>}
            </div>
            <label className="flex items-start gap-3 rounded-xl bg-muted/40 p-4 text-sm leading-relaxed"><input type="checkbox" name="consentimiento" value="true" required className="mt-1 size-4 shrink-0 accent-primary" /><span>{t("Confirmo que tengo autorización para aportar esta documentación y solicitar la gestión de la empresa en Diime.")}</span></label>
          </fieldset>
          <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><LockKeyhole className="size-3.5" aria-hidden="true" />{t("Documentación privada")}</p><Button type="submit" disabled={pending} className="h-11 px-5">{pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{t("Enviar a revisión")}</Button></div>
        </form>}
        {!principal && !actor.plataformaAdmin && <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">{t("Solo el responsable principal puede enviar la documentación de representación.")}</p>}
        {actor.plataformaAdmin && verificacion?.estado === "en_revision" && <div className="space-y-3 border-t pt-5"><h3 className="font-semibold">{t("Revisión de Diime")}</h3><Label htmlFor="revision-nota">{t("Nota de revisión")}</Label><Textarea id="revision-nota" value={nota} onChange={(event) => setNota(event.target.value)} placeholder={t("Explica las comprobaciones o qué documentación falta.")} disabled={pending} /><div className="flex flex-col gap-3 sm:flex-row"><Button disabled={pending || !nota.trim()} onClick={() => revisar("verificada")}>{t("Aprobar verificación")}</Button><Button variant="outline" disabled={pending || !nota.trim()} onClick={() => revisar("requiere_informacion")}>{t("Pedir información")}</Button></div></div>}
        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t(error)}</p>}{mensaje && <p role="status" className="rounded-lg bg-primary/5 p-3 text-sm text-primary">{t(mensaje)}</p>}
      </CardContent>
    </Card>
    <aside className="space-y-5 rounded-2xl border bg-background p-6"><h3 className="font-semibold">{t("Una empresa acreditada")}</h3><ol className="space-y-5">{[
      ["01", "Identifica al representante", "Selecciona su cargo y comprueba que sus facultades permiten gestionar la empresa."],
      ["02", "Adjunta la documentación", "Incluye el nombramiento o poder vigente y la autorización necesaria."],
      ["03", "Revisión del equipo Diime", "Comprobaremos la identidad y las facultades antes de acreditar el perfil."],
    ].map(([number, title, description]) => <li key={number} className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">{number}</span><div><p className="text-sm font-medium">{t(title)}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(description)}</p></div></li>)}</ol><p className="flex items-start gap-2 border-t pt-4 text-xs leading-relaxed text-muted-foreground"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />{t("El rol de administrador de la cuenta no acredita la representación legal de la empresa.")}</p></aside>
  </div>
}

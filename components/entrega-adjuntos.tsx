"use client"

import { useId, useRef, useState, type ChangeEvent } from "react"
import { AlertTriangle, FileText, Loader2, Paperclip, X } from "lucide-react"
import { useIdioma } from "@/components/idioma-provider"
import { nombreDeAdjunto } from "@/components/adjuntos-lista"
import { Button } from "@/components/ui/button"
import { validarArchivo } from "@/lib/archivos"
import { MAX_ADJUNTOS_ENTREGA, MAX_ARCHIVO_ENTREGA_BYTES } from "@/lib/entregas"
import { uploadFile } from "@/lib/upload-helpers"

const MAX_ADJUNTOS = MAX_ADJUNTOS_ENTREGA
const FORMATOS = ".jpg,.jpeg,.png,.gif,.webp,.avif,.heic,.heif,.pdf,.txt,.doc,.docx,.xls,.xlsx"

export function EntregaAdjuntos({ archivos, onChange, disabled = false, onUploadingChange, context = "entrega" }: {
  context?: "entrega" | "rechazo"
  archivos: string[]
  onChange: (archivos: string[]) => void
  disabled?: boolean
  onUploadingChange?: (uploading: boolean) => void
}) {
  const { t, idioma } = useIdioma()
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadingRef = useRef(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")

  async function adjuntar(event: ChangeEvent<HTMLInputElement>) {
    const seleccionados = Array.from(event.target.files || [])
    event.target.value = ""
    if (disabled || uploadingRef.current || seleccionados.length === 0) return
    setError("")
    if (archivos.length + seleccionados.length > MAX_ADJUNTOS) {
      setError(t("Puedes adjuntar un máximo de {count} archivos.", { count: MAX_ADJUNTOS }))
      return
    }
    if (seleccionados.some((file) => file.size > MAX_ARCHIVO_ENTREGA_BYTES)) {
      setError(t("Cada archivo puede ocupar como máximo 4 MB."))
      return
    }

    uploadingRef.current = true
    setUploading(true)
    onUploadingChange?.(true)
    try {
      // Validate the whole selection before uploading so invalid files are not
      // silently omitted from the delivery.
      const validaciones = await Promise.all(seleccionados.map((file) => validarArchivo(file)))
      const invalido = validaciones.find((resultado) => "error" in resultado)
      if (invalido && "error" in invalido) {
        setError(t(invalido.error))
        return
      }
      const resultados = await Promise.all(seleccionados.map((file) => uploadFile(file)))
      const subidos = resultados.flatMap((resultado) => resultado ? [resultado.url] : [])
      onChange([...archivos, ...subidos])
      const fallidos = seleccionados.filter((_, indice) => !resultados[indice])
      if (fallidos.length > 0) {
        setError(t(context === "rechazo" ? "No se pudieron adjuntar: {names}. Vuelve a seleccionarlos antes de rechazar la entrega." : "No se pudieron adjuntar: {names}. Vuelve a seleccionarlos antes de entregar.", {
          names: fallidos.map((file) => file.name).join(", "),
        }))
      }
    } catch {
      setError(t(context === "rechazo" ? "No se pudieron subir los archivos. Vuelve a intentarlo antes de rechazar la entrega." : "No se pudieron subir los archivos. Vuelve a intentarlo antes de entregar."))
    } finally {
      uploadingRef.current = false
      setUploading(false)
      onUploadingChange?.(false)
    }
  }

  return (
    <div className="min-w-0 space-y-3">
      <div role="note" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <p>{t(context === "rechazo" ? "Para facilitar la revisión, te recomendamos adjuntar evidencias de los problemas detectados, como fotos del resultado o documentos que muestren qué no cumple lo acordado." : "Para evitar problemas, te recomendamos adjuntar evidencias de que el trabajo está completado, como fotos del resultado o documentos de entrega.")}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p id={`${id}-label`} className="text-sm font-medium">{t(context === "rechazo" ? "Archivos del rechazo (opcional)" : "Archivos de la entrega (opcional)")}</p>
        <span className="shrink-0 text-xs text-muted-foreground">{archivos.length}/{MAX_ADJUNTOS}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={FORMATOS}
        className="sr-only"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-help`}
        disabled={disabled || uploading || archivos.length >= MAX_ADJUNTOS}
        onChange={adjuntar}
      />
      <Button type="button" variant="outline" disabled={disabled || uploading || archivos.length >= MAX_ADJUNTOS} onClick={() => inputRef.current?.click()}>
        {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}
        {uploading ? t("Subiendo archivos...") : t("Adjuntar archivos")}
      </Button>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">{t("Hasta 5 imágenes, PDF o documentos de Word, Excel o texto. Máximo 4 MB por archivo.")}</p>
      {archivos.length > 0 && <ul className="space-y-2">
        {archivos.map((url, indice) => {
          const nombre = nombreDeAdjunto(url, indice, idioma)
          return <li key={url} className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm hover:underline" title={nombre}>{nombre}</a>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={disabled || uploading} onClick={() => onChange(archivos.filter((_, i) => i !== indice))} aria-label={t("Quitar {name}", { name: nombre })}>
              <X className="h-4 w-4" />
            </Button>
          </li>
        })}
      </ul>}
      {uploading && <p role="status" className="text-xs text-muted-foreground">{t(context === "rechazo" ? "Espera a que terminen de subir los archivos antes de rechazar la entrega." : "Espera a que terminen de subir los archivos antes de entregar.")}</p>}
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    </div>
  )
}

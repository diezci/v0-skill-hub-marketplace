"use client"

import { type ChangeEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Loader2, XCircle, Check, Ban, FileText, Paperclip, X, Pencil, Undo2 } from "lucide-react"
import {
  editarSolicitudCancelacion,
  retirarSolicitudCancelacion,
  solicitarCancelacion,
  responderCancelacion,
} from "@/app/actions/trabajos"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { uploadFile } from "@/lib/upload-helpers"
import { AdjuntosLista, nombreDeAdjunto } from "@/components/adjuntos-lista"

const MAX_ADJUNTOS = 5
const MAX_BYTES_POR_ARCHIVO = 10 * 1024 * 1024

interface CancelacionTrabajoProps {
  trabajo: {
    id: string
    estado?: string
    cliente_id?: string
    profesional_id?: string
    cancelacion_estado?: string | null
    cancelacion_solicitada_por?: string | null
    cancelacion_razon?: string | null
    cancelacion_adjuntos_solicitante?: string[] | null
    cancelacion_respuesta_razon?: string | null
    cancelacion_adjuntos_respuesta?: string[] | null
  }
  onChange?: () => void
  /**
   * Qué parte pintar. Este componente devuelve dos cosas muy distintas: un
   * aviso con varios párrafos y dos botones, o un único botón pequeño.
   *
   * En Gestión de proyectos los botones viven en una columna lateral de 224 px,
   * y el aviso metido ahí salía a dos palabras por línea. Con `variante` la
   * página puede poner el botón en la columna estrecha y el aviso a lo ancho.
   *
   * Sin `variante` se comporta como siempre (lo usa Mis Solicitudes, donde todo va
   * en el cuerpo de la tarjeta y hay sitio de sobra).
   */
  variante?: "aviso" | "boton"
}

export function CancelacionTrabajo({ trabajo, onChange, variante }: CancelacionTrabajoProps) {
  const [userId, setUserId] = useState<string | null>(null)
  const [openSolicitar, setOpenSolicitar] = useState(false)
  const [openRechazar, setOpenRechazar] = useState(false)
  const [openEditar, setOpenEditar] = useState(false)
  const [openRetirar, setOpenRetirar] = useState(false)
  const [razon, setRazon] = useState("")
  const [razonRespuesta, setRazonRespuesta] = useState("")
  const [razonEdicion, setRazonEdicion] = useState("")
  const [archivosSolicitud, setArchivosSolicitud] = useState<File[]>([])
  const [archivosRespuesta, setArchivosRespuesta] = useState<File[]>([])
  const [archivosEdicion, setArchivosEdicion] = useState<File[]>([])
  const [adjuntosConservados, setAdjuntosConservados] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    try {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    } catch {
      // sin sesión: no se muestra nada
    }
  }, [])

  const refrescar = () => {
    onChange?.()
    router.refresh()
  }

  const agregarArchivos = (
    event: ChangeEvent<HTMLInputElement>,
    actuales: File[],
    actualizar: (archivos: File[]) => void,
    ocupados = 0,
  ) => {
    const seleccionados = Array.from(event.target.files || [])
    event.target.value = ""
    const demasiadoGrandes = seleccionados.filter((archivo) => archivo.size > MAX_BYTES_POR_ARCHIVO)
    if (demasiadoGrandes.length > 0) {
      toast({
        title: "Archivo demasiado grande",
        description: "Cada archivo puede ocupar como máximo 10 MB.",
        variant: "destructive",
      })
    }
    const admitidos = seleccionados.filter((archivo) => archivo.size <= MAX_BYTES_POR_ARCHIVO)
    const limiteNuevos = Math.max(0, MAX_ADJUNTOS - ocupados)
    if (actuales.length + admitidos.length > limiteNuevos) {
      toast({
        title: "Demasiados archivos",
        description: `Puedes adjuntar un máximo de ${MAX_ADJUNTOS} archivos.`,
        variant: "destructive",
      })
    }
    actualizar([...actuales, ...admitidos].slice(0, limiteNuevos))
  }

  const subirAdjuntos = async (archivos: File[]) => {
    const resultados = await Promise.all(archivos.map((archivo) => uploadFile(archivo)))
    if (resultados.some((resultado) => resultado === null)) {
      throw new Error("No se pudieron subir todos los archivos. Inténtalo de nuevo o quita los adjuntos.")
    }
    return resultados.map((resultado) => resultado!.url)
  }

  const handleSolicitar = async () => {
    if (!razon.trim()) {
      toast({
        title: "Falta el motivo",
        description: "Explica por qué quieres cancelar el servicio.",
        variant: "destructive",
      })
      return
    }
    setSubmitting(true)
    try {
      const adjuntos = await subirAdjuntos(archivosSolicitud)
      const res = await solicitarCancelacion(trabajo.id, razon.trim(), adjuntos)
      if (res.error) {
        toast({ title: "No se pudo solicitar", description: res.error, variant: "destructive" })
      } else {
        toast({
          title: "Cancelación solicitada",
          description: "La otra parte recibirá tus argumentos y archivos para aceptarla o rechazarla.",
        })
        setOpenSolicitar(false)
        setRazon("")
        setArchivosSolicitud([])
        refrescar()
      }
    } catch (error) {
      toast({
        title: "No se pudieron subir los archivos",
        description: error instanceof Error ? error.message : "Inténtalo de nuevo.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleResponder = async (aceptar: boolean) => {
    if (!aceptar && !razonRespuesta.trim()) {
      toast({
        title: "Faltan tus argumentos",
        description: "Explica por qué rechazas la cancelación para que el equipo de Diime pueda decidir.",
        variant: "destructive",
      })
      return
    }
    setSubmitting(true)
    try {
      const adjuntos = aceptar ? [] : await subirAdjuntos(archivosRespuesta)
      const res = await responderCancelacion(trabajo.id, aceptar, aceptar ? "" : razonRespuesta.trim(), adjuntos)
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" })
      } else {
        toast({
          title: aceptar ? "Cancelación aceptada" : "Cancelación rechazada: disputa abierta",
          description: aceptar
            ? "El trabajo ha quedado cancelado. Si el cliente había pagado, se le reembolsa íntegramente."
            : "Tus argumentos y archivos se han enviado al equipo de Diime para que resuelva.",
        })
        setOpenRechazar(false)
        setRazonRespuesta("")
        setArchivosRespuesta([])
        refrescar()
      }
    } catch (error) {
      toast({
        title: "No se pudieron subir los archivos",
        description: error instanceof Error ? error.message : "Inténtalo de nuevo.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const abrirEdicion = () => {
    setRazonEdicion(trabajo.cancelacion_razon || "")
    setAdjuntosConservados(
      Array.isArray(trabajo.cancelacion_adjuntos_solicitante)
        ? [...trabajo.cancelacion_adjuntos_solicitante]
        : [],
    )
    setArchivosEdicion([])
    setOpenEditar(true)
  }

  const handleEditar = async () => {
    if (!razonEdicion.trim()) {
      toast({
        title: "Falta el motivo",
        description: "Explica por qué quieres cancelar el servicio.",
        variant: "destructive",
      })
      return
    }
    setSubmitting(true)
    try {
      const nuevosAdjuntos = await subirAdjuntos(archivosEdicion)
      const res = await editarSolicitudCancelacion(trabajo.id, razonEdicion.trim(), [
        ...adjuntosConservados,
        ...nuevosAdjuntos,
      ])
      if (res.error) {
        toast({ title: "No se pudo actualizar", description: res.error, variant: "destructive" })
      } else {
        toast({
          title: "Solicitud actualizada",
          description: "La otra parte podrá ver tus nuevos argumentos y archivos.",
        })
        setOpenEditar(false)
        setArchivosEdicion([])
        refrescar()
      }
    } catch (error) {
      toast({
        title: "No se pudieron subir los archivos",
        description: error instanceof Error ? error.message : "Inténtalo de nuevo.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetirar = async () => {
    setSubmitting(true)
    try {
      const res = await retirarSolicitudCancelacion(trabajo.id)
      if (res.error) {
        toast({ title: "No se pudo retirar", description: res.error, variant: "destructive" })
      } else {
        toast({
          title: "Solicitud retirada",
          description: "El servicio continúa activo y la otra parte ha sido avisada.",
        })
        setOpenRetirar(false)
        refrescar()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const selectorAdjuntos = (
    id: string,
    archivos: File[],
    actualizar: (archivos: File[]) => void,
    ocupados = 0,
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium">Pruebas o documentos (opcional)</label>
        <span className="text-xs text-muted-foreground">{ocupados + archivos.length}/{MAX_ADJUNTOS}</span>
      </div>
      <input
        id={id}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        className="sr-only"
        onChange={(event) => agregarArchivos(event, archivos, actualizar, ocupados)}
        disabled={submitting || ocupados + archivos.length >= MAX_ADJUNTOS}
      />
      <Button asChild variant="outline" size="sm" className="w-full bg-transparent">
        <label
          htmlFor={id}
          aria-disabled={submitting || ocupados + archivos.length >= MAX_ADJUNTOS}
          className={
            submitting || ocupados + archivos.length >= MAX_ADJUNTOS
              ? "pointer-events-none opacity-50"
              : "cursor-pointer"
          }
        >
          <Paperclip className="mr-2 h-4 w-4" />
          Adjuntar archivos
        </label>
      </Button>
      <p className="text-xs text-muted-foreground">Imágenes, PDF u otros documentos · máximo 10 MB por archivo.</p>
      {archivos.length > 0 && (
        <div className="space-y-1.5">
          {archivos.map((archivo, indice) => (
            <div
              key={`${archivo.name}-${archivo.lastModified}-${indice}`}
              className="flex items-center gap-2 rounded-md border px-2.5 py-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-xs">{archivo.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {(archivo.size / 1024 / 1024).toFixed(1)} MB
              </span>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => actualizar(archivos.filter((_, i) => i !== indice))}
                aria-label={`Quitar ${archivo.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // Cancelación de mutuo acuerdo: antes del pago o con el trabajo en curso.
  if (!userId || !["pendiente_pago", "en_progreso"].includes(trabajo.estado ?? "")) return null

  const soyElSolicitante = trabajo.cancelacion_solicitada_por === userId
  const estadoCanc = trabajo.cancelacion_estado

  // Con `variante` cada mitad se pinta por separado; sin ella, las dos.
  const hayCancelacionEnCurso = estadoCanc === "pendiente" || estadoCanc === "rechazada"
  if (variante === "aviso" && !hayCancelacionEnCurso) return null
  if (variante === "boton" && hayCancelacionEnCurso) return null

  // En la variante "aviso" el bloque es una banda que cruza la tarjeta entera,
  // así que no lleva borde redondeado propio sino una línea de separación.
  const enBanda = variante === "aviso"
  const marco = enBanda
    ? "border-b border-amber-500/30 bg-amber-500/10 px-6 py-4"
    : "rounded-lg border border-amber-500/30 bg-amber-500/10 p-4"
  // Los avisos de una sola frase van más apretados fuera de la banda.
  const marcoCompacto = enBanda
    ? "border-b border-amber-500/30 bg-amber-500/10 px-6 py-3"
    : "rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"

  // 1) Solicitud pendiente: el que NO la pidió debe aceptar/rechazar.
  if (estadoCanc === "pendiente" && !soyElSolicitante) {
    return (
      <>
        <div className={`${marco} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
          <div className="flex items-start gap-3 min-w-0">
            <Ban className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="break-words font-semibold text-amber-700 dark:text-amber-400">
                La otra parte quiere cancelar este trabajo
              </p>
              {trabajo.cancelacion_razon && (
                <p className="mt-0.5 break-words text-sm text-muted-foreground">
                  Motivo: {trabajo.cancelacion_razon}
                </p>
              )}
              {Array.isArray(trabajo.cancelacion_adjuntos_solicitante) &&
                trabajo.cancelacion_adjuntos_solicitante.length > 0 && (
                  <div className="mt-2">
                    <AdjuntosLista archivos={trabajo.cancelacion_adjuntos_solicitante} />
                  </div>
                )}
              {/* max-w-prose: a lo ancho de una tarjeta grande, una línea de texto
                  de borde a borde se lee mal. */}
              <p className="mt-1.5 max-w-prose break-words text-sm text-muted-foreground">
                Si aceptas, el trabajo se cancela (y si el cliente ya pagó, se le reembolsa íntegramente). Si
                rechazas, podrás aportar tus argumentos y archivos; se abrirá una disputa automáticamente y la
                resolverá el equipo de Diime.
              </p>
            </div>
          </div>
          {/* En móvil las dos acciones no caben de forma fiable en una sola fila
              (especialmente con texto grande de iOS), así que ocupan todo el
              ancho y se apilan. A partir de sm vuelven a quedar en línea. */}
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:shrink-0">
            <Button
              size="sm"
              className="h-auto min-h-8 w-full whitespace-normal bg-emerald-600 py-2 hover:bg-emerald-700 sm:w-auto sm:whitespace-nowrap"
              disabled={submitting}
              onClick={() => handleResponder(true)}
            >
              {submitting ? (
                <Loader2 className="mr-1 h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Check className="mr-1 h-4 w-4 shrink-0" />
              )}
              Aceptar cancelación
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-auto min-h-8 w-full whitespace-normal bg-transparent py-2 sm:w-auto sm:whitespace-nowrap"
              disabled={submitting}
              onClick={() => setOpenRechazar(true)}
            >
              <XCircle className="mr-1 h-4 w-4 shrink-0" />
              Rechazar
            </Button>
          </div>
        </div>
        <Dialog open={openRechazar} onOpenChange={(abierto) => !submitting && setOpenRechazar(abierto)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Rechazar la cancelación</DialogTitle>
              <DialogDescription>
                Explica por qué debe continuar el servicio o cómo debería resolverse. Al rechazarla se abrirá una
                disputa y el equipo de Diime contrastará los argumentos y archivos de ambas partes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tus argumentos *</label>
                <Textarea
                  placeholder="Explica por qué no estás de acuerdo con la cancelación..."
                  value={razonRespuesta}
                  onChange={(event) => setRazonRespuesta(event.target.value)}
                  rows={4}
                  disabled={submitting}
                />
              </div>
              {selectorAdjuntos(
                `adjuntos-respuesta-${trabajo.id}`,
                archivosRespuesta,
                setArchivosRespuesta,
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" className="bg-transparent" disabled={submitting} onClick={() => setOpenRechazar(false)}>
                Volver
              </Button>
              <Button
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={submitting || !razonRespuesta.trim()}
                onClick={() => handleResponder(false)}
              >
                {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Rechazar y enviar a revisión
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // 2) Solicitud pendiente: el que la pidió espera respuesta.
  if (estadoCanc === "pendiente" && soyElSolicitante) {
    return (
      <>
        <div className={`${marco} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
          <div className="min-w-0 space-y-2 text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Has solicitado cancelar este trabajo. Esperando la respuesta de la otra parte.
            </p>
            {trabajo.cancelacion_razon && (
              <p className="break-words text-muted-foreground">Motivo: {trabajo.cancelacion_razon}</p>
            )}
            {Array.isArray(trabajo.cancelacion_adjuntos_solicitante) &&
              trabajo.cancelacion_adjuntos_solicitante.length > 0 && (
                <AdjuntosLista archivos={trabajo.cancelacion_adjuntos_solicitante} />
              )}
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full bg-transparent sm:w-auto"
              disabled={submitting}
              onClick={abrirEdicion}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" /> Editar solicitud
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
              disabled={submitting}
              onClick={() => setOpenRetirar(true)}
            >
              <Undo2 className="mr-1 h-3.5 w-3.5" /> Retirar solicitud
            </Button>
          </div>
        </div>

        <Dialog open={openEditar} onOpenChange={(abierto) => !submitting && setOpenEditar(abierto)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Editar solicitud de cancelación</DialogTitle>
              <DialogDescription>
                Puedes modificar el motivo, quitar pruebas anteriores o añadir otras mientras la solicitud siga
                pendiente.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Motivo *</label>
                <Textarea
                  placeholder="Explica por qué quieres cancelar..."
                  value={razonEdicion}
                  onChange={(event) => setRazonEdicion(event.target.value)}
                  rows={4}
                  disabled={submitting}
                />
              </div>

              {adjuntosConservados.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Archivos actuales</p>
                  <div className="space-y-1.5">
                    {adjuntosConservados.map((url, indice) => (
                      <div key={url} className="flex items-center gap-2 rounded-md border px-2.5 py-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 flex-1 truncate text-xs hover:underline"
                        >
                          {nombreDeAdjunto(url, indice)}
                        </a>
                        <button
                          type="button"
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                          onClick={() => setAdjuntosConservados((actuales) => actuales.filter((_, i) => i !== indice))}
                          aria-label={`Quitar ${nombreDeAdjunto(url, indice)}`}
                          disabled={submitting}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectorAdjuntos(
                `adjuntos-edicion-${trabajo.id}`,
                archivosEdicion,
                setArchivosEdicion,
                adjuntosConservados.length,
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                className="bg-transparent"
                disabled={submitting}
                onClick={() => setOpenEditar(false)}
              >
                Cancelar
              </Button>
              <Button disabled={submitting || !razonEdicion.trim()} onClick={handleEditar}>
                {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Guardar cambios
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openRetirar} onOpenChange={(abierto) => !submitting && setOpenRetirar(abierto)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>¿Retirar la solicitud?</DialogTitle>
              <DialogDescription>
                La petición de cancelación desaparecerá, la otra parte ya no tendrá que responder y el servicio
                continuará en su estado actual.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                className="bg-transparent"
                disabled={submitting}
                onClick={() => setOpenRetirar(false)}
              >
                Mantener solicitud
              </Button>
              <Button
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={submitting}
                onClick={handleRetirar}
              >
                {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Undo2 className="mr-1 h-4 w-4" />}
                Retirar solicitud
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // 3) Cancelación rechazada: la disputa ya se abrió automáticamente (el
  //    trabajo pasa a "en_disputa" y este panel deja de renderizarse), pero si
  //    quedara algún trabajo con el estado antiguo, se informa igualmente.
  if (estadoCanc === "rechazada") {
    return (
      <div className={`${marcoCompacto} text-sm text-muted-foreground`}>
        La solicitud de cancelación fue rechazada y el caso pasa a disputa: lo resolverá el equipo de Diime
        según los términos de la contratación.
      </div>
    )
  }

  // 5) Sin cancelación en curso: botón para solicitarla.
  return (
    <Dialog open={openSolicitar} onOpenChange={(abierto) => !submitting && setOpenSolicitar(abierto)}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="bg-transparent text-destructive border-destructive/40 hover:bg-destructive/10"
        >
          <XCircle className="h-4 w-4 mr-1" />
          Solicitar cancelación
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar cancelación</DialogTitle>
          <DialogDescription>
            La cancelación debe ser de mutuo acuerdo: la otra parte recibirá un aviso y deberá aceptarla o
            rechazarla. Si la acepta y el trabajo ya estaba pagado, el cliente recibe el reembolso íntegro
            automáticamente. Si la rechaza, se abrirá una disputa que resolverá el equipo de Diime.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-1">
          <label className="text-sm font-medium">Motivo *</label>
          <Textarea
            placeholder="Explica brevemente por qué quieres cancelar..."
            value={razon}
            onChange={(e) => setRazon(e.target.value)}
            rows={4}
            disabled={submitting}
          />
        </div>
        {selectorAdjuntos(`adjuntos-solicitud-${trabajo.id}`, archivosSolicitud, setArchivosSolicitud)}
        <DialogFooter>
          <Button variant="outline" className="bg-transparent" disabled={submitting} onClick={() => setOpenSolicitar(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            disabled={submitting || !razon.trim()}
            onClick={handleSolicitar}
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Enviar solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useEffect, useId, useState, useTransition, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BadgeCheck, ClipboardList, Loader2, MessageCircle, RefreshCw } from "lucide-react"
import {
  obtenerMiVerificacionProfesional,
  solicitarVerificacionProfesional,
} from "@/app/actions/verificacion-profesionales"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  etiquetasVerificacion,
  type EstadoVerificacionProfesional,
  type MiVerificacionProfesional,
} from "@/lib/verificacion-profesional"

const MAX_MENSAJE = 2000

const explicaciones: Record<EstadoVerificacionProfesional, string> = {
  pendiente: "Hemos recibido tu solicitud. Diime se pondrá en contacto contigo para revisarla.",
  en_revision: "Diime está revisando tu perfil. Consulta tus mensajes para responder si necesitamos más información.",
  verificado: "Diime ha verificado tu perfil profesional. La insignia se muestra en tu perfil.",
  no_aprobado: "Revisa el comentario de Diime y envía una nueva solicitud cuando hayas realizado los cambios necesarios.",
  retirada: "La verificación de tu perfil se ha retirado. Revisa el comentario de Diime antes de volver a solicitarla.",
}

export function SolicitudVerificacionProfesional({
  onVerificacionActualizada,
}: {
  onVerificacionActualizada?: (verificado: boolean) => void
}) {
  const router = useRouter()
  const mensajeId = useId()
  const ayudaId = useId()
  const [datos, setDatos] = useState<MiVerificacionProfesional | null>(null)
  const [cargando, setCargando] = useState(true)
  const [revision, setRevision] = useState(0)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [confirmacion, setConfirmacion] = useState<string | null>(null)
  const [envioSinConfirmar, setEnvioSinConfirmar] = useState(false)
  const [enviando, startTransition] = useTransition()

  useEffect(() => {
    let activo = true

    async function cargarVerificacion() {
      try {
        const resultado = await obtenerMiVerificacionProfesional()
        if (!activo) return

        if (resultado.error || !resultado.data) {
          setDatos(null)
          setError(resultado.error || "No se pudo cargar el estado de tu verificación.")
          return
        }

        setDatos(resultado.data)
        setError(null)
        setEnvioSinConfirmar(false)
        onVerificacionActualizada?.(resultado.data.verificado)
      } catch {
        if (activo) {
          setDatos(null)
          setError("No se pudo cargar el estado de tu verificación. Inténtalo de nuevo.")
        }
      } finally {
        if (activo) setCargando(false)
      }
    }

    void cargarVerificacion()
    return () => { activo = false }
  }, [revision, onVerificacionActualizada])

  const solicitud = datos?.solicitud
  const estado = datos?.verificado ? "verificado" : solicitud?.estado
  const puedeSolicitar = Boolean(datos) && !datos?.verificado && (
    !solicitud || solicitud.estado === "no_aprobado" || solicitud.estado === "retirada"
  )

  function actualizarEstado() {
    setCargando(true)
    setError(null)
    setRevision((actual) => actual + 1)
  }

  function enviarSolicitud(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (enviando || cargando || envioSinConfirmar || !puedeSolicitar) return

    startTransition(async () => {
      setError(null)
      setConfirmacion(null)

      try {
        const resultado = await solicitarVerificacionProfesional(mensaje.trim())
        if (resultado.error || !resultado.success) {
          setError(resultado.error || "No se pudo enviar la solicitud. Inténtalo de nuevo.")
          return
        }

        setMensaje("")
        setConfirmacion("Solicitud enviada. Diime se pondrá en contacto contigo para revisar tu perfil.")
        actualizarEstado()
        router.refresh()
      } catch {
        setEnvioSinConfirmar(true)
        setError("No se pudo confirmar el envío. Actualiza el estado antes de volver a intentarlo.")
      }
    })
  }

  return (
    <Card id="verificacion" className="min-w-0 scroll-mt-24">
      <CardHeader>
        <CardTitle role="heading" aria-level={2} className="flex items-center gap-2 text-lg">
          <ClipboardList className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          Verificación por Diime
        </CardTitle>
        <CardDescription>
          Solicita la revisión de tu perfil profesional. Diime te contactará por chat, correo electrónico o teléfono.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {confirmacion ? (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{confirmacion}</p>
        ) : null}

        {cargando ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            Cargando verificación…
          </p>
        ) : datos ? (
          <>
            {datos.empresa ? (
              <p className="break-words text-sm text-muted-foreground">
                Perfil vinculado a <span className="font-medium text-foreground">{datos.empresa.nombre}</span>.
              </p>
            ) : null}

            {estado ? (
              <div className="space-y-2">
                <Badge
                  variant={estado === "verificado" ? "default" : "secondary"}
                  className="max-w-full whitespace-normal text-left"
                >
                  {estado === "verificado" ? <BadgeCheck aria-hidden="true" /> : null}
                  {etiquetasVerificacion[estado]}
                </Badge>
                <p className="text-sm text-muted-foreground">{explicaciones[estado]}</p>
              </div>
            ) : null}

            {solicitud?.comentario_publico ? (
              <div className="space-y-1 rounded-lg border bg-muted/40 p-3">
                <p className="text-sm font-medium">Comentario de Diime</p>
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {solicitud.comentario_publico}
                </p>
              </div>
            ) : null}

            {puedeSolicitar ? (
              <form onSubmit={enviarSolicitud} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor={mensajeId}>Mensaje para Diime (opcional)</Label>
                  <Textarea
                    id={mensajeId}
                    aria-describedby={ayudaId}
                    value={mensaje}
                    onChange={(event) => setMensaje(event.target.value)}
                    maxLength={MAX_MENSAJE}
                    rows={4}
                    disabled={enviando || envioSinConfirmar}
                    placeholder="Cuéntanos qué servicios ofreces o añade información útil para revisar tu perfil."
                    className="min-h-28 resize-y"
                  />
                  <p id={ayudaId} className="text-xs text-muted-foreground">
                    {mensaje.length} / {MAX_MENSAJE} caracteres
                  </p>
                </div>
                <Button type="submit" disabled={enviando || envioSinConfirmar} className="min-h-11 w-full whitespace-normal sm:w-auto">
                  {enviando ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : null}
                  {enviando ? "Enviando…" : solicitud ? "Volver a solicitar verificación" : "Solicitar verificación"}
                </Button>
              </form>
            ) : null}
          </>
        ) : null}

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {datos ? (
            <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto">
              <Link href="/mensajes"><MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />Ver mensajes</Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setConfirmacion(null)
              actualizarEstado()
            }}
            disabled={cargando || enviando}
            className="min-h-11 w-full sm:w-auto"
          >
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error && !datos ? "Reintentar" : "Actualizar estado"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

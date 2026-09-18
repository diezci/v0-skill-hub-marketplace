"use client"

import { useT, useIdioma } from "@/components/idioma-provider"
import { localeDe } from "@/lib/i18n"

import { useEffect, useState } from "react"
import { useNotificacionesSeccion } from "@/hooks/use-notificaciones-seccion"
import { useDestinoNotificacion } from "@/hooks/use-destino-notificacion"
import { AvisosTarjeta } from "@/components/avisos-tarjeta"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Scale, Briefcase, Clock, CheckCircle2, XCircle, FileText, ArrowRight } from "lucide-react"
import { obtenerMisDisputas, retirarDisputa } from "@/app/actions/disputes"
import { useToast } from "@/hooks/use-toast"
import { AdjuntosLista } from "@/components/adjuntos-lista"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const ESTADO_ABIERTA = {
  label: "En revisión por Diime",
  cls: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  icon: Clock,
}

const ESTADO_RETIRADA = {
  label: "Retirada",
  cls: "bg-muted text-muted-foreground border-border",
  icon: XCircle,
}

// Una disputa resuelta no se presenta igual si la ganaste que si la perdiste:
// el desenlace manda sobre el color (verde a favor, rojo en contra, ámbar si
// fue parcial).
function configResuelta(resolucion: string | null, soyCliente: boolean) {
  const gane = (resolucion === "cliente" && soyCliente) || (resolucion === "proveedor" && !soyCliente)
  const perdi = (resolucion === "cliente" && !soyCliente) || (resolucion === "proveedor" && soyCliente)
  if (gane)
    return {
      label: "Resuelta a tu favor",
      cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
      icon: CheckCircle2,
      caja: "border-emerald-500/30 bg-emerald-500/10",
      tituloCaja: "text-emerald-700 dark:text-emerald-400",
    }
  if (perdi)
    return {
      label: "Resuelta en tu contra",
      cls: "bg-red-500/15 text-red-600 border-red-500/30",
      icon: XCircle,
      caja: "border-red-500/30 bg-red-500/10",
      tituloCaja: "text-red-700 dark:text-red-400",
    }
  return {
    label: "Resuelta de forma parcial",
    cls: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    icon: CheckCircle2,
    caja: "border-amber-500/30 bg-amber-500/10",
    tituloCaja: "text-amber-700 dark:text-amber-400",
  }
}

// Cómo se le explica el desenlace a cada rol: el mismo fallo se lee distinto
// según seas el cliente o el profesional.
function textoResolucion(resolucion: string | null, soyCliente: boolean): string {
  if (resolucion === "cliente") {
    return soyCliente
      ? "Resuelta a tu favor: se te ha reembolsado el importe."
      : "Resuelta a favor del cliente: se le ha reembolsado el importe."
  }
  if (resolucion === "proveedor") {
    return soyCliente
      ? "Resuelta a favor del profesional: se le ha liberado el pago."
      : "Resuelta a tu favor: se te ha liberado el pago."
  }
  if (resolucion === "parcial") {
    return "Resuelta de forma parcial: se ha reembolsado una parte al cliente."
  }
  return "Resuelta por el equipo de Diime."
}

export default function MisDisputas({
  rol,
  onCount,
}: {
  rol: "cliente" | "proveedor"
  // Disputas EN CURSO de este rol, para el contador del contenedor. Antes se
  // reportaba el total (incluidas las ya resueltas y retiradas), y la tarjeta
  // las pintaba como "en curso".
  onCount?: (n: number) => void
}) {
  const t = useT()
  const { idioma } = useIdioma()

  const { paraEntidad, marcarLeidas } = useNotificacionesSeccion(rol === "cliente" ? "/mis-solicitudes" : "/mis-trabajos")
  const [disputas, setDisputas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [retirandoId, setRetirandoId] = useState<string | null>(null)
  const [aRetirar, setARetirar] = useState<any>(null)
  const { toast } = useToast()

  // `obtenerMisDisputas` devuelve las disputas en las que participo, sea como
  // cliente o como profesional. Cada sección debe mostrar solo las suyas: en
  // Mis Solicitudes, aquellas en las que soy el cliente; en Gestión de Proyectos,
  // en las que soy el profesional. Sin esto, una disputa aparecía en las dos.
  //
  // Se traen TODAS, abiertas y cerradas. Antes se descartaban las resueltas y
  // retiradas para que la sección no diera sensación de conflictos vivos que ya
  // no existen, pero con eso desaparecía también el historial: ni el cliente ni
  // el proveedor podían volver a leer en qué quedó una disputa ni con qué
  // motivo. Se resuelve separándolas en dos grupos, no escondiéndolas.
  const mias = (data: any[]) => data.filter((d) => (rol === "cliente" ? d.soy_cliente : !d.soy_cliente))
  // El contador de la pestaña sigue contando solo las vivas: dice "en curso".
  const enCurso = (data: any[]) => data.filter((d) => d.estado === "abierta").length

  const cargar = () =>
    obtenerMisDisputas().then((res) => {
      const data = mias(res.data || [])
      setDisputas(data)
      onCount?.(enCurso(data))
      setLoading(false)
    })

  useEffect(() => {
    let activo = true
    obtenerMisDisputas().then((res) => {
      if (!activo) return
      const data = mias(res.data || [])
      setDisputas(data)
      onCount?.(enCurso(data))
      setLoading(false)
    })
    return () => {
      activo = false
    }
  }, [rol])

  const handleRetirar = async () => {
    if (!aRetirar) return
    setRetirandoId(aRetirar.id)
    const res = await retirarDisputa(aRetirar.id)
    setRetirandoId(null)
    setARetirar(null)
    if (res.error) {
      toast({ title: t("No se pudo retirar"), description: t(res.error), variant: "destructive" })
    } else {
      toast({ title: t("Disputa retirada"), description: t("El trabajo continúa con normalidad.") })
      await cargar()
    }
  }

  const formatFecha = (f: string) =>
    new Date(f).toLocaleDateString(localeDe(idioma), { day: "numeric", month: "short", year: "numeric" })

  const avisosDisputa = (disputa: any) => paraEntidad({ trabajoId: disputa.trabajo_id }).filter((aviso) => {
    const disputaId = (aviso.link && new URL(aviso.link, "https://www.diime.es").searchParams.get("disputa")) || aviso.metadata?.disputa_id
    // A withdrawn dispute and its replacement are separate cases. Legacy
    // notices without a case ID stay in the section panel when ambiguous.
    return disputaId ? disputaId === disputa.id : disputas.filter((item) => item.trabajo_id === disputa.trabajo_id).length === 1
  })

  useDestinoNotificacion({
    cargando: loading,
    resolver: (params) => {
      const disputaId = params.get("disputa")
      const candidatas = disputas.filter((item) => disputaId ? item.id === disputaId : item.trabajo_id === params.get("trabajo"))
      const disputa = candidatas.length === 1 ? candidatas[0] : null
      return disputa ? { id: `disputa-${disputa.id}` } : null
    },
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (disputas.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Scale className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium">{t("No tienes disputas")}</p>
          <p className="text-muted-foreground mt-1 max-w-md">{t("Si surge un desacuerdo sobre un trabajo, aquí verás las disputas que hayas abierto y las que la otra parte haya abierto, con su estado y la decisión del equipo de Diime.")}</p>
        </CardContent>
      </Card>
    )
  }

  // Las vivas arriba, porque son las que piden algo. Las cerradas debajo, como
  // historial consultable: en qué quedó cada una y con qué motivo.
  const enRevision = disputas.filter((d) => d.estado === "abierta")
  const cerradas = disputas.filter((d) => d.estado !== "abierta")
  const abiertas = enRevision.length

  const tarjeta = (d: any) => {
        // Mi papel en ESTA disputa, no el de la sección en la que estoy: si se
        // deduce de la sección, una disputa que perdiste como profesional se
        // anuncia como "Resuelta a tu favor" al verla desde Mis Solicitudes.
        const soyCliente: boolean = !!d.soy_cliente
        const estado =
          d.estado === "resuelta"
            ? configResuelta(d.resolucion, soyCliente)
            : d.estado === "retirada"
              ? ESTADO_RETIRADA
              : ESTADO_ABIERTA
        const EstadoIcon = estado.icon
        const adjuntosSolicitante: string[] = Array.isArray(d.cancelacion_adjuntos_solicitante)
          ? d.cancelacion_adjuntos_solicitante
          : []
        const adjuntosRespuesta: string[] = Array.isArray(d.cancelacion_adjuntos_respuesta)
          ? d.cancelacion_adjuntos_respuesta
          : []
        const hayPruebasCancelacion = adjuntosSolicitante.length > 0 || adjuntosRespuesta.length > 0
        return (
          <Card key={d.id} id={`disputa-${d.id}`} tabIndex={-1} className={`scroll-mt-24 ${avisosDisputa(d).length ? "ring-2 ring-primary/50 border-primary/40" : ""}`}>
            <CardContent className="pt-6 space-y-3">
              <AvisosTarjeta avisos={avisosDisputa(d)} onMarcarLeidas={marcarLeidas} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{d.trabajo_titulo}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {d.la_abri_yo ? t("La abriste tú") : t("Abierta por la otra parte")}
                    {d.otra_parte && ` · ${d.otra_parte.nombre ?? ""} ${d.otra_parte.apellido ?? ""}`.trimEnd()}
                    {" · "}
                    {formatFecha(d.created_at)}
                  </p>
                </div>
                <Badge variant="outline" className={`gap-1 shrink-0 ${estado.cls}`}>
                  <EstadoIcon className="h-3.5 w-3.5" />
                  {t(estado.label)}
                </Badge>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-0.5">{t("Motivo")}</p>
                <p className="text-sm text-muted-foreground">{d.motivo}</p>
              </div>

              {hayPruebasCancelacion && (
                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium text-muted-foreground">{t("Pruebas aportadas para la cancelación")}</p>
                  {adjuntosSolicitante.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs">{t("Solicita cancelar ·")}{" "}{t(d.tipo === "cliente" ? "cliente" : "proveedor")}
                      </p>
                      <AdjuntosLista archivos={adjuntosSolicitante} />
                    </div>
                  )}
                  {adjuntosRespuesta.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs">{t("Rechaza cancelar ·")}{" "}{t(d.tipo === "cliente" ? "proveedor" : "cliente")}
                      </p>
                      <AdjuntosLista archivos={adjuntosRespuesta} />
                    </div>
                  )}
                </div>
              )}

              {d.estado === "resuelta" && "caja" in estado && "tituloCaja" in estado && (
                <div className={`rounded-lg border p-3 ${estado.caja}`}>
                  <p className={`text-xs font-medium mb-0.5 ${estado.tituloCaja}`}>{t("Decisión del equipo de Diime")}</p>
                  <p className="text-sm text-muted-foreground">{t(textoResolucion(d.resolucion, soyCliente))}</p>
                  {d.resultado && (
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium text-foreground">{t("Motivo:")}{" "}</span>
                      {d.resultado}
                    </p>
                  )}
                  {d.fecha_resolucion && (
                    <p className="text-xs text-muted-foreground mt-1">{t("Resuelta el")}{" "}{formatFecha(d.fecha_resolucion)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2 border-t border-border/50 pt-2">{t("La decisión de Diime es una mediación privada entre las partes y en ningún caso te impide emprender por tu cuenta las acciones legales o de otro tipo que consideres.")}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  href={`/trabajos/${d.trabajo_id}/factura`}
                  target="_blank"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <FileText className="h-3.5 w-3.5" />{" "}{t("Ver justificante y términos")}</Link>
                <Link
                  href="/mensajes"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <Briefcase className="h-3.5 w-3.5" />{" "}{t("Aportar pruebas en el chat")}<ArrowRight className="h-3 w-3" />
                </Link>
                {/* Solo el que la abrió puede retirarla, y solo mientras esté abierta. */}
                {d.la_abri_yo && d.estado === "abierta" && (
                  <button
                    type="button"
                    onClick={() => setARetirar(d)}
                    disabled={retirandoId === d.id}
                    className="text-xs text-destructive hover:underline inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" />{" "}{t("Retirar disputa")}</button>
                )}
              </div>
            </CardContent>
          </Card>
    )
  }

  return (
    <div className="space-y-4">
      {abiertas > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground flex items-start gap-2">
          <Scale className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <span>{t(abiertas === 1 ? "Tienes {count} disputa en revisión. Mientras dure, el pago sigue confirmado y la transferencia bloqueada. Puedes aportar pruebas en el chat del trabajo." : "Tienes {count} disputas en revisión. Mientras duren, el pago sigue confirmado y la transferencia bloqueada. Puedes aportar pruebas en el chat del trabajo.", { count: abiertas })}</span>
        </div>
      )}

      {enRevision.map(tarjeta)}

      {cerradas.length > 0 && (
        <>
          {/* Solo se encabeza el historial cuando además hay alguna viva: con
              únicamente cerradas, el título sobra porque no hay dos grupos que
              distinguir. */}
          {enRevision.length > 0 && (
            <div className="flex items-center gap-3 pt-2">
              <h3 className="text-sm font-medium text-muted-foreground shrink-0">{t("Historial")}</h3>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
          {cerradas.map(tarjeta)}
        </>
      )}

      <AlertDialog open={!!aRetirar} onOpenChange={(o) => !o && setARetirar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("¿Retirar la disputa?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("El equipo de Diime dejará de revisarla y el trabajo continuará donde estaba, con la transferencia pendiente. Si vuelve a hacer falta, podrás abrir una disputa nueva.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRetirar}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >{t("Retirar disputa")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

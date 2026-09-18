"use client"

import { useT, useIdioma } from "@/components/idioma-provider"

import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertCircle,
  CalendarClock,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react"
import {
  crearEnlaceDashboardStripe,
  crearEnlaceOnboardingStripe,
  obtenerEstadoStripeConnect,
  type EstadoStripeConnect,
} from "@/app/actions/stripe-connect"
import {
  describirCalendarioStripe,
  formatearFechaStripe,
  formatearImporteStripe,
  saldoPrincipalStripe,
} from "@/lib/stripe-connect-presentacion"
import { useToast } from "@/hooks/use-toast"
import { SupportChatButton } from "@/components/support-chat-button"

type StripeConnectCardProps = {
  estadoInicial?: EstadoStripeConnect | null
  errorInicial?: string | null
}

export function StripeConnectCard({ estadoInicial = null, errorInicial = null }: StripeConnectCardProps) {
  const t = useT()
  const { idioma } = useIdioma()

  const [estado, setEstado] = useState<EstadoStripeConnect | null>(estadoInicial)
  const [error, setError] = useState<string | null>(errorInicial)
  const [loading, setLoading] = useState(!estadoInicial && !errorInicial)
  const [accion, setAccion] = useState<"onboarding" | "dashboard" | "refresh" | null>(null)
  const { toast } = useToast()

  const cargar = useCallback(
    async (avisar = false) => {
      setAccion("refresh")
      try {
        const result = await obtenerEstadoStripeConnect()
        if (result.error) {
          setEstado(null)
          setError(result.error)
          if (avisar) {
            toast({ title: t("No se pudo consultar Stripe"), description: t(result.error), variant: "destructive" })
          }
        } else {
          setEstado(result.data || null)
          setError(null)
        }
      } catch {
        const mensaje = "No se pudo consultar Stripe. Comprueba tu conexión y vuelve a intentarlo."
        setEstado(null)
        setError(mensaje)
        if (avisar) toast({ title: t("No se pudo consultar Stripe"), description: t(mensaje), variant: "destructive" })
      } finally {
        setLoading(false)
        setAccion(null)
      }
    },
    [toast, t],
  )

  useEffect(() => {
    if (!estadoInicial) void cargar(false)

    // Al cerrar el navegador del sistema (app nativa) la WebView conserva esta
    // página. Refrescamos el estado para que el resultado de Stripe se vea sin
    // obligar al profesional a pulsar "Actualizar estado".
    const alRecuperarFoco = () => void cargar(false)
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") void cargar(false)
    }
    window.addEventListener("focus", alRecuperarFoco)
    document.addEventListener("visibilitychange", alCambiarVisibilidad)
    return () => {
      window.removeEventListener("focus", alRecuperarFoco)
      document.removeEventListener("visibilitychange", alCambiarVisibilidad)
    }
  }, [cargar, estadoInicial])

  const abrir = async (tipo: "onboarding" | "dashboard") => {
    setAccion(tipo)
    try {
      const { Capacitor } = await import("@capacitor/core")
      const appNativa = Capacitor.isNativePlatform()
      const urlActual = new URL(window.location.href)
      urlActual.searchParams.delete("stripe_connect")
      const volverA = `${urlActual.pathname}${urlActual.search}`
      const result =
        tipo === "onboarding"
          ? await crearEnlaceOnboardingStripe({ appNativa, volverA })
          : await crearEnlaceDashboardStripe()
      if (result.error || !result.data?.url) {
        toast({
          title: t("No se pudo abrir Stripe"),
          description: t(result.error || "Inténtalo de nuevo."),
          variant: "destructive",
        })
        return
      }
      if (appNativa) {
        const { Browser } = await import("@capacitor/browser")
        await Browser.open({ url: result.data.url })
      } else {
        window.location.assign(result.data.url)
      }
    } catch {
      toast({
        title: t("No se pudo abrir Stripe"),
        description: t("Comprueba tu conexión y vuelve a intentarlo."),
        variant: "destructive",
      })
    } finally {
      setAccion(null)
    }
  }

  const cuentaPersonalAnterior = !!estado?.cuentaPersonalAnterior
  const listo =
    !cuentaPersonalAnterior && !!estado?.onboardingCompletado && !!estado?.transferenciasHabilitadas && !!estado?.payoutsHabilitados
  const saldo = saldoPrincipalStripe(estado)
  const saldoTotal = saldo.disponible + saldo.pendiente
  const proximoIngreso = estado?.saldo?.proximoIngreso
  const proximaDisponibilidad = estado?.saldo?.proximaDisponibilidad

  return (
    <Card className={listo ? "border-emerald-500/30" : "border-amber-500/30"}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <WalletCards className="h-5 w-5" />{" "}{t("Cobros profesionales")}</CardTitle>
            <CardDescription className="mt-1.5">{cuentaPersonalAnterior
              ? t("Consulta el saldo y los ingresos de tu cuenta personal anterior.")
              : t("Consulta lo que tienes en Stripe y cuándo llegará el próximo ingreso a tu banco.")}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {estado?.saldo?.modoReal === false && (
              <Badge variant="outline" className="border-amber-500 text-amber-700">{t("Modo de prueba")}</Badge>
            )}
            {loading ? (
              <Badge variant="secondary">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />{" "}{t("Comprobando")}</Badge>
            ) : cuentaPersonalAnterior ? (
              <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">
                <AlertCircle className="mr-1 h-3 w-3" />{" "}{t("Cuenta personal anterior")}</Badge>
            ) : listo ? (
              <Badge className="bg-emerald-600">
                <ShieldCheck className="mr-1 h-3 w-3" />{" "}{t("Cuenta de cobros activa")}</Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500 text-amber-700">
                <AlertCircle className="mr-1 h-3 w-3" />{" "}{t("Acción necesaria")}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <p>{t(error || "")}</p>
            <div className="mt-3"><SupportChatButton /></div>
          </div>
        )}

        {cuentaPersonalAnterior && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm" role="status">
            <p>{t(estado?.avisoTitularidad || "Tu perfil está vinculado a una empresa, pero esta cuenta de Stripe es personal. Puedes consultar tu saldo y tus ingresos anteriores. Contacta con soporte para regularizar la titularidad antes de aceptar nuevos cobros de empresa.")}</p>
            <div className="mt-3"><SupportChatButton /></div>
          </div>
        )}

        {!loading && !listo && !error && !cuentaPersonalAnterior && (
          <p className="text-sm text-muted-foreground">
            {estado?.conectado
              ? t("Stripe necesita que completes o actualices algunos datos antes de que podamos transferirte pagos.")
              : t("Activa tu cuenta de cobros antes de aceptar trabajos de pago.")}
          </p>
        )}

        {estado?.conectado && estado.saldo && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs font-medium text-muted-foreground">{cuentaPersonalAnterior ? t("Saldo de tu cuenta personal") : t("Saldo en Stripe")}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {formatearImporteStripe(saldoTotal, saldo.moneda, idioma)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("Disponible + pendiente")}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="text-xs font-medium text-muted-foreground">{t("Disponible")}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-400">
                  {formatearImporteStripe(saldo.disponible, saldo.moneda, idioma)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{cuentaPersonalAnterior ? t("Disponible en tu cuenta personal") : t("Listo para enviar al banco")}</p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-xs font-medium text-muted-foreground">{t("Pendiente")}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {formatearImporteStripe(saldo.pendiente, saldo.moneda, idioma)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("Aún procesándose en Stripe")}</p>
              </div>
            </div>

            {(estado.saldo?.saldos.length || 0) > 1 && (
              <div className="text-xs text-muted-foreground">{t("Otros saldos:")}{" "}
                {estado.saldo?.saldos
                  .slice(1)
                  .map((otro) =>
                    formatearImporteStripe(otro.disponible + otro.pendiente, otro.moneda, idioma),
                  )
                  .join(" · ")}
              </div>
            )}

            <div className="flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="font-medium">
                  {proximoIngreso
                    ? t("Próximo ingreso al banco")
                    : proximaDisponibilidad
                      ? t("Próxima disponibilidad")
                      : t("Próximo ingreso")}
                </p>
                {proximoIngreso ? (
                  <>
                    <p className="mt-1 text-sm">
                      <span className="font-semibold">
                        {formatearImporteStripe(proximoIngreso.importe, proximoIngreso.moneda, idioma)}
                      </span>{" "}{t("tiene llegada estimada a tu banco el")}{" "}{formatearFechaStripe(proximoIngreso.llegada, idioma)}.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {proximoIngreso.estado === "in_transit"
                        ? t("El ingreso ya está en camino.")
                        : t("Stripe ya ha programado el ingreso.")}
                    </p>
                  </>
                ) : proximaDisponibilidad ? (
                  <p className="mt-1 text-sm text-muted-foreground">{t("El saldo pendiente empezará a estar disponible para enviarlo al banco el")}{" "}
                    {formatearFechaStripe(proximaDisponibilidad.fecha, idioma)}{t(". Después se enviará")}{" "}
                    {describirCalendarioStripe(estado, idioma)}{t(". Stripe todavía no ha generado una fecha de llegada al banco.")}</p>
                ) : estado.saldoError ? (
                  <p className="mt-1 text-sm text-muted-foreground">{t("Stripe no ha podido confirmar ahora la fecha del próximo ingreso.")}</p>
                ) : saldo.disponible > 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">{t("El saldo se enviará")}{" "}{describirCalendarioStripe(estado, idioma)}{t(". Stripe todavía no ha generado una fecha bancaria exacta.")}</p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">{t("No hay ingresos bancarios programados.")}</p>
                )}
              </div>
            </div>

            {estado.saldoError && (
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                {t(estado.saldoError)}
              </p>
            )}
          </>
        )}

        {estado?.conectado && !estado.saldo && (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            {t(estado.saldoError || "Stripe no ha facilitado el saldo en este momento.")}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!listo && !error && !cuentaPersonalAnterior && (
            <Button onClick={() => void abrir("onboarding")} disabled={!!accion || loading}>
              {accion === "onboarding" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {estado?.conectado ? t("Completar datos en Stripe") : t("Activar cobros con Stripe")}
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          )}
          {estado?.conectado && (estado.onboardingCompletado || cuentaPersonalAnterior) && (
            <Button variant="outline" onClick={() => void abrir("dashboard")} disabled={!!accion}>
              {accion === "dashboard" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{cuentaPersonalAnterior ? t("Abrir mi cuenta personal en Stripe") : t("Abrir panel de Stripe")}{" "}<ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void cargar(true)} disabled={!!accion || loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${accion === "refresh" ? "animate-spin" : ""}`} />{" "}{t("Actualizar")}</Button>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{t("Este saldo solo incluye pagos que Diime ya te ha liberado. El dinero de trabajos en curso sigue protegido hasta la confirmación de la entrega o la resolución de una disputa.")}</p>
          <p>{cuentaPersonalAnterior
            ? t("El panel abre tu cuenta personal en una página segura de Stripe.")
            : t("El alta y el panel se abren en una página segura de Stripe. Al terminar volverás automáticamente a Cobros en Diime.")}</p>
        </div>
      </CardContent>
    </Card>
  )
}

"use client"

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
  const [estado, setEstado] = useState<EstadoStripeConnect | null>(estadoInicial)
  const [error, setError] = useState<string | null>(errorInicial)
  const [loading, setLoading] = useState(!estadoInicial && !errorInicial)
  const [accion, setAccion] = useState<"onboarding" | "dashboard" | "refresh" | null>(null)
  const { toast } = useToast()

  const cargar = useCallback(
    async (avisar = false) => {
      setAccion("refresh")
      const result = await obtenerEstadoStripeConnect()
      if (result.error) {
        setEstado(null)
        setError(result.error)
        if (avisar) {
          toast({ title: "No se pudo consultar Stripe", description: result.error, variant: "destructive" })
        }
      } else {
        setEstado(result.data || null)
        setError(null)
      }
      setLoading(false)
      setAccion(null)
    },
    [toast],
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
        title: "No se pudo abrir Stripe",
        description: result.error || "Inténtalo de nuevo.",
        variant: "destructive",
      })
      setAccion(null)
      return
    }
    if (appNativa) {
      const { Browser } = await import("@capacitor/browser")
      await Browser.open({ url: result.data.url })
      setAccion(null)
    } else {
      window.location.assign(result.data.url)
    }
  }

  const listo =
    !!estado?.onboardingCompletado && !!estado?.transferenciasHabilitadas && !!estado?.payoutsHabilitados
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
              <WalletCards className="h-5 w-5" /> Cobros profesionales
            </CardTitle>
            <CardDescription className="mt-1.5">
              Consulta lo que tienes en Stripe y cuándo llegará el próximo ingreso a tu banco.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {estado?.saldo && !estado.saldo.modoReal && (
              <Badge variant="outline" className="border-amber-500 text-amber-700">
                Modo de prueba
              </Badge>
            )}
            {loading ? (
              <Badge variant="secondary">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Comprobando
              </Badge>
            ) : listo ? (
              <Badge className="bg-emerald-600">
                <ShieldCheck className="mr-1 h-3 w-3" /> Lista para cobrar
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500 text-amber-700">
                <AlertCircle className="mr-1 h-3 w-3" /> Acción necesaria
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <p>{error}</p>
            <div className="mt-3"><SupportChatButton /></div>
          </div>
        )}

        {!loading && !listo && !error && (
          <p className="text-sm text-muted-foreground">
            {estado?.conectado
              ? "Stripe necesita que completes o actualices algunos datos antes de que podamos transferirte pagos."
              : "Activa tu cuenta de cobros antes de aceptar trabajos de pago."}
          </p>
        )}

        {estado?.conectado && estado.saldo && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs font-medium text-muted-foreground">Saldo en Stripe</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {formatearImporteStripe(saldoTotal, saldo.moneda)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Disponible + pendiente</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="text-xs font-medium text-muted-foreground">Disponible</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-400">
                  {formatearImporteStripe(saldo.disponible, saldo.moneda)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Listo para enviar al banco</p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-xs font-medium text-muted-foreground">Pendiente</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {formatearImporteStripe(saldo.pendiente, saldo.moneda)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Aún procesándose en Stripe</p>
              </div>
            </div>

            {(estado.saldo?.saldos.length || 0) > 1 && (
              <div className="text-xs text-muted-foreground">
                Otros saldos:{" "}
                {estado.saldo?.saldos
                  .slice(1)
                  .map((otro) =>
                    formatearImporteStripe(otro.disponible + otro.pendiente, otro.moneda),
                  )
                  .join(" · ")}
              </div>
            )}

            <div className="flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="font-medium">Próximo cobro</p>
                {proximoIngreso ? (
                  <>
                    <p className="mt-1 text-sm">
                      <span className="font-semibold">
                        {formatearImporteStripe(proximoIngreso.importe, proximoIngreso.moneda)}
                      </span>{" "}
                      tiene llegada estimada a tu banco el {formatearFechaStripe(proximoIngreso.llegada)}.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {proximoIngreso.estado === "in_transit"
                        ? "El ingreso ya está en camino."
                        : "Stripe ya ha programado el ingreso."}
                    </p>
                  </>
                ) : proximaDisponibilidad ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Parte del saldo pendiente estará disponible el {formatearFechaStripe(proximaDisponibilidad.fecha)}.
                    Después se enviará {describirCalendarioStripe(estado)}. Stripe todavía no ha generado una fecha bancaria exacta.
                  </p>
                ) : estado.saldoError ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Stripe no ha podido confirmar ahora la fecha del próximo ingreso.
                  </p>
                ) : saldo.disponible > 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    El saldo se enviará {describirCalendarioStripe(estado)}. Stripe todavía no ha generado una fecha bancaria exacta.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">No hay ingresos bancarios programados.</p>
                )}
                {saldo.instantaneo > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Stripe marca {formatearImporteStripe(saldo.instantaneo, saldo.moneda)} como disponible para ingreso instantáneo.
                  </p>
                )}
              </div>
            </div>

            {estado.saldoError && (
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                {estado.saldoError}
              </p>
            )}
          </>
        )}

        {estado?.conectado && !estado.saldo && (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            {estado.saldoError || "Stripe no ha facilitado el saldo en este momento."}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!listo && !error && (
            <Button onClick={() => void abrir("onboarding")} disabled={!!accion || loading}>
              {accion === "onboarding" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {estado?.conectado ? "Completar datos en Stripe" : "Activar cobros con Stripe"}
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          )}
          {estado?.conectado && estado.onboardingCompletado && (
            <Button variant="outline" onClick={() => void abrir("dashboard")} disabled={!!accion}>
              {accion === "dashboard" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Abrir panel de Stripe <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void cargar(true)} disabled={!!accion || loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${accion === "refresh" ? "animate-spin" : ""}`} /> Actualizar
          </Button>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            Este saldo solo incluye pagos que Diime ya te ha liberado. El dinero de trabajos en curso sigue protegido hasta la confirmación de la entrega o la resolución de una disputa.
          </p>
          <p>
            El alta y el panel se abren en una página segura de Stripe. Al terminar volverás automáticamente a Cobros en Diime.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

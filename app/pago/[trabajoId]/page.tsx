"use client"

import { useT, useIdioma } from "@/components/idioma-provider"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js"
import { crearPagoEscrow, confirmarPagoEscrow } from "@/app/actions/escrow"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ShieldCheck, ArrowLeft, CheckCircle2, AlertCircle, Loader2, WalletCards } from "lucide-react"
import { calcularTotalCliente, calcularPagoProveedor, PLATFORM_CONFIG, formatearPrecio } from "@/lib/comisiones"

const stripePromise = loadStripe(
  (process.env.NEXT_PUBLIC_DIIME_STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)!,
)

export default function PagoPage() {
  const t = useT()
  const { idioma } = useIdioma()

  const params = useParams()
  const router = useRouter()
  const trabajoId = params.trabajoId as string

  const [status, setStatus] = useState<"loading" | "ready" | "confirming" | "complete" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [desglose, setDesglose] = useState<{
    precioBase: number
    comisionCliente: number
    totalCliente: number
    comisionProveedor: number
    pagoNeto: number
  } | null>(null)

  useEffect(() => {
    async function initCheckout() {
      const result = await crearPagoEscrow({ trabajo_id: trabajoId })

      if (result.error) {
        setError(result.error)
        setStatus("error")
        return
      }

      if (result.clientSecret) {
        setClientSecret(result.clientSecret)
        setSessionId(result.escrow?.stripe_session_id ?? null)
        setStatus("ready")
      }

      if (result.desglose) {
        setDesglose(result.desglose)
      }
    }

    initCheckout()
  }, [trabajoId])

  const handleComplete = useCallback(async () => {
    // Stripe ya cobró: confirmar en nuestra base de datos (escrow →
    // fondos_retenidos, trabajo → en_progreso y aviso al proveedor). Sin esta
    // llamada el pago quedaba cobrado pero el trabajo seguía "pendiente de pago".
    setStatus("confirming")
    if (sessionId) {
      const result = await confirmarPagoEscrow(sessionId)
      if (result.error) {
        setError(
          t("Tu pago se ha realizado, pero no se pudo registrar la confirmación ({error}). ", { error: t(result.error) }) +
            t("Recarga la página o contacta con soporte: no se te cobrará dos veces."),
        )
        setStatus("error")
        return
      }
    }
    setStatus("complete")
    setTimeout(() => {
      // Volver arriba antes de navegar: el checkout embebido de Stripe deja la
      // página desplazada, y el navegador conservaba esa posición al llegar a
      // Mis Solicitudes, que aparecía a media altura como si hubiera saltado sola.
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
      router.push("/mis-solicitudes")
    }, 3000)
  }, [router, sessionId, t])

  if (status === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t("Error en el pago")}</h2>
            <p className="text-muted-foreground mb-4">{t(error || "")}</p>
            <Button onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />{t("Volver")}</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === "confirming") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-12 w-12 text-primary mx-auto mb-4 animate-spin" />
            <h2 className="text-xl font-semibold mb-2">{t("Confirmando el pago...")}</h2>
            <p className="text-muted-foreground">{t("No cierres esta ventana.")}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === "complete") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t("Pago realizado con exito")}</h2>
            <p className="text-muted-foreground mb-2">{t("Los fondos quedan retenidos de forma segura hasta que confirmes la finalizacion del trabajo.")}</p>
            <p className="text-sm text-muted-foreground">{t("Redirigiendo a Mis Solicitudes...")}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-4 pt-24">
        <Button
          variant="ghost"
          className="mb-6 bg-transparent"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />{t("Volver")}</Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Payment info sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-500" />{t("Pago Protegido")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4" />{" "}{t("Tu dinero está protegido")}</p>
                  <p className="text-sm text-muted-foreground">{t("El pago al profesional queda aplazado hasta que confirmes la entrega o se resuelva una disputa. Si hay un problema, puedes solicitar la mediación de Diime.")}</p>
                </div>

                <Separator />

                {desglose ? (
                  <div className="space-y-3">
                    <h3 className="font-medium text-sm">{t("Desglose del pago")}</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("Precio final del servicio")}</span>
                        <span>{formatearPrecio(desglose.precioBase, idioma)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("Gastos de servicio Diime (")}{PLATFORM_CONFIG.comisionClientePorcentaje}{t("%; IVA del")}{" "}
                          {PLATFORM_CONFIG.ivaDiimePorcentaje}{t("% incluido)")}</span>
                        <span>{formatearPrecio(desglose.comisionCliente, idioma)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-semibold text-base">
                        <span>{t("Total a pagar")}</span>
                        <span className="text-primary">{formatearPrecio(desglose.totalCliente, idioma)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("Si canceláis de mutuo acuerdo después de pagar, se te devuelve el precio del servicio. Diime conserva los gastos de servicio del cliente: {comision}.", { comision: formatearPrecio(desglose.comisionCliente, idioma) })}</p>
                    <p className="text-xs text-muted-foreground">{t("Los pagos tardíos que no activan la contratación se devuelven íntegramente.")}</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <WalletCards className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                    <span>{t("Tarjeta, Apple Pay, Google Pay o Link, según disponibilidad")}</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                    <span>{t("Pago 100% seguro con Stripe")}</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                    <span>{t("Fondos retenidos hasta confirmacion")}</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                    <span>{t("Reembolso según cancelación o resolución")}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stripe checkout */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("Realizar pago")}</CardTitle>
                <p className="text-sm text-muted-foreground">{t("Elige tarjeta o una opción de pago rápido disponible en tu dispositivo.")}</p>
              </CardHeader>
              <CardContent>
                {status === "loading" && (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-3 text-muted-foreground">{t("Preparando checkout seguro...")}</span>
                  </div>
                )}
                {status === "ready" && clientSecret && (
                  <EmbeddedCheckoutProvider
                    stripe={stripePromise}
                    options={{
                      clientSecret,
                      onComplete: handleComplete,
                    }}
                  >
                    <EmbeddedCheckout />
                  </EmbeddedCheckoutProvider>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

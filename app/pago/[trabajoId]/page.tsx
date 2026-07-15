"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js"
import { crearPagoEscrow, confirmarPagoEscrow } from "@/app/actions/escrow"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ShieldCheck, ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { calcularTotalCliente, calcularPagoProveedor, PLATFORM_CONFIG, formatearPrecio } from "@/lib/comisiones"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export default function PagoPage() {
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
          `Tu pago se ha realizado, pero no se pudo registrar la confirmación (${result.error}). ` +
            "Recarga la página o contacta con soporte: no se te cobrará dos veces.",
        )
        setStatus("error")
        return
      }
    }
    setStatus("complete")
    setTimeout(() => {
      router.push("/mis-solicitudes")
    }, 3000)
  }, [router, sessionId])

  if (status === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error en el pago</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
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
            <h2 className="text-xl font-semibold mb-2">Confirmando el pago...</h2>
            <p className="text-muted-foreground">No cierres esta ventana.</p>
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
            <h2 className="text-xl font-semibold mb-2">Pago realizado con exito</h2>
            <p className="text-muted-foreground mb-2">
              Los fondos quedan retenidos de forma segura hasta que confirmes la finalizacion del trabajo.
            </p>
            <p className="text-sm text-muted-foreground">Redirigiendo a Mis Demandas...</p>
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
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Payment info sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-500" />
                  Pago Protegido
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4" /> Tu dinero está protegido
                  </p>
                  <p className="text-sm text-muted-foreground">
                    El importe <span className="font-medium text-foreground">no llega al profesional al pagar</span>:
                    queda retenido por Diime y <span className="font-medium text-foreground">solo se libera cuando
                    tú confirmes</span> que has recibido el servicio correctamente. Si no quedas satisfecho,{" "}
                    <span className="font-medium text-foreground">se te reembolsa</span>.
                  </p>
                </div>

                <Separator />

                {desglose ? (
                  <div className="space-y-3">
                    <h3 className="font-medium text-sm">Desglose del pago</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Precio del servicio</span>
                        <span>{formatearPrecio(desglose.precioBase)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Gastos de servicio Diime ({PLATFORM_CONFIG.comisionClientePorcentaje}%)
                        </span>
                        <span>{formatearPrecio(desglose.comisionCliente)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-semibold text-base">
                        <span>Total a pagar</span>
                        <span className="text-primary">{formatearPrecio(desglose.totalCliente)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                    <span>Pago 100% seguro con Stripe</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                    <span>Fondos retenidos hasta confirmacion</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                    <span>Reembolso si no estas satisfecho</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stripe checkout */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Realizar pago</CardTitle>
              </CardHeader>
              <CardContent>
                {status === "loading" && (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-3 text-muted-foreground">Preparando checkout seguro...</span>
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

"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js"
import { crearPagoEscrow } from "@/app/actions/escrow"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ShieldCheck, ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { calcularTotalCliente, calcularPagoProveedor, PLATFORM_CONFIG } from "@/lib/comisiones"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export default function PagoPage() {
  const params = useParams()
  const router = useRouter()
  const trabajoId = params.trabajoId as string

  const [status, setStatus] = useState<"loading" | "ready" | "complete" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
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
        setStatus("ready")
      }

      if (result.desglose) {
        setDesglose(result.desglose)
      }
    }

    initCheckout()
  }, [trabajoId])

  const handleComplete = useCallback(() => {
    setStatus("complete")
    setTimeout(() => {
      router.push("/mis-solicitudes")
    }, 3000)
  }, [router])

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
            <p className="text-sm text-muted-foreground">Redirigiendo a Mis Solicitudes...</p>
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
                <p className="text-sm text-muted-foreground">
                  Tu pago queda retenido de forma segura en nuestra plataforma. Solo se libera al profesional
                  cuando confirmes que el trabajo se ha completado satisfactoriamente.
                </p>

                <Separator />

                {desglose ? (
                  <div className="space-y-3">
                    <h3 className="font-medium text-sm">Desglose del pago</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Precio del servicio</span>
                        <span>{desglose.precioBase.toFixed(2)} EUR</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Comision plataforma ({PLATFORM_CONFIG.comisionClientePorcentaje}%)
                        </span>
                        <span>{desglose.comisionCliente.toFixed(2)} EUR</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-semibold">
                        <span>Total a pagar</span>
                        <span>{desglose.totalCliente.toFixed(2)} EUR</span>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2 text-sm">
                      <h4 className="text-xs text-muted-foreground uppercase tracking-wider">
                        El profesional recibira
                      </h4>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Precio del servicio</span>
                        <span>{desglose.precioBase.toFixed(2)} EUR</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Comision plataforma (-{PLATFORM_CONFIG.comisionProveedorPorcentaje}%)
                        </span>
                        <span className="text-destructive">-{desglose.comisionProveedor.toFixed(2)} EUR</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-semibold">
                        <span>Pago neto</span>
                        <span className="text-emerald-600">{desglose.pagoNeto.toFixed(2)} EUR</span>
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

"use client"

import type React from "react"
import { useState, useCallback } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Shield, Lock, CheckCircle, AlertCircle } from "lucide-react"
import { crearPagoEscrow, confirmarPagoEscrow } from "@/app/actions/escrow"
import { calcularTotalCliente, formatearPrecio } from "@/lib/comisiones"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface EscrowPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trabajoId: string
  titulo: string
  precioAcordado: number
  profesionalNombre: string
  onSuccess?: () => void
}

export function EscrowPaymentDialog({
  open,
  onOpenChange,
  trabajoId,
  titulo,
  precioAcordado,
  profesionalNombre,
  onSuccess,
}: EscrowPaymentDialogProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [desglose, setDesglose] = useState<{
    precioBase: number
    comisionCliente: number
    totalCliente: number
  } | null>(null)

  const fetchClientSecret = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    const result = await crearPagoEscrow({ trabajo_id: trabajoId })
    
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return null
    }
    
    setClientSecret(result.clientSecret || null)
    if (result.desglose) {
      setDesglose(result.desglose)
    }
    setLoading(false)
    
    return result.clientSecret
  }, [trabajoId])

  const handleComplete = async () => {
    if (clientSecret) {
      // The payment was completed via Stripe Checkout
      // The webhook will handle updating the database
      setSuccess(true)
      setTimeout(() => {
        onOpenChange(false)
        setSuccess(false)
        setClientSecret(null)
        onSuccess?.()
      }, 2000)
    }
  }

  const calculado = calcularTotalCliente(precioAcordado)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pago Seguro con Proteccion Escrow</DialogTitle>
          <DialogDescription>
            Los fondos se retienen de forma segura hasta que confirmes que el trabajo esta completo
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4 py-8 text-center">
            <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
            <h3 className="text-xl font-semibold">Pago Exitoso</h3>
            <p className="text-muted-foreground">
              Tus fondos estan seguros en custodia hasta que el trabajo sea completado
            </p>
          </div>
        ) : !clientSecret ? (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h4 className="font-semibold">{titulo}</h4>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Profesional:</span>
                  <span className="font-medium">{profesionalNombre}</span>
                </div>
                <div className="mt-4 space-y-2 border-t pt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span>Precio del servicio:</span>
                    <span>{formatearPrecio(calculado.precioBase)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Comision de servicio (10%):</span>
                    <span>{formatearPrecio(calculado.comisionCliente)}</span>
                  </div>
                  <div className="flex items-center justify-between font-semibold text-lg border-t pt-2">
                    <span>Total a pagar:</span>
                    <span className="text-primary">{formatearPrecio(calculado.totalCliente)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg bg-muted p-4">
                <div className="flex items-start gap-3">
                  <Shield className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">Proteccion del Comprador</p>
                    <p className="text-sm text-muted-foreground">
                      Tus fondos se mantienen seguros hasta que apruebes el trabajo completado
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Lock className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">Pago Seguro</p>
                    <p className="text-sm text-muted-foreground">
                      Procesado por Stripe con encriptacion de nivel bancario
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button onClick={fetchClientSecret} disabled={loading} className="w-full">
              {loading ? "Preparando pago..." : "Continuar al Pago"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Los fondos se retendran de forma segura hasta que confirmes que el trabajo esta completo.
                Total: {desglose ? formatearPrecio(desglose.totalCliente) : formatearPrecio(calculado.totalCliente)}
              </AlertDescription>
            </Alert>

            <div id="checkout" className="min-h-[400px]">
              <EmbeddedCheckoutProvider
                stripe={stripePromise}
                options={{ 
                  clientSecret,
                  onComplete: handleComplete,
                }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

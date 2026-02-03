"use client"

import type React from "react"

import { useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Shield, Lock, CheckCircle } from "lucide-react"
import { createEscrowPayment, confirmFundsHeld } from "@/app/actions/escrow"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface EscrowPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  professionalId: string
  professionalName: string
  amount: number
  serviceName: string
  description: string
}

function PaymentForm({
  clientSecret,
  escrowId,
  onSuccess,
}: {
  clientSecret: string
  escrowId: string
  onSuccess: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) return

    setLoading(true)
    setError(null)

    try {
      const { error: submitError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + "/mi-cuenta",
        },
        redirect: "if_required",
      })

      if (submitError) {
        setError(submitError.message || "Error al procesar el pago")
      } else {
        await confirmFundsHeld(escrowId)
        onSuccess()
      }
    } catch (err) {
      setError("Error al procesar el pago")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={!stripe || loading} className="w-full">
        {loading ? "Procesando..." : "Pagar de forma segura"}
      </Button>
    </form>
  )
}

export function EscrowPaymentDialog({
  open,
  onOpenChange,
  orderId,
  professionalId,
  professionalName,
  amount,
  serviceName,
  description,
}: EscrowPaymentDialogProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [escrowId, setEscrowId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const initializePayment = async () => {
    setLoading(true)
    try {
      const result = await createEscrowPayment(
        orderId,
        "client-1", // In production, get from auth session
        professionalId,
        amount,
        description,
        serviceName,
      )
      setClientSecret(result.clientSecret)
      setEscrowId(result.escrowId)
    } catch (error) {
      console.error("[v0] Error initializing payment:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSuccess = () => {
    setSuccess(true)
    setTimeout(() => {
      onOpenChange(false)
      setSuccess(false)
      setClientSecret(null)
      setEscrowId(null)
    }, 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pago Seguro con Protección Escrow</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="space-y-4 py-8 text-center">
            <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
            <h3 className="text-xl font-semibold">¡Pago Exitoso!</h3>
            <p className="text-muted-foreground">
              Tus fondos están seguros en custodia hasta que el trabajo sea completado
            </p>
          </div>
        ) : !clientSecret ? (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h4 className="font-semibold">{serviceName}</h4>
                <p className="text-sm text-muted-foreground">{description}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm">Profesional:</span>
                  <span className="font-medium">{professionalName}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm">Precio total:</span>
                  <span className="text-xl font-bold">{(amount / 100).toFixed(2)}€</span>
                </div>
              </div>

              <div className="space-y-3 rounded-lg bg-muted p-4">
                <div className="flex items-start gap-3">
                  <Shield className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">Protección del Comprador</p>
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
                      Procesado por Stripe con encriptación de nivel bancario
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Button onClick={initializePayment} disabled={loading} className="w-full">
              {loading ? "Preparando..." : "Continuar al Pago"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Los fondos se retendrán de forma segura hasta que confirmes que el trabajo está completo
              </AlertDescription>
            </Alert>

            {clientSecret && escrowId && (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: { theme: "stripe" },
                }}
              >
                <PaymentForm clientSecret={clientSecret} escrowId={escrowId} onSuccess={handleSuccess} />
              </Elements>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

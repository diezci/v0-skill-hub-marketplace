"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, ExternalLink, Loader2, RefreshCw, ShieldCheck, WalletCards } from "lucide-react"
import {
  crearEnlaceDashboardStripe,
  crearEnlaceOnboardingStripe,
  obtenerEstadoStripeConnect,
} from "@/app/actions/stripe-connect"
import { useToast } from "@/hooks/use-toast"

type Estado = {
  conectado: boolean
  onboardingCompletado: boolean
  transferenciasHabilitadas: boolean
  payoutsHabilitados: boolean
  requisitosPendientes: string[]
}

export function StripeConnectCard() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [loading, setLoading] = useState(true)
  const [accion, setAccion] = useState<"onboarding" | "dashboard" | "refresh" | null>(null)
  const { toast } = useToast()

  const cargar = async () => {
    setAccion("refresh")
    const result = await obtenerEstadoStripeConnect()
    if (result.error) toast({ title: "No se pudo consultar Stripe", description: result.error, variant: "destructive" })
    else setEstado(result.data || null)
    setLoading(false)
    setAccion(null)
  }

  useEffect(() => {
    void cargar()

    // Al cerrar el navegador del sistema (app nativa) la WebView conserva esta
    // página. Refrescamos el estado para que el resultado de Stripe se vea sin
    // obligar al profesional a pulsar "Actualizar estado".
    const alRecuperarFoco = () => void cargar()
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") void cargar()
    }
    window.addEventListener("focus", alRecuperarFoco)
    document.addEventListener("visibilitychange", alCambiarVisibilidad)
    return () => {
      window.removeEventListener("focus", alRecuperarFoco)
      document.removeEventListener("visibilitychange", alCambiarVisibilidad)
    }
  }, [])

  const abrir = async (tipo: "onboarding" | "dashboard") => {
    setAccion(tipo)
    const { Capacitor } = await import("@capacitor/core")
    const appNativa = Capacitor.isNativePlatform()
    const urlActual = new URL(window.location.href)
    urlActual.searchParams.delete("stripe_connect")
    const volverA = `${urlActual.pathname}${urlActual.search}`
    const result = tipo === "onboarding"
      ? await crearEnlaceOnboardingStripe({ appNativa, volverA })
      : await crearEnlaceDashboardStripe()
    if (result.error || !result.data?.url) {
      toast({ title: "No se pudo abrir Stripe", description: result.error || "Inténtalo de nuevo.", variant: "destructive" })
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

  const listo = !!estado?.onboardingCompletado && !!estado?.transferenciasHabilitadas && !!estado?.payoutsHabilitados

  return (
    <Card className={listo ? "border-emerald-500/30" : "border-amber-500/30"}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <WalletCards className="h-5 w-5" /> Cobros profesionales
            </CardTitle>
            <CardDescription className="mt-1.5">
              Stripe verifica tu identidad y cuenta bancaria. Diime solo libera cada cobro tras la confirmación o la resolución de una disputa.
            </CardDescription>
          </div>
          {loading ? (
            <Badge variant="secondary"><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Comprobando</Badge>
          ) : listo ? (
            <Badge className="bg-emerald-600"><ShieldCheck className="mr-1 h-3 w-3" /> Lista para cobrar</Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500 text-amber-700"><AlertCircle className="mr-1 h-3 w-3" /> Acción necesaria</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!loading && !listo && (
          <p className="text-sm text-muted-foreground">
            {estado?.conectado
              ? "Stripe necesita que completes o actualices algunos datos antes de que podamos transferirte pagos."
              : "Activa tu cuenta de cobros antes de aceptar trabajos de pago."}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {!listo && (
            <Button onClick={() => void abrir("onboarding")} disabled={!!accion || loading}>
              {accion === "onboarding" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {estado?.conectado ? "Completar datos en Stripe" : "Activar cobros con Stripe"}
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          )}
          {estado?.conectado && estado.onboardingCompletado && (
            <Button variant="outline" onClick={() => void abrir("dashboard")} disabled={!!accion}>
              {accion === "dashboard" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ver saldo y transferencias <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void cargar()} disabled={!!accion || loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${accion === "refresh" ? "animate-spin" : ""}`} /> Actualizar estado
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          El alta y el panel se abren en una página segura de Stripe. Al terminar volverás automáticamente a esta pantalla de Diime.
        </p>
      </CardContent>
    </Card>
  )
}

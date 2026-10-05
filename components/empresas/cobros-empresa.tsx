"use client"

import { useCallback, useEffect, useState } from "react"
import { ExternalLink, Loader2, RefreshCw, WalletCards } from "lucide-react"
import { useIdioma, useT } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { crearEnlaceDashboardStripeEmpresa, crearEnlaceOnboardingStripeEmpresa, obtenerEstadoStripeConnectEmpresa, type EstadoStripeConnect } from "@/app/actions/stripe-connect"
import { formatearImporteStripe, formatearFechaStripe } from "@/lib/stripe-connect-presentacion"

export function CobrosEmpresa({ empresaId, nombreEmpresa, puedeVer, esResponsablePrincipal }: {
  empresaId: string; nombreEmpresa: string; puedeVer: boolean; esResponsablePrincipal: boolean
}) {
  const t = useT()
  const { idioma } = useIdioma()
  const [estado, setEstado] = useState<EstadoStripeConnect | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const cargar = useCallback(async () => {
    if (!puedeVer) return
    setOcupado(true)
    try {
      const result = await obtenerEstadoStripeConnectEmpresa(empresaId)
      setEstado(result.data || null)
      setError(result.error || null)
    } catch { setEstado(null); setError("No se pudo consultar Stripe. Comprueba tu conexión y vuelve a intentarlo.") }
    finally { setOcupado(false) }
  }, [empresaId, puedeVer])
  useEffect(() => {
    setEstado(null)
    setError(null)
    void cargar()
    const refrescar = () => { if (document.visibilityState === "visible") void cargar() }
    window.addEventListener("focus", refrescar)
    document.addEventListener("visibilitychange", refrescar)
    return () => { window.removeEventListener("focus", refrescar); document.removeEventListener("visibilitychange", refrescar) }
  }, [cargar])

  async function abrir(tipo: "onboarding" | "dashboard") {
    setOcupado(true)
    try {
      const { Capacitor } = await import("@capacitor/core")
      const appNativa = Capacitor.isNativePlatform()
      const volverA = `${window.location.pathname}${window.location.search}`
      const result = tipo === "dashboard"
        ? await crearEnlaceDashboardStripeEmpresa(empresaId)
        : await crearEnlaceOnboardingStripeEmpresa(empresaId, { appNativa, volverA })
      if (result.error || !result.data?.url) { setError(result.error || "No se pudo abrir Stripe"); return }
      if (appNativa) { const { Browser } = await import("@capacitor/browser"); await Browser.open({ url: result.data.url }) }
      else window.location.assign(result.data.url)
    } catch { setError("Comprueba tu conexión y vuelve a intentarlo.") }
    finally { setOcupado(false) }
  }
  if (!puedeVer) return null
  const listo = estado?.onboardingCompletado && estado.transferenciasHabilitadas && estado.payoutsHabilitados
  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5" />{t("Cobros de la empresa")}</CardTitle>
      <CardDescription>{nombreEmpresa} · {t("Cuenta bancaria y cobros propios de la empresa.")}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{t(error)}</p>}
      {estado && <Badge variant={listo ? "default" : "outline"}>{listo ? t("Cuenta de cobros activa") : estado.conectado ? t("Acción necesaria") : t("Sin conectar")}</Badge>}
      {estado?.saldo?.modoReal === false && <Badge variant="outline">{t("Modo de prueba")}</Badge>}
      {estado?.saldo && <div className="grid gap-3 sm:grid-cols-2">
        {estado.saldo.saldos.map((saldo) => <div key={saldo.moneda} className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">{t("Disponible")}</p>
          <p className="text-2xl font-semibold">{formatearImporteStripe(saldo.disponible, saldo.moneda, idioma)}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("Pendiente")}: {formatearImporteStripe(saldo.pendiente, saldo.moneda, idioma)}</p>
        </div>)}
      </div>}
      {estado?.saldo?.proximoIngreso && <p className="text-sm">{t("Próximo ingreso al banco")}: {formatearImporteStripe(estado.saldo.proximoIngreso.importe, estado.saldo.proximoIngreso.moneda, idioma)} · {formatearFechaStripe(estado.saldo.proximoIngreso.llegada, idioma)}</p>}
      {estado?.saldoError && <p className="text-sm text-muted-foreground">{t(estado.saldoError)}</p>}
      {!esResponsablePrincipal && <p className="text-sm text-muted-foreground">{t("El responsable principal gestiona la cuenta bancaria y los datos de Stripe.")}</p>}
      <div className="flex flex-wrap gap-2">
        {esResponsablePrincipal && estado && !listo && <Button disabled={ocupado} onClick={() => void abrir("onboarding")}><ExternalLink className="mr-2 h-4 w-4" />{estado.conectado ? t("Completar datos en Stripe") : t("Activar cobros con Stripe")}</Button>}
        {esResponsablePrincipal && estado?.onboardingCompletado && <Button variant="outline" disabled={ocupado} onClick={() => void abrir("dashboard")}><ExternalLink className="mr-2 h-4 w-4" />{t("Abrir cuenta de la empresa en Stripe")}</Button>}
        <Button variant="outline" disabled={ocupado} onClick={() => void cargar()}>{ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}{t("Actualizar estado")}</Button>
      </div>
    </CardContent>
  </Card>
}

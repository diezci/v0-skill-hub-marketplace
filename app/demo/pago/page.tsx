"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import {
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Lock,
  Info,
  Sparkles,
  User,
  Briefcase,
  Calendar,
  MapPin,
} from "lucide-react"
import {
  calcularTotalCliente,
  calcularPagoProveedor,
  PLATFORM_CONFIG,
  formatearPrecio,
} from "@/lib/comisiones"

export default function DemoPagoPage() {
  const [precio, setPrecio] = useState<number>(1500)
  const [completado, setCompletado] = useState(false)

  const desglose = useMemo(() => {
    const cliente = calcularTotalCliente(precio)
    const proveedor = calcularPagoProveedor(precio)
    return {
      precioBase: cliente.precioBase,
      comisionCliente: cliente.comisionCliente,
      totalCliente: cliente.totalCliente,
      comisionProveedor: proveedor.comisionProveedor,
      pagoNeto: proveedor.pagoNeto,
      margenPlataforma: cliente.comisionCliente + proveedor.comisionProveedor,
    }
  }, [precio])

  if (completado) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-background to-background flex items-center justify-center p-4 pt-24">
        <Card className="max-w-md w-full shadow-xl">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">Pago completado</h2>
            <p className="text-muted-foreground mb-1">
              Los fondos quedan retenidos en escrow de forma segura.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Solo se liberaran al profesional cuando confirmes la finalizacion del trabajo.
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm bg-muted/40 rounded-lg p-4 mb-6 text-left">
              <span className="text-muted-foreground">Importe pagado</span>
              <span className="text-right font-semibold">{formatearPrecio(desglose.totalCliente)}</span>
              <span className="text-muted-foreground">Estado</span>
              <span className="text-right">
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                  En escrow
                </Badge>
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setCompletado(false)}>
                Reiniciar demo
              </Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" asChild>
                <Link href="/">Ir al inicio</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" className="mb-4 -ml-3" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver al inicio
            </Link>
          </Button>
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
              <Sparkles className="h-3 w-3" />
              Demo interactiva
            </Badge>
            <span className="text-xs text-muted-foreground">No se cobrara nada real</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Vista previa del pago con escrow</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Asi es como un cliente ve el desglose de comisiones al pagar un trabajo. Modifica el precio
            acordado para ver como cambian las cifras en tiempo real.
          </p>
        </div>

        {/* Price configurator */}
        <Card className="mb-6 border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/10">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1">
                <Label htmlFor="precio-demo" className="text-sm font-medium mb-2 block">
                  Precio acordado con el profesional
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="precio-demo"
                    type="number"
                    min={50}
                    max={50000}
                    step={50}
                    value={precio}
                    onChange={(e) => setPrecio(Math.max(50, Math.min(50000, Number(e.target.value) || 0)))}
                    className="max-w-[160px] text-lg font-semibold"
                  />
                  <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">EUR</span>
                </div>
                <Slider
                  value={[precio]}
                  onValueChange={(v) => setPrecio(v[0])}
                  min={50}
                  max={10000}
                  step={50}
                  className="mt-4"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>50€</span>
                  <span>10.000€</span>
                </div>
              </div>
              <div className="md:w-px md:h-20 md:bg-border" />
              <div className="grid grid-cols-2 md:flex md:flex-col gap-3 text-sm">
                {[500, 1500, 3500, 8000].map((v) => (
                  <Button
                    key={v}
                    variant={precio === v ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPrecio(v)}
                    className={precio === v ? "bg-emerald-600 hover:bg-emerald-700" : "bg-transparent"}
                  >
                    {formatearPrecio(v)}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left sidebar: Job info + breakdown */}
          <div className="lg:col-span-1 space-y-6">
            {/* Job summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-emerald-600" />
                  Resumen del trabajo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="font-medium leading-snug">Renovacion integral cocina 12 m2</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Demolicion, electricidad, fontaneria, alicatado y montaje de muebles
                  </p>
                </div>
                <Separator />
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    <span>Profesional: Reformas Garcia S.L.</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>Madrid, Espana</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Inicio estimado: 12 jun 2026</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Escrow info */}
            <Card className="border-emerald-200/60 dark:border-emerald-900/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Pago protegido con escrow
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Tu pago queda retenido de forma segura. Solo se libera al profesional cuando confirmas
                  que el trabajo esta finalizado correctamente.
                </p>
                <div className="space-y-2 pt-1">
                  {[
                    "Pago 100% seguro con Stripe",
                    "Fondos retenidos hasta confirmacion",
                    "Reembolso si no estas satisfecho",
                    "Mediacion gratuita en disputas",
                  ].map((t) => (
                    <div key={t} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main: breakdown + payment */}
          <div className="lg:col-span-2 space-y-6">
            {/* Client breakdown */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-emerald-600" />
                  Desglose de tu pago
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Precio acordado con el profesional</span>
                    <span className="font-medium">{formatearPrecio(desglose.precioBase)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-muted-foreground">
                        Comision plataforma
                      </span>
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-normal">
                        +{PLATFORM_CONFIG.comisionClientePorcentaje}%
                      </Badge>
                    </div>
                    <span className="font-medium">{formatearPrecio(desglose.comisionCliente)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center pt-1">
                    <div>
                      <span className="text-base font-semibold">Total a pagar hoy</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cargado a tu metodo de pago
                      </p>
                    </div>
                    <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                      {formatearPrecio(desglose.totalCliente)}
                    </span>
                  </div>
                </div>

                {/* Provider breakdown */}
                <div className="rounded-lg bg-muted/40 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      El profesional recibira
                    </h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Precio acordado</span>
                      <span>{formatearPrecio(desglose.precioBase)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Comision plataforma (-{PLATFORM_CONFIG.comisionProveedorPorcentaje}%)
                      </span>
                      <span className="text-rose-600 dark:text-rose-400">
                        -{formatearPrecio(desglose.comisionProveedor)}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Pago neto al profesional</span>
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {formatearPrecio(desglose.pagoNeto)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Platform margin (transparent) */}
                <div className="rounded-lg border border-dashed border-border p-4">
                  <div className="flex justify-between items-center text-sm">
                    <div>
                      <p className="font-medium">Margen total de la plataforma</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {PLATFORM_CONFIG.comisionClientePorcentaje}% del cliente +{" "}
                        {PLATFORM_CONFIG.comisionProveedorPorcentaje}% del profesional
                      </p>
                    </div>
                    <span className="font-semibold">{formatearPrecio(desglose.margenPlataforma)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Mock payment form */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Metodo de pago
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    className="flex items-center gap-3 p-3 rounded-lg border-2 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
                  >
                    <CreditCard className="h-5 w-5 text-emerald-600" />
                    <span className="font-medium text-sm">Tarjeta</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 ml-auto" />
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card text-muted-foreground"
                  >
                    <span className="font-bold text-sm">SEPA</span>
                    <span className="text-sm">Transferencia</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="card" className="text-xs">
                      Numero de tarjeta
                    </Label>
                    <Input
                      id="card"
                      placeholder="4242 4242 4242 4242"
                      defaultValue="4242 4242 4242 4242"
                      className="font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="exp" className="text-xs">
                        Caducidad
                      </Label>
                      <Input id="exp" placeholder="MM/AA" defaultValue="12/28" className="font-mono" />
                    </div>
                    <div>
                      <Label htmlFor="cvc" className="text-xs">
                        CVC
                      </Label>
                      <Input id="cvc" placeholder="123" defaultValue="123" className="font-mono" />
                    </div>
                    <div>
                      <Label htmlFor="zip" className="text-xs">
                        Codigo postal
                      </Label>
                      <Input id="zip" placeholder="28001" defaultValue="28001" />
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 text-base shadow-md"
                  onClick={() => setCompletado(true)}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Pagar {formatearPrecio(desglose.totalCliente)} de forma segura
                </Button>

                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-1">
                  <Lock className="h-3 w-3" />
                  <span>Pago cifrado SSL. Procesado por Stripe.</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Esta es una demostracion. No se realiza ningun cargo real ni se almacenan los datos
          introducidos.
        </p>
      </div>
    </div>
  )
}

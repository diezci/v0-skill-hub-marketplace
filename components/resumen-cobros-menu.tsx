"use client"

import { useEffect, useState } from "react"
import { AlertCircle, CalendarClock, Loader2, WalletCards } from "lucide-react"
import {
  obtenerEstadoStripeConnect,
  type EstadoStripeConnect,
} from "@/app/actions/stripe-connect"
import {
  describirCalendarioStripe,
  formatearFechaStripe,
  formatearImporteStripe,
  saldoPrincipalStripe,
} from "@/lib/stripe-connect-presentacion"

export function ResumenCobrosMenu() {
  const [estado, setEstado] = useState<EstadoStripeConnect | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true

    const cargar = async () => {
      const resultado = await obtenerEstadoStripeConnect()
      if (!activo) return
      if (resultado.error) setError(resultado.error)
      else setEstado(resultado.data || null)
      setCargando(false)
    }

    void cargar()
    return () => {
      activo = false
    }
  }, [])

  if (cargando) {
    return (
      <div className="mx-1 my-1 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Consultando saldo de Stripe…
      </div>
    )
  }

  if (error || !estado) {
    return (
      <div className="mx-1 my-1 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
        <span className="flex items-center gap-1.5 font-medium">
          <AlertCircle className="h-3.5 w-3.5" /> No se pudo consultar Stripe
        </span>
        <p className="mt-1 text-destructive/80">{error || "Inténtalo de nuevo en unos minutos."}</p>
      </div>
    )
  }

  if (!estado.conectado) {
    return (
      <div className="mx-1 my-1 rounded-lg bg-muted/60 px-3 py-2.5 text-xs">
        <p className="flex items-center gap-1.5 font-medium">
          <WalletCards className="h-3.5 w-3.5 text-emerald-600" /> Cobros profesionales
        </p>
        <p className="mt-1 text-muted-foreground">Activa Stripe para empezar a recibir tus cobros.</p>
      </div>
    )
  }

  if (!estado.saldo) {
    return (
      <div className="mx-1 my-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs">
        <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
          <AlertCircle className="h-3.5 w-3.5" /> Saldo no disponible
        </p>
        <p className="mt-1 text-muted-foreground">
          {estado.saldoError || "Stripe no ha facilitado el saldo en este momento."}
        </p>
      </div>
    )
  }

  const saldo = saldoPrincipalStripe(estado)
  const total = saldo.disponible + saldo.pendiente
  const proximoIngreso = estado.saldo?.proximoIngreso
  const proximaDisponibilidad = estado.saldo?.proximaDisponibilidad

  return (
    <div className="mx-1 my-1 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-3" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Saldo en Stripe</p>
          <p className="mt-0.5 text-xl font-semibold tracking-tight">
            {formatearImporteStripe(total, saldo.moneda)}
          </p>
        </div>
        {!estado.saldo.modoReal && (
          <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-700">
            Prueba
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Disponible {formatearImporteStripe(saldo.disponible, saldo.moneda)} · Pendiente{" "}
        {formatearImporteStripe(saldo.pendiente, saldo.moneda)}
      </p>
      <div className="mt-2.5 flex gap-2 border-t border-emerald-500/10 pt-2.5 text-xs">
        <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <div>
          <p className="font-medium">Próximo cobro</p>
          <p className="mt-0.5 leading-snug text-muted-foreground">
            {proximoIngreso
              ? `${formatearImporteStripe(proximoIngreso.importe, proximoIngreso.moneda)} llegará ${formatearFechaStripe(proximoIngreso.llegada)}`
              : proximaDisponibilidad
                ? `Parte del saldo estará disponible ${formatearFechaStripe(proximaDisponibilidad.fecha)}; después se enviará ${describirCalendarioStripe(estado)}.`
                : estado.saldoError
                  ? "Stripe no ha podido confirmar ahora la fecha del próximo ingreso."
                  : saldo.disponible > 0
                  ? `Se enviará ${describirCalendarioStripe(estado)}; Stripe aún no ha creado el próximo ingreso.`
                  : "No hay ingresos bancarios programados."}
          </p>
        </div>
      </div>
    </div>
  )
}

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { BotonImprimir } from "@/components/boton-imprimir"
import { PLATFORM_CONFIG, calcularTotalCliente, calcularPagoProveedor } from "@/lib/comisiones"
import { obtenerDatosContratacion, formatearEuros, formatearFechaLarga } from "../datos"

// Lee la sesión: siempre dinámico (nunca shell estático).
export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Factura | Diime" }

const ETIQUETA_ESTADO_PAGO: Record<string, string> = {
  pendiente: "Pendiente de pago",
  fondos_retenidos: "Pagado · retenido en custodia",
  completado: "Pagado · liberado al profesional",
  reembolsado: "Reembolsado al cliente",
  disputa: "Congelado por disputa",
}

export default async function FacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const datos = await obtenerDatosContratacion(id)
  if (!datos) notFound()

  const { trabajo, cliente, profesional, escrow, esCliente, esProfesional, esAdmin } = datos
  const { comisionCliente, totalCliente } = calcularTotalCliente(trabajo.precio_acordado || 0)
  const { comisionProveedor, pagoNeto } = calcularPagoProveedor(trabajo.precio_acordado || 0)
  const anio = new Date(escrow?.fecha_retencion || trabajo.created_at).getFullYear()
  const numero = `FAC-${anio}-${String(trabajo.id).slice(0, 8).toUpperCase()}`
  const fechaEmision = escrow?.fecha_retencion || trabajo.created_at

  return (
    <div className="container mx-auto px-4 pt-24 pb-16 max-w-3xl">
      <style>{`@media print { header, footer, .no-print { display: none !important } body { background: white } }`}</style>

      <div className="flex items-start justify-between mb-8 no-print">
        <div />
        <BotonImprimir />
      </div>

      <div className="rounded-xl border bg-card p-8 md:p-10 space-y-8 print:border-0 print:p-0">
        {/* Cabecera */}
        <div className="flex items-start justify-between border-b pb-6">
          <div>
            <h1 className="text-2xl font-bold">Factura</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Nº {numero} · Emitida el {formatearFechaLarga(fechaEmision)}
            </p>
            {escrow?.estado && (
              <p className="text-sm font-medium mt-1">
                Estado del pago: {ETIQUETA_ESTADO_PAGO[escrow.estado] || escrow.estado}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center ml-auto">
              <span className="text-white font-bold text-lg">D</span>
            </div>
            <p className="text-sm font-semibold mt-2">Diime</p>
            <p className="text-xs text-muted-foreground">diime.es · contacto@diime.es</p>
          </div>
        </div>

        {/* Partes */}
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Facturar a (cliente)</p>
            <p className="font-medium">
              {cliente?.nombre} {cliente?.apellido}
            </p>
            {cliente?.email && <p className="text-muted-foreground">{cliente.email}</p>}
            {cliente?.ubicacion && <p className="text-muted-foreground">{cliente.ubicacion}</p>}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Servicio prestado por</p>
            <p className="font-medium">
              {profesional?.nombre} {profesional?.apellido}
            </p>
            {profesional?.email && <p className="text-muted-foreground">{profesional.email}</p>}
          </div>
        </div>

        {/* Concepto. Privacidad económica: los gastos de servicio del cliente
            y su total solo los ve el cliente (y un admin); el profesional ve
            su liquidación, nunca lo que Diime cobra al cliente. */}
        <section className="text-sm">
          <h2 className="font-semibold text-base mb-3">Concepto</h2>
          <div className="rounded-lg border divide-y">
            <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-2.5">
              <div>
                <p className="font-medium">{trabajo.titulo}</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Servicio profesional contratado a través de Diime · Ref. TRB-
                  {String(trabajo.id).slice(0, 8).toUpperCase()}
                </p>
              </div>
              <span className="font-medium">{formatearEuros(escrow?.monto_base ?? trabajo.precio_acordado)}</span>
            </div>
            {(esCliente || esAdmin) && (
              <>
                <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-2.5">
                  <span>
                    Gastos de servicio Diime ({PLATFORM_CONFIG.comisionClientePorcentaje}%, mín.{" "}
                    {formatearEuros(PLATFORM_CONFIG.comision_minima)})
                  </span>
                  <span className="font-medium">{formatearEuros(escrow?.comision_cliente ?? comisionCliente)}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 bg-muted/40">
                  <span className="font-semibold">Total pagado por el cliente</span>
                  <span className="font-bold text-lg">{formatearEuros(escrow?.monto ?? totalCliente)}</span>
                </div>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Impuestos incluidos en los importes cuando resulten aplicables.</p>
        </section>

        {/* Liquidación del profesional: solo la ve el profesional (y un admin). */}
        {(esProfesional || esAdmin) && (
          <section className="text-sm">
            <h2 className="font-semibold text-base mb-3">Liquidación del profesional</h2>
            <div className="rounded-lg border divide-y">
              <div className="flex justify-between px-4 py-2.5">
                <span>Precio del servicio</span>
                <span className="font-medium">{formatearEuros(escrow?.monto_base ?? trabajo.precio_acordado)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span>Gastos de servicio Diime ({PLATFORM_CONFIG.comisionProveedorPorcentaje}%)</span>
                <span className="font-medium text-destructive">
                  −{formatearEuros(escrow?.comision_proveedor ?? comisionProveedor)}
                </span>
              </div>
              <div className="flex justify-between px-4 py-3 bg-muted/40">
                <span className="font-semibold">Neto a percibir por el profesional</span>
                <span className="font-bold">{formatearEuros(escrow?.pago_neto_proveedor ?? pagoNeto)}</span>
              </div>
            </div>
            {escrow?.fecha_liberacion && (
              <p className="text-xs text-muted-foreground mt-2">
                Pago liberado al profesional el {formatearFechaLarga(escrow.fecha_liberacion)}.
              </p>
            )}
          </section>
        )}
        {escrow?.estado === "reembolsado" && (
          <p className="text-xs text-muted-foreground">
            Reembolsado al cliente: {formatearEuros(escrow.monto_reembolsado)} el{" "}
            {formatearFechaLarga(escrow.fecha_reembolso)}.
          </p>
        )}

        <p className="text-xs text-muted-foreground border-t pt-4">
          Documento generado automáticamente por Diime (diime.es) como plataforma intermediaria del pago protegido.
          El pago se retiene en custodia y se libera al profesional cuando el cliente confirma la entrega.
        </p>
      </div>
    </div>
  )
}

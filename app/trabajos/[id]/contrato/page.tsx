import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { BotonImprimir } from "@/components/boton-imprimir"
import { PLATFORM_CONFIG, calcularTotalCliente, calcularPagoProveedor } from "@/lib/comisiones"
import {
  obtenerDatosContratacion,
  formatearEuros,
  formatearFechaLarga,
  etiquetaMateriales,
} from "../datos"

// Lee la sesión: siempre dinámico (nunca shell estático).
export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Contrato de servicio | Diime" }

export default async function ContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const datos = await obtenerDatosContratacion(id)
  if (!datos) notFound()

  const { trabajo, cliente, profesional, tituloProfesional, oferta, solicitud, escrow, esCliente, esProfesional, esAdmin } = datos
  const { comisionCliente, totalCliente } = calcularTotalCliente(trabajo.precio_acordado || 0)
  const { comisionProveedor, pagoNeto } = calcularPagoProveedor(trabajo.precio_acordado || 0)
  const numero = `TRB-${String(trabajo.id).slice(0, 8).toUpperCase()}`

  const plazo = oferta?.tiempo_estimado
    ? `${oferta.tiempo_estimado} ${oferta.unidad_tiempo || "días"} desde el inicio del trabajo`
    : "Según lo acordado entre las partes"

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
            <p className="text-sm text-muted-foreground">Diime · Contratación de servicios profesionales</p>
            <h1 className="text-2xl font-bold mt-1">Contrato de prestación de servicio</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Referencia {numero} · Fecha de contratación: {formatearFechaLarga(trabajo.created_at)}
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-lg">D</span>
          </div>
        </div>

        {/* Partes */}
        <section>
          <h2 className="font-semibold mb-3">1. Partes</h2>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Cliente</p>
              <p className="font-medium">
                {cliente?.nombre} {cliente?.apellido}
              </p>
              {cliente?.email && <p className="text-muted-foreground">{cliente.email}</p>}
              {cliente?.ubicacion && <p className="text-muted-foreground">{cliente.ubicacion}</p>}
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Profesional</p>
              <p className="font-medium">
                {profesional?.nombre} {profesional?.apellido}
              </p>
              {tituloProfesional && <p className="text-muted-foreground">{tituloProfesional}</p>}
              {profesional?.email && <p className="text-muted-foreground">{profesional.email}</p>}
            </div>
          </div>
        </section>

        {/* Detalle del servicio: se genera a partir de la propuesta del
            profesional y es exactamente lo que el cliente aceptó. */}
        <section className="text-sm space-y-3">
          <h2 className="font-semibold text-base">2. Detalle del servicio contratado</h2>
          <p className="font-medium">{trabajo.titulo}</p>
          {solicitud?.descripcion && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Necesidad publicada por el cliente: </span>
              {solicitud.descripcion}
            </p>
          )}
          <div className="rounded-lg border p-4 space-y-2 bg-muted/20">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Propuesta del profesional aceptada por el cliente
            </p>
            {(oferta?.descripcion || trabajo.descripcion) && (
              <p>
                <span className="font-medium">Servicio incluido: </span>
                <span className="text-muted-foreground">{oferta?.descripcion || trabajo.descripcion}</span>
              </p>
            )}
            <p>
              <span className="font-medium">Materiales: </span>
              <span className="text-muted-foreground">{etiquetaMateriales(oferta?.materiales_incluidos)}</span>
            </p>
            {oferta?.condiciones_pago && (
              <p>
                <span className="font-medium">Condiciones de pago propuestas: </span>
                <span className="text-muted-foreground">{oferta.condiciones_pago}</span>
              </p>
            )}
            {oferta?.notas && (
              <p>
                <span className="font-medium">Notas del profesional: </span>
                <span className="text-muted-foreground">{oferta.notas}</span>
              </p>
            )}
          </div>
          <p className="text-muted-foreground">
            Al aceptar la oferta, el cliente acepta este detalle del servicio tal y como lo propuso el
            profesional. Todo lo no incluido expresamente en este detalle queda fuera del encargo.
          </p>
        </section>

        {/* Condiciones */}
        <section className="text-sm">
          <h2 className="font-semibold text-base mb-3">3. Condiciones de ejecución</h2>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            <div className="flex justify-between sm:block">
              <dt className="text-muted-foreground">Lugar de realización / entrega</dt>
              <dd className="font-medium">{trabajo.ubicacion || solicitud?.ubicacion || "A convenir"}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted-foreground">Plazo estimado</dt>
              <dd className="font-medium">{plazo}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted-foreground">Fecha de inicio</dt>
              <dd className="font-medium">{formatearFechaLarga(trabajo.fecha_inicio)}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted-foreground">Entrega estimada</dt>
              <dd className="font-medium">{formatearFechaLarga(trabajo.fecha_estimada_fin)}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted-foreground">Materiales</dt>
              <dd className="font-medium">{etiquetaMateriales(oferta?.materiales_incluidos)}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted-foreground">Condiciones de pago</dt>
              <dd className="font-medium">
                {oferta?.condiciones_pago ||
                  "Pago único por adelantado, retenido en custodia (escrow) por Diime"}
              </dd>
            </div>
          </dl>
        </section>

        {/* Importes */}
        <section className="text-sm">
          <h2 className="font-semibold text-base mb-3">4. Precio del servicio</h2>
          {/* Privacidad económica: cada parte ve únicamente su propio lado.
              El cliente no conoce los gastos de servicio del profesional y
              viceversa; a cada uno se le informó de los suyos antes de
              contratar (al pagar / al enviar el presupuesto). */}
          <div className="rounded-lg border divide-y">
            <div className="flex justify-between px-4 py-2">
              <span>Precio del servicio acordado entre las partes</span>
              <span className="font-medium">{formatearEuros(trabajo.precio_acordado)}</span>
            </div>
            {(esCliente || esAdmin) && (
              <>
                <div className="flex justify-between px-4 py-2">
                  <span>
                    Gastos de servicio de la plataforma ({PLATFORM_CONFIG.comisionClientePorcentaje}%, mín.{" "}
                    {formatearEuros(PLATFORM_CONFIG.comision_minima)})
                  </span>
                  <span className="font-medium">+{formatearEuros(escrow?.comision_cliente ?? comisionCliente)}</span>
                </div>
                <div className="flex justify-between px-4 py-2 bg-muted/40">
                  <span className="font-semibold">Total a pagar por el cliente</span>
                  <span className="font-semibold">{formatearEuros(escrow?.monto ?? totalCliente)}</span>
                </div>
              </>
            )}
            {(esProfesional || esAdmin) && (
              <>
                <div className="flex justify-between px-4 py-2">
                  <span>Gastos de servicio de la plataforma ({PLATFORM_CONFIG.comisionProveedorPorcentaje}%)</span>
                  <span className="font-medium">
                    −{formatearEuros(escrow?.comision_proveedor ?? comisionProveedor)}
                  </span>
                </div>
                <div className="flex justify-between px-4 py-2 bg-muted/40">
                  <span className="font-semibold">Neto a percibir por el profesional</span>
                  <span className="font-semibold">{formatearEuros(escrow?.pago_neto_proveedor ?? pagoNeto)}</span>
                </div>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Los gastos de servicio de Diime aplicables a cada parte se comunican a cada una por separado antes de
            la contratación y no forman parte del precio acordado entre las partes.
          </p>
        </section>

        {/* Protección y resolución */}
        <section className="text-sm space-y-2">
          <h2 className="font-semibold text-base">5. Pago protegido, cancelación y disputas</h2>
          <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
            <li>
              El importe abonado por el cliente queda <span className="font-medium text-foreground">retenido en custodia</span>{" "}
              por Diime y solo se libera al profesional cuando el cliente confirma la entrega del trabajo.
            </li>
            <li>
              Cualquiera de las partes puede solicitar la <span className="font-medium text-foreground">cancelación de mutuo acuerdo</span>{" "}
              antes de la entrega. Si la otra parte la acepta y el trabajo ya estaba pagado, el cliente recibe el{" "}
              <span className="font-medium text-foreground">reembolso íntegro</span> automáticamente.
            </li>
            <li>
              Si la cancelación se rechaza, se abre automáticamente una <span className="font-medium text-foreground">disputa</span>{" "}
              que resuelve el equipo de Diime conforme a estos términos.{" "}
              <span className="font-medium text-foreground">En caso de duda, se resolverá a favor del cliente.</span>
            </li>
            <li>
              Si el cliente rechaza una entrega, se le reembolsa el importe pagado excepto los gastos de servicio
              de la plataforma, que no son reembolsables.
            </li>
            <li>
              La conversación y los archivos intercambiados en Diime forman parte de la documentación del encargo y
              podrán utilizarse como prueba en caso de disputa.
            </li>
          </ul>
        </section>

        <p className="text-xs text-muted-foreground border-t pt-4">
          Documento generado automáticamente por Diime (diime.es) a partir de la oferta aceptada y la demanda
          publicada. Referencia {numero}.
        </p>
      </div>
    </div>
  )
}

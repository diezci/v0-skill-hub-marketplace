import { getT } from "@/lib/i18n-servidor"
import { notFound } from "next/navigation"
import { BotonImprimir } from "@/components/boton-imprimir"
import { AdjuntosLista } from "@/components/adjuntos-lista"
import { DiimeLogo } from "@/components/diime-logo"
import {
  PLATFORM_CONFIG,
  calcularTotalCliente,
  calcularPagoProveedor,
  desglosarIvaIncluido,
} from "@/lib/comisiones"
import { obtenerDatosContratacion, formatearEuros, formatearFechaLarga, etiquetaMateriales } from "../datos"

// Lee la sesión: siempre dinámico (nunca shell estático).
export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { t } = await getT()
  return { title: t("Justificante y desglose fiscal | Diime") }
}

type DatosFacturacion = {
  empresa_nombre: string | null
  empresa_cif: string | null
  empresa_ubicacion: string | null
  empresa_email: string | null
  persona_nombre: string | null
  persona_apellido: string | null
  persona_documento: string | null
  persona_cargo: string | null
} | null

/** Identifica a las partes del servicio sin presentar el justificante como su factura fiscal. */
async function ParteFactura({
  titulo,
  facturacion,
  perfil,
  emailFallback,
}: {
  titulo: string
  facturacion: DatosFacturacion
  perfil: { nombre?: string | null; apellido?: string | null; ubicacion?: string | null } | null
  emailFallback?: string | null
}) {
  const { t } = await getT()

  const esEmpresa = !!facturacion?.empresa_nombre
  const persona = [facturacion?.persona_nombre ?? perfil?.nombre, facturacion?.persona_apellido ?? perfil?.apellido]
    .filter(Boolean)
    .join(" ")

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{titulo}</p>
      {esEmpresa ? (
        <>
          <p className="font-medium">{facturacion!.empresa_nombre}</p>
          {facturacion!.empresa_cif && <p className="text-muted-foreground">CIF: {facturacion!.empresa_cif}</p>}
          {facturacion!.empresa_ubicacion && (
            <p className="text-muted-foreground">{facturacion!.empresa_ubicacion}</p>
          )}
          {facturacion!.empresa_email && <p className="text-muted-foreground">{facturacion!.empresa_email}</p>}
          {persona && (
            <p className="text-muted-foreground mt-1">
              {t("En su nombre:")}{" "}{persona}
              {facturacion!.persona_cargo ? ` (${facturacion!.persona_cargo})` : ""}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="font-medium">{persona}</p>
          {facturacion?.persona_documento && (
            <p className="text-muted-foreground">NIF: {facturacion.persona_documento}</p>
          )}
          {emailFallback && <p className="text-muted-foreground">{emailFallback}</p>}
          {perfil?.ubicacion && <p className="text-muted-foreground">{perfil.ubicacion}</p>}
        </>
      )}
    </div>
  )
}

async function DetalleIvaDiime({ importe }: { importe: number }) {
  const { t, idioma } = await getT()

  const desglose = desglosarIvaIncluido(importe)

  return (
    <div className="space-y-1 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
      <div className="flex justify-between gap-4">
        <span>{t("Base imponible del servicio de Diime")}</span>
        <span>{formatearEuros(desglose.baseImponible, idioma)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span>{t("IVA de Diime (")}{PLATFORM_CONFIG.ivaDiimePorcentaje} %)</span>
        <span>{formatearEuros(desglose.cuotaIva, idioma)}</span>
      </div>
    </div>
  )
}

const ETIQUETA_ESTADO_PAGO: Record<string, string> = {
  pendiente: "Pendiente de pago",
  fondos_retenidos: "Pagado · pendiente de liquidación",
  liquidando: "Procesando reembolso/transferencia",
  completado: "Pagado · liberado al profesional",
  reembolsado: "Reembolsado al cliente",
  disputa: "Congelado por disputa",
}

export default async function FacturaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ vista?: string | string[] }>
}) {
  const { t, idioma } = await getT()

  const { id } = await params
  const consulta = await searchParams
  const datos = await obtenerDatosContratacion(id)
  if (!datos) notFound()

  const {
    trabajo,
    cliente,
    profesional,
    oferta,
    solicitud,
    escrow,
    esCliente,
    esProfesional,
    esAdmin,
    contratado,
    facturacionCliente,
    facturacionProfesional,
  } = datos
  const vistaSolicitada = Array.isArray(consulta.vista) ? consulta.vista[0] : consulta.vista
  const vistaAdmin =
    esAdmin && contratado && (vistaSolicitada === "cliente" || vistaSolicitada === "proveedor")
      ? vistaSolicitada
      : "completa"
  // La query solo cambia el documento para un admin. Cliente y profesional no
  // pueden usarla para ver la parte económica ajena.
  const mostrarCliente = esAdmin ? vistaAdmin !== "proveedor" : esCliente
  const mostrarProveedor = esAdmin ? vistaAdmin !== "cliente" : esProfesional
  const tituloDocumento = contratado ? t("Justificante de pago y desglose fiscal") : t("Propuesta y términos")
  const { comisionCliente, totalCliente } = calcularTotalCliente(trabajo.precio_acordado || 0)
  const baseOriginal = Number(escrow?.monto_base ?? trabajo.precio_acordado ?? 0)
  const liquidacionProveedorActual = calcularPagoProveedor(baseOriginal)
  const comisionProveedorOferta = Number(oferta?.comision_proveedor_prevista)
  const pagoNetoProveedorOferta = Number(oferta?.pago_neto_proveedor_previsto)
  const liquidacionOfertaValida =
    Number.isFinite(comisionProveedorOferta) &&
    comisionProveedorOferta >= 0 &&
    Number.isFinite(pagoNetoProveedorOferta) &&
    pagoNetoProveedorOferta >= 0 &&
    Math.round((comisionProveedorOferta + pagoNetoProveedorOferta) * 100) === Math.round(baseOriginal * 100)
  const comisionProveedor = liquidacionOfertaValida
    ? comisionProveedorOferta
    : liquidacionProveedorActual.comisionProveedor
  const pagoNeto = liquidacionOfertaValida ? pagoNetoProveedorOferta : liquidacionProveedorActual.pagoNeto
  const reembolsoCliente = Number(escrow?.monto_reembolsado ?? 0)
  const liquidacionCerrada = escrow?.liquidacion_estado === "completada" || ["completado", "reembolsado", "liberado"].includes(escrow?.estado)
  const brutoProveedor = liquidacionCerrada
    ? Number(escrow?.monto_bruto_proveedor ?? Math.max(baseOriginal - reembolsoCliente, 0))
    : baseOriginal
  const comisionProveedorReal = Number(escrow?.comision_proveedor ?? comisionProveedor)
  const pagoNetoReal = Number(escrow?.pago_neto_proveedor ?? pagoNeto)
  const comisionClienteOriginal = Number(escrow?.comision_cliente ?? comisionCliente)
  const totalClienteOriginal = Number(escrow?.monto ?? totalCliente)
  const porcentajeProveedorOferta = Number(oferta?.comision_proveedor_porcentaje)
  const minimoProveedorOferta = Number(oferta?.comision_proveedor_minima)
  const mostrarTarifaProveedorOferta =
    !escrow &&
    Number.isFinite(porcentajeProveedorOferta) &&
    Number.isFinite(minimoProveedorOferta)
  const anio = new Date(escrow?.fecha_retencion || trabajo.created_at).getFullYear()
  const numero = `${contratado ? "JUST" : "PROP"}-${anio}-${String(trabajo.id).slice(0, 8).toUpperCase()}`
  const fechaEmision = escrow?.fecha_retencion || trabajo.created_at
  const plazo = oferta?.tiempo_estimado
    ? t("{cantidad} {unidad} desde el inicio del trabajo", { cantidad: oferta.tiempo_estimado, unidad: t(oferta.unidad_tiempo || "días") })
    : t("Según lo acordado entre las partes")

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
            <h1 className="text-2xl font-bold">{tituloDocumento}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("Ref.")}{" "}{numero} {" "}{t("· Generado el")}{" "}
              {formatearFechaLarga(fechaEmision, idioma)}
            </p>
            {esAdmin && vistaAdmin !== "completa" && (
              <p className="text-xs font-medium text-primary mt-1">
                {t("Vista administrativa ·")}{" "}{vistaAdmin === "cliente" ? t("Cliente") : t("Proveedor")}
              </p>
            )}
            <p className="text-sm font-medium mt-1">
              {t("Estado del pago:")}{" "}
              {escrow?.estado ? t(ETIQUETA_ESTADO_PAGO[escrow.estado] || escrow.estado) : t("Pendiente de pago")}
            </p>
          </div>
          <div className="text-right">
            <DiimeLogo className="ml-auto h-10 w-10" />
            <p className="text-sm font-semibold mt-2">{t("Diime")}</p>
            <p className="text-xs text-muted-foreground">diime.es · contacto@diime.es</p>
          </div>
        </div>

        {/* Si una parte actúa por una empresa se identifica también a su representante. */}
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <ParteFactura
            titulo={t("Cliente")}
            facturacion={facturacionCliente}
            perfil={cliente}
            emailFallback={cliente?.email}
          />
          <ParteFactura
            titulo={t("Proveedor del servicio")}
            facturacion={facturacionProfesional}
            perfil={profesional}
            emailFallback={profesional?.email}
          />
        </div>

        {/* Detalle de la propuesta aceptada. Tras el pago pasa a ser el servicio contratado. */}
        <section className="text-sm space-y-3">
          <h2 className="font-semibold text-base">
            {contratado ? t("Detalle del servicio contratado") : t("Detalle de la propuesta aceptada")}
          </h2>
          <p className="font-medium">{trabajo.titulo}</p>
          {solicitud?.descripcion && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{t("Necesidad publicada por el cliente:")}{" "}</span>
              {solicitud.descripcion}
            </p>
          )}
          {Array.isArray(solicitud?.archivos) && solicitud.archivos.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                {t("Adjuntos de la publicación de la demanda")}</p>
              <AdjuntosLista archivos={solicitud.archivos} />
            </div>
          )}
          <div className="rounded-lg border p-4 space-y-2 bg-muted/20">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("Propuesta del profesional aceptada por el cliente")}</p>
            {(oferta?.descripcion || trabajo.descripcion) && (
              <p>
                <span className="font-medium">{t("Servicio incluido:")}{" "}</span>
                <span className="text-muted-foreground">{oferta?.descripcion || trabajo.descripcion}</span>
              </p>
            )}
            <p>
              <span className="font-medium">{t("Materiales:")} </span>
              <span className="text-muted-foreground">{etiquetaMateriales(oferta?.materiales_incluidos, idioma)}</span>
            </p>
            {oferta?.notas && (
              <p>
                <span className="font-medium">{t("Notas del profesional:")}{" "}</span>
                <span className="text-muted-foreground">{oferta.notas}</span>
              </p>
            )}
            {Array.isArray(oferta?.archivos) && oferta.archivos.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">{t("Adjuntos de la oferta aceptada")}</p>
                <AdjuntosLista archivos={oferta.archivos} />
              </div>
            )}
          </div>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            <div className="flex justify-between sm:block">
              <dt className="text-muted-foreground">{t("Lugar de realización / entrega")}</dt>
              <dd className="font-medium">{trabajo.ubicacion || solicitud?.ubicacion || t("A convenir")}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted-foreground">{t("Plazo estimado")}</dt>
              <dd className="font-medium">{plazo}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted-foreground">{t("Fecha de inicio")}</dt>
              <dd className="font-medium">{formatearFechaLarga(trabajo.fecha_inicio, idioma)}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted-foreground">{t("Entrega estimada")}</dt>
              <dd className="font-medium">{formatearFechaLarga(trabajo.fecha_estimada_fin, idioma)}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted-foreground">{t("Condiciones de pago")}</dt>
              <dd className="font-medium">
                {oferta?.condiciones_pago || t("Pago único por adelantado mediante Stripe; transferencia aplazada hasta la confirmación o resolución")}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            {t("Al aceptar la puja, el cliente aceptó este detalle del servicio tal y como lo propuso el profesional. Todo lo no incluido expresamente queda fuera del encargo.")}</p>
        </section>

        {/* Concepto. Privacidad económica: los gastos de servicio del cliente
            y su total solo los ve el cliente (y un admin); el profesional ve
            su liquidación, nunca lo que Diime cobra al cliente. */}
        <section className="text-sm">
          <h2 className="font-semibold text-base mb-3">{t("Importe")}</h2>
          <div className="rounded-lg border divide-y">
            <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-2.5">
              <div>
                <p className="font-medium">{trabajo.titulo}</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {contratado ? t("Servicio profesional contratado") : t("Servicio pendiente de pago")} {" "}{t("· Precio final indicado por el proveedor · Ref. TRB-")}{String(trabajo.id).slice(0, 8).toUpperCase()}
                </p>
              </div>
              <span className="font-medium">{formatearEuros(baseOriginal, idioma)}</span>
            </div>
            {mostrarCliente && (
              <>
                <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-2.5">
                  <span>
                    {t("Gastos de servicio Diime (IVA del")}{" "}{PLATFORM_CONFIG.ivaDiimePorcentaje} {" "}{t("% incluido)")}{!escrow && (
                      <> ({PLATFORM_CONFIG.comisionClientePorcentaje}{t("%, mín.")}{" "}{formatearEuros(PLATFORM_CONFIG.comision_minima, idioma)})</>
                    )}
                  </span>
                  <span className="font-medium">{formatearEuros(comisionClienteOriginal, idioma)}</span>
                </div>
                <DetalleIvaDiime importe={comisionClienteOriginal} />
                <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 bg-muted/40">
                  <span className="font-semibold">
                    {contratado ? t("Total pagado por el cliente") : t("Total pendiente de pago por el cliente")}
                  </span>
                  <span className="font-bold text-lg">{formatearEuros(totalClienteOriginal, idioma)}</span>
                </div>
                {reembolsoCliente > 0 && (
                  <>
                    <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-2.5 text-blue-700 dark:text-blue-300">
                      <span>{t("Reembolso del precio del servicio")}</span>
                      <span className="font-medium">−{formatearEuros(reembolsoCliente, idioma)}</span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-2.5">
                      <span className="font-semibold">{t("Coste final tras la resolución")}</span>
                      <span className="font-semibold">{formatearEuros(totalClienteOriginal - reembolsoCliente, idioma)}</span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {t("El precio del servicio es el importe final indicado por el proveedor e incluye los impuestos que le correspondan. Diime no calcula ni retiene esos impuestos.")}</p>
        </section>

        {/* Liquidación del profesional: solo la ve el profesional (y un admin). */}
        {mostrarProveedor && (
          <section className="text-sm">
            <h2 className="font-semibold text-base mb-3">{t("Liquidación del profesional")}</h2>
            <div className="rounded-lg border divide-y">
              <div className="flex justify-between px-4 py-2.5">
                <span>{reembolsoCliente > 0 ? t("Importe bruto adjudicado tras la resolución") : t("Precio del servicio")}</span>
                <span className="font-medium">{formatearEuros(brutoProveedor, idioma)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span>
                  {t("Gastos de servicio Diime (IVA del")}{" "}{PLATFORM_CONFIG.ivaDiimePorcentaje} {" "}{t("% incluido)")}{mostrarTarifaProveedorOferta && (
                    <> ({porcentajeProveedorOferta}{t("%, mín.")}{" "}{formatearEuros(minimoProveedorOferta, idioma)})</>
                  )}
                </span>
                <span className="font-medium text-destructive">
                  −{formatearEuros(comisionProveedorReal, idioma)}
                </span>
              </div>
              <DetalleIvaDiime importe={comisionProveedorReal} />
              <div className="flex justify-between px-4 py-3 bg-muted/40">
                <span className="font-semibold">
                  {contratado ? t("Neto a percibir por el profesional") : t("Neto previsto para el profesional")}
                </span>
                <span className="font-bold">{formatearEuros(pagoNetoReal, idioma)}</span>
              </div>
            </div>
            {escrow?.fecha_liberacion && (
              <p className="text-xs text-muted-foreground mt-2">
                {t("Pago liberado al profesional el")}{" "}{formatearFechaLarga(escrow.fecha_liberacion, idioma)}.
              </p>
            )}
          </section>
        )}
        {mostrarCliente && reembolsoCliente > 0 && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-muted-foreground">
            {t("Reembolsado al cliente:")}{" "}{formatearEuros(reembolsoCliente, idioma)}{escrow.fecha_reembolso ? ` ${t("el {fecha}", { fecha: formatearFechaLarga(escrow.fecha_reembolso, idioma) })}` : ""}.
            {reembolsoCliente < totalClienteOriginal && (
              <> {" "}{t("La comisión inicial del cliente (")}{formatearEuros(comisionClienteOriginal, idioma)}{t(") no se reduce: cubre el servicio de pago protegido y gestión de la disputa.")}</>
            )}
          </div>
        )}

        <section className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm space-y-2">
          <h2 className="font-semibold text-base">{t("Responsabilidades fiscales")}</h2>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">{t("Servicios de Diime:")}{" "}</span>
            {t("los gastos de servicio mostrados en este documento incluyen el IVA del")}{" "}
            {PLATFORM_CONFIG.ivaDiimePorcentaje} {" "}{t("%. Diime es responsable de declarar el IVA correspondiente a sus propias comisiones.")}</p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">{t("Servicio profesional:")}{" "}</span>
            {t("el proveedor es quien presta el servicio y quien debe determinar su tratamiento fiscal, emitir la factura al cliente y declarar e ingresar el IVA cuando corresponda. Diime no emite esa factura ni declara el IVA del proveedor.")}</p>
          <p className="text-xs text-muted-foreground">
            {t("Este documento acredita la contratación, el pago y la liquidación, pero no sustituye las facturas fiscales que deban emitir Diime y el proveedor por sus respectivos servicios.")}</p>
        </section>

        {/* Términos y condiciones del servicio (antes en un contrato aparte) */}
        <section className="text-sm space-y-2 border-t pt-6">
          <h2 className="font-semibold text-base">{t("Términos y condiciones")}</h2>
          <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
            <li>
              {t("El importe abonado por el cliente queda")}{" "}
              <span className="font-medium text-foreground">{t("cobrado mediante Stripe con la transferencia aplazada")}</span> {" "}{t("y solo se abona al profesional cuando el cliente confirma la entrega del trabajo.")}</li>
            <li>
              {t("Cualquiera de las partes puede solicitar la")}{" "}
              <span className="font-medium text-foreground">{t("cancelación de mutuo acuerdo")}</span> {" "}{t("antes de la entrega. Si la otra parte la acepta y el trabajo ya estaba pagado, el cliente recibe el")}{" "}
              <span className="font-medium text-foreground">{t("reembolso íntegro")}</span> {" "}{t("automáticamente.")}</li>
            <li>
              {t("Si la cancelación se rechaza, se abre automáticamente una")}{" "}
              <span className="font-medium text-foreground">{t("disputa")}</span> {" "}{t("que resuelve el equipo de Diime conforme a estos términos.")}{" "}
              <span className="font-medium text-foreground">{t("En caso de duda, se resolverá a favor del cliente.")}</span>
            </li>
            <li>
              {t("Si el cliente rechaza una entrega, se le reembolsa el importe pagado excepto los gastos de servicio de la plataforma, que no son reembolsables.")}</li>
            <li>
              {t("La conversación y los archivos intercambiados en Diime forman parte de la documentación del encargo y podrán utilizarse como prueba en caso de disputa.")}</li>
            <li>
              {t("La resolución de disputas por parte de Diime es una mediación privada entre las partes y no impide ni sustituye cualquier otra acción legal que cada parte pueda emprender por su cuenta.")}</li>
          </ul>
        </section>

        <p className="text-xs text-muted-foreground border-t pt-4">
          {contratado
            ? t("Justificante generado automáticamente por Diime (diime.es) como plataforma intermediaria del pago protegido. Recoge el servicio contratado, los importes, los términos, el reembolso y la liquidación cuando corresponden. La transferencia al profesional se ejecuta tras la confirmación o resolución.")
            : t("Documento informativo generado por Diime (diime.es). Recoge la propuesta aceptada, los importes previstos y sus términos, pero la contratación queda pendiente hasta que el cliente complete el pago protegido.")}
        </p>
      </div>
    </div>
  )
}

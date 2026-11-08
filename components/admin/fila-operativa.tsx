"use client"

import Link from "next/link"
import { useIdioma } from "@/components/idioma-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { localeDe, type Idioma } from "@/lib/i18n"
import type { ControlOperativo } from "@/lib/operaciones-catalogo"
import { formatearRangoPresupuesto } from "@/lib/utils"

type Fila = { id: string; [campo: string]: unknown }
const texto = (valor: unknown) => typeof valor === "string" ? valor : ""
const registro = (valor: unknown): Record<string, unknown> => valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : {}
const urgencias: Record<string, string> = { baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente" }
const estados: Record<string, string> = {
  abierta: "Abierta", en_revision: "En revisión", pendiente: "Pendiente", pendiente_pago: "Pendiente de pago",
  en_progreso: "En curso", entregado: "Entregado", en_disputa: "En disputa", disputa: "En disputa",
  error: "Necesita revisión", procesando: "Procesando", completada: "Completada", completado: "Completado",
  fondos_retenidos: "Fondos retenidos", liquidando: "Liquidando", reembolsado: "Reembolsado", pago_tardio: "Pago tardío",
  pending: "Pendiente en Stripe", requires_action: "Requiere una acción en Stripe", succeeded: "Procesado por Stripe",
  needs_response: "Respuesta pendiente", warning_needs_response: "Respuesta pendiente", under_review: "En revisión bancaria",
}

function FechaOperativa({ valor, etiqueta, idioma, observadoEn }: { valor: unknown; etiqueta: string; idioma: Idioma; observadoEn: string }) {
  const { t } = useIdioma()
  const fecha = new Date(texto(valor))
  if (!Number.isFinite(fecha.getTime())) return <p className="text-xs text-muted-foreground">{t(etiqueta)}: {t("No consta")}</p>
  const diferencia = fecha.getTime() - new Date(observadoEn).getTime()
  const unidad = Math.abs(diferencia) < 3600000 ? "minute" : Math.abs(diferencia) < 86400000 ? "hour" : "day"
  const divisor = unidad === "minute" ? 60000 : unidad === "hour" ? 3600000 : 86400000
  const relativa = Number.isFinite(diferencia) ? new Intl.RelativeTimeFormat(localeDe(idioma), { numeric: "auto" }).format(Math.round(diferencia / divisor), unidad) : ""
  return <p className="text-xs text-muted-foreground">{t(etiqueta)}: <time dateTime={fecha.toISOString()}>{fecha.toLocaleString(localeDe(idioma), { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" })}</time>{relativa && ` · ${relativa}`}</p>
}

export function FilaOperativa({ categoria, fila, observadoEn, resolviendo, accionesDeshabilitadas, onResolver }: {
  categoria: ControlOperativo
  fila: Fila
  observadoEn: string
  resolviendo: boolean
  accionesDeshabilitadas: boolean
  onResolver: (id: string) => void
}) {
  const { t, idioma } = useIdioma()
  const enlaceUsuario = (id: unknown, etiqueta: string) => texto(id) ? <Link href={`/admin/usuarios/${encodeURIComponent(texto(id))}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">{t(etiqueta)}</Link> : null
  const importe = (valor: unknown, moneda = "EUR") => {
    if (valor == null || valor === "" || !Number.isFinite(Number(valor))) return t("No consta")
    return new Intl.NumberFormat(localeDe(idioma), { style: "currency", currency: moneda }).format(Number(valor))
  }
  const resumenClase = "min-h-11 w-fit cursor-pointer rounded-md px-1 py-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

  if (categoria === "solicitudesSinOferta") return (
    <article className="min-w-0 rounded-xl border p-4 [overflow-wrap:anywhere]">
      <h3 className="font-medium">{texto(fila.titulo)}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{texto(fila.ubicacion)}</p>
      <div className="mt-2"><FechaOperativa valor={fila.created_at} etiqueta="Publicada el" idioma={idioma} observadoEn={observadoEn} /></div>
      <details className="mt-2 min-w-0">
        <summary className={resumenClase}>{t("Ver demanda")}</summary>
        <div className="mt-3 min-w-0 space-y-4 border-t pt-4 text-sm">
          <div><h4 className="font-medium">{t("Descripción")}</h4><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{texto(fila.descripcion) || t("Sin descripción")}</p></div>
          <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div><dt className="font-medium">{t("Presupuesto")}</dt><dd className="mt-1 text-muted-foreground">{formatearRangoPresupuesto(fila.presupuesto_min as string | number | null, fila.presupuesto_max as string | number | null, idioma)}</dd></div>
            <div><dt className="font-medium">{t("Urgencia")}</dt><dd className="mt-1 text-muted-foreground">{t(urgencias[texto(fila.urgencia)] || "No indicada")}</dd></div>
            {texto(fila.fecha_necesaria) && <div><dt className="font-medium">{t("Fecha necesaria")}</dt><dd className="mt-1 text-muted-foreground"><time dateTime={texto(fila.fecha_necesaria)}>{new Date(texto(fila.fecha_necesaria)).toLocaleDateString(localeDe(idioma), { dateStyle: "short", timeZone: "UTC" })}</time></dd></div>}
          </dl>
          {enlaceUsuario(fila.cliente_id, "Ver cliente")}
        </div>
      </details>
    </article>
  )

  const esWebhook = categoria === "webhooksError" || categoria === "webhooksAtascados"
  const esPago = categoria === "liquidacionesError" || categoria === "liquidacionesAtascadas" || categoria === "reembolsosPendientes"
  const esDisputa = categoria === "disputasVencidas" || categoria === "contracargosPorResponder"
  const esIncidencia = categoria === "incidenciasCriticas" || categoria === "incidenciasPendientes"
  const esTrabajo = categoria === "pagosSinCompletar" || categoria === "entregasSinRevisar" || categoria === "cancelacionesPendientes"
  const trabajo = registro(fila.trabajo)
  const profesional = registro(fila.profesional)
  const responsable = registro(fila.responsable)
  const referencia = fila.id.slice(0, 8).toUpperCase()
  const titulo = categoria === "eventos" ? texto(fila.mensaje) || t("Aviso técnico")
    : esWebhook ? texto(fila.tipo) || t("Confirmación de Stripe")
    : esIncidencia ? texto(fila.asunto) || `${t("Incidencia")} ${referencia}`
    : categoria === "verificacionesPendientes" ? texto(profesional.titulo) || `${t("Verificación profesional")} ${referencia}`
    : texto(fila.titulo) || texto(trabajo.titulo) || `${esDisputa ? t("Disputa") : t("Pago")} ${referencia}`
  const estado = categoria === "eventos" ? t("Aviso por revisar")
    : esWebhook ? t(categoria === "webhooksError" ? "Necesita revisión" : "Procesando")
    : categoria === "reembolsosPendientes" ? t(estados[texto(fila.stripe_refund_status)] || "Pendiente en Stripe")
    : categoria === "contracargosPorResponder" ? t(estados[texto(fila.stripe_disputa_estado)] || "Respuesta pendiente")
    : esPago ? t(estados[texto(fila.liquidacion_estado)] || "Necesita revisión")
    : t(estados[texto(fila.estado)] || texto(fila.estado) || "No consta")
  const momento = categoria === "eventos" ? fila.ultimo_evento_at
    : esWebhook ? fila.ultimo_intento_at
    : categoria === "contracargosPorResponder" ? fila.stripe_disputa_plazo
    : categoria === "entregasSinRevisar" ? fila.fecha_entrega
    : categoria === "verificacionesPendientes" ? fila.solicitada_at
    : esPago || categoria === "cancelacionesPendientes" ? fila.updated_at : fila.created_at
  const etiquetaFecha = categoria === "eventos" ? "Última aparición"
    : esWebhook ? "Último intento"
    : categoria === "contracargosPorResponder" ? "Plazo para aportar pruebas"
    : categoria === "entregasSinRevisar" ? "Entregado el"
    : categoria === "verificacionesPendientes" ? "Solicitada el"
    : esPago || categoria === "cancelacionesPendientes" ? "Última actualización"
    : esTrabajo ? "Contrato creado el" : "Abierta desde"
  const detalles: { etiqueta: string; valor: string }[] = [{ etiqueta: "Referencia", valor: fila.id }]
  if (esWebhook) detalles.push({ etiqueta: "Intentos registrados", valor: fila.intentos == null ? t("No consta") : String(fila.intentos) })
  if (esPago) {
    detalles.push({ etiqueta: "Importe del pago", valor: importe(fila.monto) })
    if (fila.monto_reembolsado != null) detalles.push({ etiqueta: "Importe registrado para devolución", valor: importe(fila.monto_reembolsado) })
    if (texto(fila.stripe_refund_id)) detalles.push({ etiqueta: "Referencia del reembolso", valor: texto(fila.stripe_refund_id) })
    if (texto(fila.stripe_payment_intent_id)) detalles.push({ etiqueta: "Referencia de Stripe", valor: texto(fila.stripe_payment_intent_id) })
  }
  if (esDisputa) {
    detalles.push({ etiqueta: "Responsable de revisión", valor: [texto(responsable.nombre), texto(responsable.apellido)].filter(Boolean).join(" ") || t("Sin asignar") })
    if (responsable.es_admin === false) detalles.push({ etiqueta: "Asignación", valor: t("El responsable ya no es administrador") })
    if (texto(fila.stripe_disputa_id)) detalles.push({ etiqueta: "Expediente bancario", valor: texto(fila.stripe_disputa_id) })
    if (fila.stripe_disputa_importe != null && /^[a-z]{3}$/i.test(texto(fila.stripe_disputa_moneda))) detalles.push({ etiqueta: "Importe disputado", valor: importe(Number(fila.stripe_disputa_importe) / 100, texto(fila.stripe_disputa_moneda).toUpperCase()) })
  }
  if (esIncidencia) {
    const categorias: Record<string, string> = { pago: "Problema de pago", tecnico: "Problema técnico", perfil: "Perfil / verificación", fraude: "Fraude", abuso: "Abuso o conducta", otro: "Otro" }
    detalles.push({ etiqueta: "Categoría", valor: t(categorias[texto(fila.categoria)] || texto(fila.categoria) || "No consta") })
  }
  if (esTrabajo) detalles.push({ etiqueta: "Precio acordado", valor: importe(fila.precio_acordado) })
  if (categoria === "eventos") {
    detalles.push({ etiqueta: "Área", valor: texto(fila.area) }, { etiqueta: "Código", valor: texto(fila.codigo) })
    const contexto = registro(fila.contexto)
    for (const [clave, etiqueta] of [["tipo", "Tipo de aviso"], ["motivo", "Motivo registrado"], ["motivos", "Motivos registrados"]]) {
      if (texto(contexto[clave])) detalles.push({ etiqueta, valor: texto(contexto[clave]) })
    }
  }
  const error = texto(fila.liquidacion_error) || texto(fila.ultimo_error)

  return (
    <article className="min-w-0 rounded-xl border p-4 [overflow-wrap:anywhere]">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 basis-48 font-medium">{titulo}</h3>
        <Badge variant="outline" className="max-w-full whitespace-normal">{estado}</Badge>
      </div>
      <div className="mt-2"><FechaOperativa valor={momento} etiqueta={etiquetaFecha} idioma={idioma} observadoEn={observadoEn} /></div>
      {categoria === "eventos" && <p className="mt-2 text-xs text-muted-foreground">{t("{cantidad} apariciones acumuladas", { cantidad: typeof fila.ocurrencias === "number" ? fila.ocurrencias : 1 })}</p>}
      {esIncidencia && <p className="mt-2 text-xs text-muted-foreground">{t("Prioridad")}: {t(fila.prioridad === "critica" ? "Crítica" : urgencias[texto(fila.prioridad)] || "No indicada")}</p>}
      {categoria === "pagosSinCompletar" && <p className="mt-2 text-sm text-muted-foreground">{t("Comprueba si hay un cobro por conciliar antes de cerrar el contrato.")}</p>}
      {categoria === "cancelacionesPendientes" && <p className="mt-2 text-sm text-muted-foreground">{t("La fecha corresponde a la última modificación del trabajo; no confirma cuándo se solicitó la cancelación.")}</p>}
      {categoria === "reembolsosPendientes" && <p className="mt-2 text-sm text-muted-foreground">{t("El estado registrado no confirma que el banco haya abonado la devolución.")}</p>}
      <details className="mt-2 min-w-0">
        <summary className={resumenClase}>{t("Ver información")}</summary>
        <div className="mt-2 space-y-3 border-t pt-3 text-sm">
          <dl className="grid min-w-0 gap-3 sm:grid-cols-2">{detalles.filter(item => item.valor).map(item => <div key={item.etiqueta}><dt className="font-medium">{t(item.etiqueta)}</dt><dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.valor}</dd></div>)}</dl>
          {error && <div><p className="font-medium">{t("Error registrado")}</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{error}</p></div>}
          {esTrabajo && fila.pago_bloqueado === true && <p>{t("El pago está bloqueado para revisión.")}</p>}
          {esTrabajo && fila.cancelacion_estado === "pendiente" && <p>{t("Hay una cancelación pendiente de respuesta.")}</p>}
          {esTrabajo && texto(fila.cancelacion_aceptada_por) && <p>{t("La cancelación ya fue aceptada; revisa su conciliación.")}</p>}
        </div>
      </details>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        {esPago && <Link href={`/admin/pagos?escrow=${encodeURIComponent(fila.id)}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">{t("Revisar pago")}</Link>}
        {esTrabajo && <Link href={`/admin/pagos?trabajo=${encodeURIComponent(fila.id)}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">{t("Revisar pagos del trabajo")}</Link>}
        {esDisputa && <Link href={`/admin/disputas?disputa=${encodeURIComponent(fila.id)}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">{t("Revisar disputa")}</Link>}
        {esIncidencia && <Link href={`/admin/incidencias?incidencia=${encodeURIComponent(fila.id)}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">{t("Revisar incidencia")}</Link>}
        {categoria === "verificacionesPendientes" && <Link href="/admin/verificaciones" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">{t("Abrir verificaciones")}</Link>}
        {esWebhook && <Link href="/admin/pagos" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">{t("Abrir pagos")}</Link>}
        {enlaceUsuario(esIncidencia ? fila.reportado_por : categoria === "verificacionesPendientes" ? fila.profesional_id : fila.cliente_id, esIncidencia || categoria === "verificacionesPendientes" ? "Ver usuario" : "Ver cliente")}
        {categoria === "eventos" && <Button variant="outline" size="sm" disabled={resolviendo || accionesDeshabilitadas} onClick={() => onResolver(fila.id)}>{resolviendo ? t("Guardando…") : t("Marcar resuelto")}</Button>}
      </div>
    </article>
  )
}

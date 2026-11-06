"use client"

import { localeDe, type Idioma } from "@/lib/i18n"

import { useIdioma } from "@/components/idioma-provider"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { comprobarReembolsoAdmin, reintentarReembolsoAdmin } from "@/app/actions/admin-pagos"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import {
  CreditCard,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowDownRight,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  RefreshCw, Search, Eye,
} from "lucide-react"
import { formatearFecha } from "@/lib/utils"

interface Transaccion {
  id: string
  trabajo_id: string | null
  cliente_id: string | null
  profesional_id: string | null
  monto: number | null
  monto_base: number | null
  retencion_plataforma: number | null
  comision_cliente: number | null
  comision_proveedor: number | null
  pago_neto_proveedor: number | null
  monto_reembolsado: number | null
  estado: string
  stripe_payment_intent_id: string | null
  stripe_refund_id: string | null
  stripe_refund_status: string | null
  fecha_reembolso: string | null
  liquidacion_estado: string | null
  liquidacion_error: string | null
  created_at: string
  trabajo?: { titulo: string | null } | null
  cliente?: { nombre: string | null; apellido: string | null } | null
  profesional?: { nombre: string | null; apellido: string | null } | null
}

const eur = (v: number | null | undefined, idioma: Idioma) => new Intl.NumberFormat(localeDe(idioma), { style: "currency", currency: "EUR" }).format(v ?? 0)
// Solo las comisiones de ambas partes son ingreso bruto de Diime. Un reembolso
// al cliente nunca puede aparecer como comisión de la plataforma.
const comisionDe = (t: Transaccion) =>
  t.retencion_plataforma ?? Math.max(0, (t.comision_cliente ?? 0) + (t.comision_proveedor ?? 0))
// The fixed settlement amount is an intention, not proof of a refund. A partial
// refund can succeed while the provider transfer is still awaiting recovery.
const reembolsoProcesado = (p: Transaccion) => Boolean(
  p.stripe_refund_id && p.stripe_refund_status === "succeeded" && Number(p.monto_reembolsado) > 0,
)
const ESTADOS_REEMBOLSO: Record<string, string> = {
  succeeded: "Reembolso procesado por Stripe", pending: "Reembolso pendiente en Stripe",
  requires_action: "Reembolso requiere revisión", failed: "Reembolso fallido", canceled: "Reembolso cancelado",
}
type ReembolsoStripe = NonNullable<Awaited<ReturnType<typeof comprobarReembolsoAdmin>>["data"]>

export default function AdminPagosPage() {
  const { t, idioma } = useIdioma()

  const [transacciones, setTransacciones] = useState<Transaccion[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [verificandoId, setVerificandoId] = useState<string | null>(null)
  const [reintentando, setReintentando] = useState(false)
  const [resultadoReintento, setResultadoReintento] = useState<{ escrowId: string; mensaje: string } | null>(null)
  const [consultaStripe, setConsultaStripe] = useState<{ escrowId: string; data?: ReembolsoStripe; error?: string } | null>(null)
  const [filtroEstado, setFiltroEstado] = useState("todas")
  const params = useSearchParams()
  const router = useRouter()
  const usuarioId = params.get("usuario")
  const trabajoId = params.get("trabajo")
  const escrowId = params.get("escrow") || params.get("pago")
  const abiertoDesdeLink = useRef<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    cargarTransacciones()
  }, [])

  const cargarTransacciones = async () => {
    setLoading(true)
    setErrorCarga(null)
    try {
      const rows: any[] = []
      for (let desde = 0; ; desde += 500) {
        const { data, error } = await supabase.from("transacciones_escrow").select("*")
          .order("created_at", { ascending: false }).order("id", { ascending: false }).range(desde, desde + 499)
        if (error) throw error
        rows.push(...(data || []))
        if (!data || data.length < 500) break
      }

      // Enriquecer con título del trabajo y nombres de las partes (consultas
      // separadas para no depender de relaciones Fk frágiles en el embed).
      const trabajoIds = [...new Set(rows.map((r) => r.trabajo_id).filter(Boolean))]
      const userIds = [...new Set(rows.flatMap((r) => [r.cliente_id, r.profesional_id]).filter(Boolean))]

      const [trabajosRes, profilesRes] = await Promise.all([
        trabajoIds.length
          ? supabase.from("trabajos").select("id, titulo").in("id", trabajoIds)
          : Promise.resolve({ data: [] as any[] }),
        userIds.length
          ? supabase.from("profiles").select("id, nombre, apellido").in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
      ])

      const trabajoMap = new Map((trabajosRes.data || []).map((t: any) => [t.id, t]))
      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]))

      const enriquecidas: Transaccion[] = rows.map((r) => ({
        ...r,
        trabajo: r.trabajo_id ? { titulo: trabajoMap.get(r.trabajo_id)?.titulo ?? null } : null,
        cliente: r.cliente_id ? profileMap.get(r.cliente_id) ?? null : null,
        profesional: r.profesional_id ? profileMap.get(r.profesional_id) ?? null : null,
      }))

      setTransacciones(enriquecidas)
    } catch (error) {
      console.error("Error loading transactions:", error)
      setErrorCarga(t("No se pudieron cargar los pagos. Actualiza para volver a intentarlo."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!escrowId) { abiertoDesdeLink.current = null; return }
    if (loading || abiertoDesdeLink.current === escrowId || !transacciones.some(p => p.id === escrowId)) return
    abiertoDesdeLink.current = escrowId
    setDetalleId(escrowId)
  }, [escrowId, loading, transacciones])

  const detalle = transacciones.find(p => p.id === detalleId)
  const resultadoStripe = consultaStripe?.escrowId === detalleId ? consultaStripe : null
  const comprobarReembolso = async (id: string) => {
    setVerificandoId(id)
    setConsultaStripe(null)
    try {
      const resultado = await comprobarReembolsoAdmin(id)
      setConsultaStripe({ escrowId: id, ...resultado })
    } catch { setConsultaStripe({ escrowId: id, error: t("No se pudo comprobar el reembolso en Stripe.") }) }
    finally { setVerificandoId(actual => actual === id ? null : actual) }
  }
  const reintentarReembolso = async () => {
    if (!detalle?.stripe_refund_id || reintentando) return
    setReintentando(true)
    setResultadoReintento(null)
    try {
      const resultado = await reintentarReembolsoAdmin(detalle.id, detalle.stripe_refund_id)
      setResultadoReintento({ escrowId: detalle.id, mensaje: resultado.error || "Liquidación completada. El banco puede tardar en reflejar el reembolso." })
      setConsultaStripe(null)
      await cargarTransacciones()
    } catch { setResultadoReintento({ escrowId: detalle.id, mensaje: "No se pudo completar el intento. Actualiza el estado antes de continuar." }) }
    finally { setReintentando(false) }
  }
  const fechaHora = (fecha: string | null) => fecha ? new Intl.DateTimeFormat(localeDe(idioma), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(fecha)) : t("No consta")

  const getEstadoBadge = (pago: Transaccion) => {
    if (pago.liquidacion_estado === "error") return (
      <Badge className="bg-red-500/10 text-red-600 border-red-500/30">
        <AlertCircle className="h-3 w-3 mr-1" />{t("La liquidación necesita atención")}
      </Badge>
    )
    switch (pago.estado) {
      case "fondos_retenidos":
      case "retenido":
        return (
          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">
            <Clock className="h-3 w-3 mr-1" />
            {t("Pago retenido")}</Badge>
        )
      case "completado":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {t("Liberado")}</Badge>
        )
      case "reembolsado":
        return (
          <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">
            <ArrowDownRight className="h-3 w-3 mr-1" />
            {t("Reembolsado")}</Badge>
        )
      case "disputa":
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/30">
            <AlertCircle className="h-3 w-3 mr-1" />
            {t("En disputa")}</Badge>
        )
      case "liquidando":
        return (
          <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            {t("Moviendo fondos")}</Badge>
        )
      case "pendiente":
        return (
          <Badge className="bg-muted text-muted-foreground">
            <Clock className="h-3 w-3 mr-1" />
            {t("Pendiente de pago")}</Badge>
        )
      case "pago_tardio":
        return <Badge variant="outline" className="border-amber-500/30 text-amber-600">{t("Pago tardío pendiente de revisar")}</Badge>
      case "cancelado":
        return <Badge variant="outline">{t("Cancelado")}</Badge>
      default:
        return <Badge variant="secondary">{pago.estado}</Badge>
    }
  }

  const termino = busqueda.trim().toLocaleLowerCase(idioma)
  const filtradas = transacciones.filter(p => (!usuarioId || p.cliente_id === usuarioId || p.profesional_id === usuarioId) &&
    (!trabajoId || p.trabajo_id === trabajoId) && (!escrowId || p.id === escrowId) && (!termino ||
    [p.id, p.trabajo_id, p.trabajo?.titulo, `${p.cliente?.nombre || ""} ${p.cliente?.apellido || ""}`, `${p.profesional?.nombre || ""} ${p.profesional?.apellido || ""}`, p.stripe_payment_intent_id, p.stripe_refund_id]
      .some(valor => valor?.toLocaleLowerCase(idioma).includes(termino))))
  const retenidas = filtradas.filter(p => ["fondos_retenidos", "retenido"].includes(p.estado))
  const liberadas = filtradas.filter(p => ["completado", "liberado"].includes(p.estado))
  const reembolsadas = filtradas.filter(reembolsoProcesado)
  const disputadas = filtradas.filter(p => p.estado === "disputa")

  const totalRetenido = retenidas.reduce((sum, t) => sum + (t.monto ?? 0), 0)
  const totalLiberado = liberadas.reduce((sum, t) => sum + (t.pago_neto_proveedor ?? 0), 0)
  const totalComisiones = filtradas
    .filter((t) => t.estado === "completado" || t.estado === "reembolsado")
    .reduce((sum, t) => sum + comisionDe(t), 0)
  const totalReembolsado = reembolsadas.reduce((sum, t) => sum + Number(t.monto_reembolsado ?? 0), 0)

  const nombre = (p?: { nombre: string | null; apellido: string | null } | null) =>
    p ? `${p.nombre ?? ""} ${p.apellido ?? ""}`.trim() || "-" : "-"

  const filtros = [
    { valor: "todas", etiqueta: "Todas", lista: filtradas },
    { valor: "retenidas", etiqueta: "En custodia", lista: retenidas },
    { valor: "liberadas", etiqueta: "Liberadas", lista: liberadas },
    { valor: "disputadas", etiqueta: "En disputa", lista: disputadas },
    { valor: "reembolsadas", etiqueta: "Reembolsadas", lista: reembolsadas },
  ]
  const visibles = filtros.find(filtro => filtro.valor === filtroEstado)?.lista ?? filtradas
  const fechaCorta = (fecha: string) => new Intl.DateTimeFormat(localeDe(idioma), {
    day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid",
  }).format(new Date(fecha))

  const renderTransacciones = (lista: Transaccion[]) => (
    <>
      <div className="divide-y divide-border/60 lg:hidden">
        {lista.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("No hay transacciones en esta categoria")}</p>
        ) : lista.map((transaccion) => (
          <article key={transaccion.id} className="min-w-0">
            <button
              type="button"
              className="group block w-full rounded-lg py-5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              aria-label={`${t("Ver detalle")}: ${transaccion.trabajo?.titulo || t("Trabajo eliminado")}`}
              aria-describedby={`pago-importe-${transaccion.id} pago-cliente-${transaccion.id} pago-estado-${transaccion.id}`}
              onClick={() => setDetalleId(transaccion.id)}
            >
              <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5">
                <span className="line-clamp-2 text-[15px] font-medium leading-snug [overflow-wrap:anywhere]">{transaccion.trabajo?.titulo || t("Trabajo eliminado")}</span>
                <span id={`pago-importe-${transaccion.id}`} className="max-w-36 text-right text-base font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere]">{eur(transaccion.monto, idioma)}</span>
                <span id={`pago-cliente-${transaccion.id}`} className="truncate text-xs text-muted-foreground">{nombre(transaccion.cliente)}</span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 justify-self-end self-center text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <span id={`pago-estado-${transaccion.id}`} className="min-w-0 [&_[data-slot=badge]]:max-w-full [&_[data-slot=badge]]:whitespace-normal [&_[data-slot=badge]]:border-0 [&_[data-slot=badge]]:bg-transparent [&_[data-slot=badge]]:p-0 [&_[data-slot=badge]]:text-left [&_[data-slot=badge]]:font-normal">{getEstadoBadge(transaccion)}</span>
                <time dateTime={transaccion.created_at} title={formatearFecha(transaccion.created_at, idioma)} className="text-[11px] text-muted-foreground">{fechaCorta(transaccion.created_at)}</time>
              </span>
              {transaccion.monto_reembolsado != null && <span className="mt-2 block text-xs text-muted-foreground">{t(reembolsoProcesado(transaccion) ? "Reembolso procesado por Stripe" : ESTADOS_REEMBOLSO[transaccion.stripe_refund_status || ""] || "Reembolso previsto")}: <span className="tabular-nums">{eur(transaccion.monto_reembolsado, idioma)}</span></span>}
            </button>
          </article>
        ))}
      </div>
      <div className="hidden min-w-0 lg:block">
        <Table className="min-w-[1000px]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("Trabajo")}</TableHead>
              <TableHead>{t("Cliente")}</TableHead>
              <TableHead>{t("Profesional")}</TableHead>
              <TableHead className="text-right">{t("Monto")}</TableHead>
              <TableHead className="text-right">{t("Reembolso")}</TableHead>
              <TableHead>{t("Estado")}</TableHead>
              <TableHead>{t("Fecha")}</TableHead>
              <TableHead><span className="sr-only">{t("Detalle")}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {t("No hay transacciones en esta categoria")}</TableCell>
              </TableRow>
            ) : (
              lista.map((transaccion) => (
                <TableRow key={transaccion.id}>
                  <TableCell className="font-medium min-w-[180px] max-w-[260px] whitespace-normal">
                    <button className="w-full text-left [overflow-wrap:anywhere] hover:text-primary hover:underline" onClick={() => setDetalleId(transaccion.id)}>{transaccion.trabajo?.titulo || t("Trabajo eliminado")}</button>
                    <p className="mt-1 text-xs font-normal text-muted-foreground">{transaccion.trabajo_id ? `TRB-${transaccion.trabajo_id.slice(0, 8).toUpperCase()}` : transaccion.id.slice(0, 8)}</p>
                  </TableCell>
                  <TableCell className="min-w-[140px] max-w-[200px] whitespace-normal [overflow-wrap:anywhere]">{transaccion.cliente_id ? <Link href={`/admin/usuarios/${transaccion.cliente_id}`} className="hover:underline">{nombre(transaccion.cliente)}</Link> : nombre(transaccion.cliente)}</TableCell>
                  <TableCell className="min-w-[140px] max-w-[200px] whitespace-normal [overflow-wrap:anywhere]">{transaccion.profesional_id ? <Link href={`/admin/usuarios/${transaccion.profesional_id}`} className="hover:underline">{nombre(transaccion.profesional)}</Link> : nombre(transaccion.profesional)}</TableCell>
                  <TableCell className="text-right font-medium">{eur(transaccion.monto, idioma)}</TableCell>
                  <TableCell className="text-right">
                    {transaccion.monto_reembolsado == null ? "—" : eur(transaccion.monto_reembolsado, idioma)}
                    {Number(transaccion.monto_reembolsado) > 0 && <p className="text-xs text-muted-foreground">
                      {t(reembolsoProcesado(transaccion) ? "Reembolso procesado por Stripe" : ESTADOS_REEMBOLSO[transaccion.stripe_refund_status || ""] || "Reembolso previsto")}
                    </p>}
                  </TableCell>
                  <TableCell>{getEstadoBadge(transaccion)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatearFecha(transaccion.created_at, idioma)}
                  </TableCell>
                  <TableCell><Button variant="outline" size="sm" onClick={() => setDetalleId(transaccion.id)}><Eye className="mr-2 h-4 w-4" />{t("Ver detalle")}</Button></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )

  return (
    <div className="mx-auto min-w-0 max-w-[1440px] space-y-8 px-5 py-6 sm:p-8">
      <header>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("Administración")}</p>
            <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight sm:text-3xl">{t("Pagos y cobros")}</h1>
          </div>
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full border border-border/70" aria-label={t("Actualizar")} title={t("Actualizar")} disabled={loading} onClick={() => void cargarTransacciones()}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <a href="https://dashboard.stripe.com/balance/overview" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
          {t("Saldo y movimientos en Stripe")}<ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      </header>

      {errorCarga && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{errorCarga}</p>}
      {(usuarioId || trabajoId || escrowId) && <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm"><span>{t("Mostrando el caso seleccionado")}</span>
        {usuarioId && <Button asChild size="sm" variant="outline"><Link href={`/admin/usuarios/${encodeURIComponent(usuarioId)}`}>{t("Ver usuario")}</Link></Button>}
        <Button size="sm" variant="ghost" onClick={() => router.replace("/admin/pagos")}>{t("Ver todos los pagos")}</Button>
      </div>}

      <dl aria-label={t("Resumen de pagos")} className="grid min-w-0 grid-cols-2 overflow-hidden rounded-2xl border border-border/80 bg-card xl:grid-cols-4">
        <div className="flex min-w-0 flex-col border-b border-r border-border/70 p-4 sm:p-5 xl:border-b-0">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{t("Comisiones")}</dt>
          <dd className="mt-auto pt-2 text-[26px] font-semibold tracking-tight text-primary tabular-nums [overflow-wrap:anywhere] sm:text-3xl">{eur(totalComisiones, idioma)}</dd>
        </div>
        <div className="flex min-w-0 flex-col border-b border-border/70 p-4 sm:p-5 xl:border-b-0 xl:border-r">
          <dt title={t("Neto transferido a profesionales")} className="text-xs text-muted-foreground">{t("Transferido (neto)")}</dt>
          <dd className="mt-auto pt-2 text-[26px] font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-3xl">{eur(totalLiberado, idioma)}</dd>
        </div>
        <div className="flex min-w-0 flex-col border-r border-border/70 p-4 sm:p-5">
          <dt className="text-xs text-muted-foreground">{t("En custodia")}</dt>
          <dd className="mt-auto pt-2 text-[26px] font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-3xl">{eur(totalRetenido, idioma)}</dd>
        </div>
        <div className="flex min-w-0 flex-col p-4 sm:p-5">
          <dt className="text-xs text-muted-foreground">{t("Reembolsos procesados por Stripe")}</dt>
          <dd className="mt-auto pt-2 text-[26px] font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-3xl">{eur(totalReembolsado, idioma)}</dd>
        </div>
      </dl>

      <section aria-labelledby="movimientos-titulo" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="movimientos-titulo" className="text-base font-semibold tracking-tight">{t("Movimientos")}</h2>
          <div className="relative max-w-full">
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} aria-label={t("Filtrar pagos por estado")} className="min-h-9 max-w-full appearance-none rounded-full border border-border/70 bg-card py-2 pl-3 pr-8 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {filtros.map(filtro => <option key={filtro.valor} value={filtro.valor}>{t(filtro.etiqueta)} ({filtro.lista.length})</option>)}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
        <div className="relative mt-4 min-w-0">
          <Search aria-hidden="true" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label={t("Buscar por trabajo, cliente, profesional o referencia...")} placeholder={t("Buscar pagos...")} className="h-11 rounded-xl border-border/70 bg-muted/20 pl-10 text-sm shadow-none" />
        </div>
        <div className="mt-2 min-w-0 lg:mt-5 lg:overflow-hidden lg:rounded-xl lg:border lg:border-border/70">
          {loading ? (
            <div role="status" className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /><span className="sr-only">{t("Cargando...")}</span>
            </div>
          ) : renderTransacciones(visibles)}
        </div>
      </section>
      <Dialog open={!!detalleId} onOpenChange={abierto => { if (!abierto) setDetalleId(null) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
          <DialogHeader className="min-w-0 pr-6 text-left">
            <DialogTitle className="leading-snug [overflow-wrap:anywhere]">{detalle?.trabajo?.titulo || t("Detalle del pago")}</DialogTitle>
            <DialogDescription>{t("Importes y estado registrados para esta transacción.")}</DialogDescription>
          </DialogHeader>
          {detalle && <div className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
            <div className="flex flex-wrap items-center gap-2 [&_[data-slot=badge]]:max-w-full [&_[data-slot=badge]]:whitespace-normal">{getEstadoBadge(detalle)}<span className="break-all text-xs text-muted-foreground">{detalle.id}</span></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{t("Cliente")}</p><p className="mt-1 font-medium">{detalle.cliente_id ? <Link href={`/admin/usuarios/${detalle.cliente_id}`} className="hover:underline">{nombre(detalle.cliente)}</Link> : nombre(detalle.cliente)}</p></div>
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{t("Profesional")}</p><p className="mt-1 font-medium">{detalle.profesional_id ? <Link href={`/admin/usuarios/${detalle.profesional_id}`} className="hover:underline">{nombre(detalle.profesional)}</Link> : nombre(detalle.profesional)}</p></div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {[
                ["Referencia del trabajo", detalle.trabajo_id ? `TRB-${detalle.trabajo_id.slice(0, 8).toUpperCase()}` : t("No consta")],
                ["Fecha del pago", fechaHora(detalle.created_at)],
                ["Pago original", eur(detalle.monto, idioma)],
                [reembolsoProcesado(detalle) ? "Reembolso registrado" : "Reembolso previsto", detalle.monto_reembolsado == null ? t("No consta") : eur(detalle.monto_reembolsado, idioma)],
                ["Comisiones de Diime", eur(comisionDe(detalle), idioma)],
                ["Neto del profesional", eur(detalle.pago_neto_proveedor, idioma)],
                ["Fecha del reembolso registrado", fechaHora(detalle.fecha_reembolso)],
                ["Estado del reembolso registrado", detalle.stripe_refund_status ? t(ESTADOS_REEMBOLSO[detalle.stripe_refund_status] || detalle.stripe_refund_status) : t("No consta")],
              ].map(([clave, valor]) => <div key={clave} className="min-w-0"><dt className="text-muted-foreground">{t(clave)}</dt><dd className="mt-1 font-medium">{valor}</dd></div>)}
            </dl>
            {detalle.stripe_refund_id && <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
              <p className="font-medium">{t("Referencia del reembolso")}</p><p className="mt-1 break-all font-mono text-xs">{detalle.stripe_refund_id}</p>
              <p className="mt-2 text-muted-foreground">{t("Un reembolso procesado por Stripe puede tardar en reflejarse en el banco del cliente. Esta pantalla no confirma su abono bancario.")}</p>
            </div>}
            {detalle.liquidacion_error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{detalle.liquidacion_error}</p>}
            <div className="flex min-w-0 flex-wrap gap-2">
              {detalle.stripe_payment_intent_id && <Button asChild variant="outline" size="sm" className="h-auto min-h-9 max-w-full whitespace-normal"><a href={`https://dashboard.stripe.com/payments/${encodeURIComponent(detalle.stripe_payment_intent_id)}`} target="_blank" rel="noopener noreferrer">{t("Abrir este pago en Stripe")}<ExternalLink className="ml-2 h-4 w-4" /></a></Button>}
              {detalle.cliente_id && <Button asChild variant="outline" size="sm" className="h-auto min-h-9 max-w-full whitespace-normal"><Link href={`/admin/incidencias?usuario=${detalle.cliente_id}`}>{t("Ver incidencias del cliente")}</Link></Button>}
              {detalle.stripe_refund_id && <Button onClick={() => void comprobarReembolso(detalle.id)} disabled={verificandoId === detalle.id} size="sm" className="h-auto min-h-9 max-w-full whitespace-normal">{verificandoId === detalle.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}{t("Comprobar reembolso en Stripe")}</Button>}
              {resultadoStripe?.data &&
                ["failed", "canceled"].includes(resultadoStripe.data.estado) && resultadoStripe.data.fallo !== "charge_for_pending_refund_disputed" && (
                <div className="min-w-0 w-full space-y-2 rounded border border-amber-300 p-3">
                  <p className="text-sm">{t("El intento anterior falló. Autoriza otro solo después de revisar la causa en Stripe. Si el banco no admite la devolución, será necesario acordar otra vía; este botón no registra pagos externos.")}</p>
                  <Button className="h-auto min-h-9 max-w-full whitespace-normal" disabled={reintentando} onClick={() => void reintentarReembolso()}>{reintentando ? t("Reintentando…") : t("Autorizar un nuevo intento de reembolso")}</Button>
                </div>
              )}
              {resultadoReintento?.escrowId === detalle.id && <p role="status" className="text-sm">{t(resultadoReintento.mensaje)}</p>}
            </div>
            {resultadoStripe?.error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{resultadoStripe.error}</p>}
            {resultadoStripe?.data && <div role="status" className="space-y-2 rounded-lg border bg-muted/20 p-4">
              <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" />{t("Última comprobación en Stripe")}</p>
              <p>{t(ESTADOS_REEMBOLSO[resultadoStripe.data.estado] || resultadoStripe.data.estado)} · {new Intl.NumberFormat(localeDe(idioma), { style: "currency", currency: resultadoStripe.data.moneda.toUpperCase() }).format(resultadoStripe.data.importe)}</p>
              <p className="text-sm text-muted-foreground">{t("Creado el")}: {fechaHora(resultadoStripe.data.creadoEn)}</p>
              {resultadoStripe.data.referencia ? <p className="break-all text-sm"><span className="font-medium">{t("Referencia bancaria para seguimiento")}:</span> {resultadoStripe.data.referencia}{resultadoStripe.data.referenciaTipo ? ` (${resultadoStripe.data.referenciaTipo})` : ""}</p> : <p className="text-sm text-muted-foreground">{t("Stripe todavía no facilita una referencia bancaria para seguimiento.")}</p>}
              {resultadoStripe.data.referenciaEstado && <p className="text-xs text-muted-foreground">{t("Estado de la referencia")}: {resultadoStripe.data.referenciaEstado}</p>}
              {resultadoStripe.data.fallo && <p className="text-sm text-destructive">{resultadoStripe.data.fallo}</p>}
              {resultadoStripe.data.modoReal === false && <Badge variant="outline">{t("Modo de pruebas de Stripe")}</Badge>}
            </div>}
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  )
}

"use client"

import { localeDe, type Idioma } from "@/lib/i18n"

import { useIdioma } from "@/components/idioma-provider"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { comprobarReembolsoAdmin } from "@/app/actions/admin-pagos"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  WalletCards,
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
  const [consultaStripe, setConsultaStripe] = useState<{ escrowId: string; data?: ReembolsoStripe; error?: string } | null>(null)
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
  const fechaHora = (fecha: string | null) => fecha ? new Intl.DateTimeFormat(localeDe(idioma), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(fecha)) : t("No consta")

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
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
        return <Badge variant="secondary">{estado}</Badge>
    }
  }

  const termino = busqueda.trim().toLocaleLowerCase(idioma)
  const filtradas = transacciones.filter(p => (!usuarioId || p.cliente_id === usuarioId || p.profesional_id === usuarioId) &&
    (!trabajoId || p.trabajo_id === trabajoId) && (!escrowId || p.id === escrowId) && (!termino ||
    [p.id, p.trabajo_id, p.trabajo?.titulo, `${p.cliente?.nombre || ""} ${p.cliente?.apellido || ""}`, `${p.profesional?.nombre || ""} ${p.profesional?.apellido || ""}`, p.stripe_payment_intent_id, p.stripe_refund_id]
      .some(valor => valor?.toLocaleLowerCase(idioma).includes(termino))))
  const retenidas = filtradas.filter(p => ["fondos_retenidos", "retenido"].includes(p.estado))
  const liberadas = filtradas.filter(p => ["completado", "liberado"].includes(p.estado))
  const reembolsadas = filtradas.filter(p => p.estado === "reembolsado")
  const disputadas = filtradas.filter(p => p.estado === "disputa")

  const totalRetenido = retenidas.reduce((sum, t) => sum + (t.monto ?? 0), 0)
  const totalLiberado = liberadas.reduce((sum, t) => sum + (t.pago_neto_proveedor ?? 0), 0)
  const totalComisiones = filtradas
    .filter((t) => t.estado === "completado" || t.estado === "reembolsado")
    .reduce((sum, t) => sum + comisionDe(t), 0)
  const totalReembolsado = filtradas.reduce((sum, t) => sum + (t.monto_reembolsado ?? 0), 0)

  const nombre = (p?: { nombre: string | null; apellido: string | null } | null) =>
    p ? `${p.nombre ?? ""} ${p.apellido ?? ""}`.trim() || "-" : "-"

  const renderTransaccionesTable = (lista: Transaccion[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("Trabajo")}</TableHead>
          <TableHead>{t("Cliente")}</TableHead>
          <TableHead>{t("Profesional")}</TableHead>
          <TableHead className="text-right">{t("Monto")}</TableHead>
          <TableHead className="text-right">{t("Reembolso registrado")}</TableHead>
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
              <TableCell className="font-medium min-w-[180px] max-w-[260px]">
                <button className="text-left hover:text-primary hover:underline" onClick={() => setDetalleId(transaccion.id)}>{transaccion.trabajo?.titulo || t("Trabajo eliminado")}</button>
                <p className="mt-1 text-xs font-normal text-muted-foreground">{transaccion.trabajo_id ? `TRB-${transaccion.trabajo_id.slice(0, 8).toUpperCase()}` : transaccion.id.slice(0, 8)}</p>
              </TableCell>
              <TableCell>{transaccion.cliente_id ? <Link href={`/admin/usuarios/${transaccion.cliente_id}`} className="hover:underline">{nombre(transaccion.cliente)}</Link> : nombre(transaccion.cliente)}</TableCell>
              <TableCell>{transaccion.profesional_id ? <Link href={`/admin/usuarios/${transaccion.profesional_id}`} className="hover:underline">{nombre(transaccion.profesional)}</Link> : nombre(transaccion.profesional)}</TableCell>
              <TableCell className="text-right font-medium">{eur(transaccion.monto, idioma)}</TableCell>
              <TableCell className="text-right">{transaccion.monto_reembolsado == null ? "—" : eur(transaccion.monto_reembolsado, idioma)}</TableCell>
              <TableCell>{getEstadoBadge(transaccion.estado)}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatearFecha(transaccion.created_at, idioma)}
              </TableCell>
              <TableCell><Button variant="outline" size="sm" onClick={() => setDetalleId(transaccion.id)}><Eye className="mr-2 h-4 w-4" />{t("Ver detalle")}</Button></TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CreditCard className="h-8 w-8 text-primary" />
            {t("Pagos y cobros")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("Consulta cada pago, el reembolso registrado y su estado en Stripe.")}</p>
        </div>
        <Button variant="outline" disabled={loading} onClick={() => void cargarTransacciones()}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />{t("Actualizar")}</Button>
        <Button asChild variant="outline" className="shrink-0">
          <a
            href="https://dashboard.stripe.com/balance/overview"
            target="_blank"
            rel="noopener noreferrer"
          >
            <WalletCards className="mr-2 h-4 w-4" />
            {t("Saldo y movimientos en Stripe")}<ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>

      {errorCarga && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{errorCarga}</p>}
      {(usuarioId || trabajoId || escrowId) && <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm"><span>{t("Mostrando el caso seleccionado")}</span>
        {usuarioId && <Button asChild size="sm" variant="outline"><Link href={`/admin/usuarios/${encodeURIComponent(usuarioId)}`}>{t("Ver usuario")}</Link></Button>}
        <Button size="sm" variant="ghost" onClick={() => router.replace("/admin/pagos")}>{t("Ver todos los pagos")}</Button>
      </div>}

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              {t("Pagos retenidos")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{eur(totalRetenido, idioma)}</p>
            <p className="text-xs text-muted-foreground mt-1">{retenidas.length} {" "}{t("transacciones")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-emerald-500" />
              {t("Neto transferido a profesionales")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{eur(totalLiberado, idioma)}</p>
            <p className="text-xs text-muted-foreground mt-1">{liberadas.length} {" "}{t("transacciones")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-violet-500" />
              {t("Comisiones")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-violet-600">{eur(totalComisiones, idioma)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("Total ganado")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4 text-blue-500" />
              {t("Reembolso registrado")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{eur(totalReembolsado, idioma)}</p>
            <p className="text-xs text-muted-foreground mt-1">{reembolsadas.length} {" "}{t("reembolsos")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder={t("Buscar por trabajo, cliente, profesional o referencia...")} className="pl-9" /></div>

      {/* Transactions Tabs */}
      <Card>
        <Tabs defaultValue="todas" className="w-full">
          <CardHeader>
            <TabsList className="max-w-full overflow-x-auto justify-start">
              <TabsTrigger value="todas">{t("Todas (")}{filtradas.length})</TabsTrigger>
              <TabsTrigger value="retenidas">{t("En custodia (")}{retenidas.length})</TabsTrigger>
              <TabsTrigger value="liberadas">{t("Liberadas (")}{liberadas.length})</TabsTrigger>
              <TabsTrigger value="disputadas">{t("En disputa (")}{disputadas.length})</TabsTrigger>
              <TabsTrigger value="reembolsadas">{t("Reembolsadas (")}{reembolsadas.length})</TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <TabsContent value="todas" className="m-0">
                  {renderTransaccionesTable(filtradas)}
                </TabsContent>
                <TabsContent value="retenidas" className="m-0">
                  {renderTransaccionesTable(retenidas)}
                </TabsContent>
                <TabsContent value="liberadas" className="m-0">
                  {renderTransaccionesTable(liberadas)}
                </TabsContent>
                <TabsContent value="disputadas" className="m-0">
                  {renderTransaccionesTable(disputadas)}
                </TabsContent>
                <TabsContent value="reembolsadas" className="m-0">
                  {renderTransaccionesTable(reembolsadas)}
                </TabsContent>
              </>
            )}
          </CardContent>
        </Tabs>
      </Card>
      <Dialog open={!!detalleId} onOpenChange={abierto => { if (!abierto) setDetalleId(null) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detalle?.trabajo?.titulo || t("Detalle del pago")}</DialogTitle>
            <DialogDescription>{t("Importes y estado registrados para esta transacción.")}</DialogDescription>
          </DialogHeader>
          {detalle && <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">{getEstadoBadge(detalle.estado)}<span className="break-all text-xs text-muted-foreground">{detalle.id}</span></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{t("Cliente")}</p><p className="mt-1 font-medium">{detalle.cliente_id ? <Link href={`/admin/usuarios/${detalle.cliente_id}`} className="hover:underline">{nombre(detalle.cliente)}</Link> : nombre(detalle.cliente)}</p></div>
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{t("Profesional")}</p><p className="mt-1 font-medium">{detalle.profesional_id ? <Link href={`/admin/usuarios/${detalle.profesional_id}`} className="hover:underline">{nombre(detalle.profesional)}</Link> : nombre(detalle.profesional)}</p></div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {[
                ["Pago original", eur(detalle.monto, idioma)],
                ["Reembolso registrado", detalle.monto_reembolsado == null ? t("No consta") : eur(detalle.monto_reembolsado, idioma)],
                ["Comisiones de Diime", eur(comisionDe(detalle), idioma)],
                ["Neto del profesional", eur(detalle.pago_neto_proveedor, idioma)],
                ["Fecha del reembolso registrado", fechaHora(detalle.fecha_reembolso)],
                ["Estado del reembolso registrado", detalle.stripe_refund_status ? t(ESTADOS_REEMBOLSO[detalle.stripe_refund_status] || detalle.stripe_refund_status) : t("No consta")],
              ].map(([clave, valor]) => <div key={clave}><dt className="text-muted-foreground">{t(clave)}</dt><dd className="mt-1 font-medium">{valor}</dd></div>)}
            </dl>
            {detalle.stripe_refund_id && <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
              <p className="font-medium">{t("Referencia del reembolso")}</p><p className="mt-1 break-all font-mono text-xs">{detalle.stripe_refund_id}</p>
              <p className="mt-2 text-muted-foreground">{t("Un reembolso procesado por Stripe puede tardar en reflejarse en el banco del cliente. Esta pantalla no confirma su abono bancario.")}</p>
            </div>}
            {detalle.liquidacion_error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{detalle.liquidacion_error}</p>}
            <div className="flex flex-wrap gap-2">
              {detalle.stripe_payment_intent_id && <Button asChild variant="outline" size="sm"><a href={`https://dashboard.stripe.com/payments/${encodeURIComponent(detalle.stripe_payment_intent_id)}`} target="_blank" rel="noopener noreferrer">{t("Abrir este pago en Stripe")}<ExternalLink className="ml-2 h-4 w-4" /></a></Button>}
              {detalle.cliente_id && <Button asChild variant="outline" size="sm"><Link href={`/admin/incidencias?usuario=${detalle.cliente_id}`}>{t("Ver incidencias del cliente")}</Link></Button>}
              {detalle.stripe_refund_id && <Button onClick={() => void comprobarReembolso(detalle.id)} disabled={verificandoId === detalle.id} size="sm">{verificandoId === detalle.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}{t("Comprobar reembolso en Stripe")}</Button>}
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

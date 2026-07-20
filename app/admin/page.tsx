"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import { formatearPrecio } from "@/lib/comisiones"
import { formatearFecha } from "@/lib/utils"
import { Users, Briefcase, Scale, CreditCard, TrendingUp, AlertCircle, ShieldAlert, Euro, Wallet } from "lucide-react"
import Link from "next/link"

interface Stats {
  totalUsuarios: number
  totalProfesionales: number
  totalTrabajos: number
  trabajosActivos: number
  disputasAbiertas: number
  incidenciasAbiertas: number
  incidenciasCriticas: number
  pagosEnEscrow: number
  montoEscrow: number
  // Ingresos de Diime: comisiones de trabajos completados + retenciones de reembolsos.
  ingresosTotal: number
  ingresosComisionCliente: number
  ingresosComisionProveedor: number
  ingresosRetenciones: number
}

// Cobro individual para la lista de "cuándo se cobró".
interface Cobro {
  id: string
  fecha: string | null
  importe: number
  trabajoTitulo: string
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalUsuarios: 0,
    totalProfesionales: 0,
    totalTrabajos: 0,
    trabajosActivos: 0,
    disputasAbiertas: 0,
    incidenciasAbiertas: 0,
    incidenciasCriticas: 0,
    pagosEnEscrow: 0,
    montoEscrow: 0,
    ingresosTotal: 0,
    ingresosComisionCliente: 0,
    ingresosComisionProveedor: 0,
    ingresosRetenciones: 0,
  })
  const [cobros, setCobros] = useState<Cobro[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    cargarEstadisticas()
  }, [])

  const cargarEstadisticas = async () => {
    try {
      // Total usuarios
      const { count: usuarios } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })

      // Total profesionales
      const { count: profesionales } = await supabase
        .from("profesionales")
        .select("*", { count: "exact", head: true })

      // Total trabajos
      const { count: trabajos } = await supabase
        .from("trabajos")
        .select("*", { count: "exact", head: true })

      // Trabajos activos (los estados reales: no existe "pendiente" a secas)
      const { count: activos } = await supabase
        .from("trabajos")
        .select("*", { count: "exact", head: true })
        .in("estado", ["pendiente_pago", "en_progreso", "entregado"])

      // Disputas abiertas
      const { count: disputas } = await supabase
        .from("disputas")
        .select("*", { count: "exact", head: true })
        .eq("estado", "abierta")

      // Incidencias abiertas y críticas (tolerante si la tabla no existe)
      let incidenciasAb = 0
      let incidenciasCrit = 0
      try {
        const { count: incAb } = await supabase
          .from("incidencias")
          .select("*", { count: "exact", head: true })
          .in("estado", ["abierta", "en_revision"])
        const { count: incCrit } = await supabase
          .from("incidencias")
          .select("*", { count: "exact", head: true })
          .eq("prioridad", "critica")
          .neq("estado", "cerrada")
        incidenciasAb = incAb || 0
        incidenciasCrit = incCrit || 0
      } catch {
        // Table may not exist yet
      }

      // Pagos en escrow. El estado "retenido" no existe: el dinero retenido está
      // en "fondos_retenidos" y también en "disputa" (congelado hasta resolver).
      const { data: escrowData } = await supabase
        .from("transacciones_escrow")
        .select("monto")
        .in("estado", ["fondos_retenidos", "disputa"])

      const pagosEscrow = escrowData?.length || 0
      const montoTotal = escrowData?.reduce((sum, t) => sum + Number(t.monto || 0), 0) || 0

      // Ingresos de Diime: comisiones de los trabajos cobrados (completado) y
      // retención de la plataforma en los reembolsos.
      const { data: liberadas } = await supabase
        .from("transacciones_escrow")
        .select("id, comision_cliente, comision_proveedor, fecha_liberacion, trabajo_id")
        .eq("estado", "completado")
        .order("fecha_liberacion", { ascending: false })

      const { data: reembolsadas } = await supabase
        .from("transacciones_escrow")
        .select("retencion_plataforma")
        .eq("estado", "reembolsado")

      const comCliente = (liberadas || []).reduce((s, t) => s + Number(t.comision_cliente || 0), 0)
      const comProveedor = (liberadas || []).reduce((s, t) => s + Number(t.comision_proveedor || 0), 0)
      const retenciones = (reembolsadas || []).reduce((s, t) => s + Number(t.retencion_plataforma || 0), 0)

      // Últimos cobros con su fecha y el título del trabajo.
      const ultimas = (liberadas || []).slice(0, 6)
      const trabajoIds = [...new Set(ultimas.map((t) => t.trabajo_id).filter(Boolean))]
      const titulos: Record<string, string> = {}
      if (trabajoIds.length > 0) {
        const { data: trabajosCobrados } = await supabase
          .from("trabajos")
          .select("id, titulo")
          .in("id", trabajoIds)
        for (const t of trabajosCobrados || []) titulos[t.id] = t.titulo
      }
      setCobros(
        ultimas.map((t) => ({
          id: t.id,
          fecha: t.fecha_liberacion,
          importe: Number(t.comision_cliente || 0) + Number(t.comision_proveedor || 0),
          trabajoTitulo: titulos[t.trabajo_id] || "Trabajo",
        })),
      )

      setStats({
        totalUsuarios: usuarios || 0,
        totalProfesionales: profesionales || 0,
        totalTrabajos: trabajos || 0,
        trabajosActivos: activos || 0,
        disputasAbiertas: disputas || 0,
        incidenciasAbiertas: incidenciasAb,
        incidenciasCriticas: incidenciasCrit,
        pagosEnEscrow: pagosEscrow,
        montoEscrow: montoTotal,
        ingresosTotal: comCliente + comProveedor + retenciones,
        ingresosComisionCliente: comCliente,
        ingresosComisionProveedor: comProveedor,
        ingresosRetenciones: retenciones,
      })
    } catch (error) {
      console.error("Error loading stats:", error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      title: "Total Usuarios",
      value: stats.totalUsuarios,
      icon: Users,
      href: "/admin/usuarios",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Profesionales",
      value: stats.totalProfesionales,
      icon: Briefcase,
      href: "/admin/usuarios?tipo=profesional",
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "Trabajos Activos",
      value: stats.trabajosActivos,
      subtitle: `de ${stats.totalTrabajos} totales`,
      icon: TrendingUp,
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
    },
    {
      title: "Disputas Abiertas",
      value: stats.disputasAbiertas,
      icon: Scale,
      href: "/admin/disputas",
      color: stats.disputasAbiertas > 0 ? "text-amber-500" : "text-emerald-500",
      bgColor: stats.disputasAbiertas > 0 ? "bg-amber-500/10" : "bg-emerald-500/10",
      alert: stats.disputasAbiertas > 0,
    },
    {
      title: "Incidencias",
      value: stats.incidenciasAbiertas,
      subtitle:
        stats.incidenciasCriticas > 0
          ? `${stats.incidenciasCriticas} crítica${stats.incidenciasCriticas === 1 ? "" : "s"}`
          : "abiertas o en revisión",
      icon: ShieldAlert,
      href: "/admin/incidencias",
      color: stats.incidenciasCriticas > 0 ? "text-red-500" : stats.incidenciasAbiertas > 0 ? "text-amber-500" : "text-emerald-500",
      bgColor: stats.incidenciasCriticas > 0 ? "bg-red-500/10" : stats.incidenciasAbiertas > 0 ? "bg-amber-500/10" : "bg-emerald-500/10",
      alert: stats.incidenciasCriticas > 0,
    },
    {
      title: "Pagos en Escrow",
      value: stats.pagosEnEscrow,
      subtitle: `${formatearPrecio(stats.montoEscrow)} retenidos en custodia`,
      icon: CreditCard,
      href: "/admin/pagos",
      color: "text-cyan-500",
      bgColor: "bg-cyan-500/10",
    },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Bienvenido al panel de administración de Diime
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card) => {
          const content = (
            <Card 
              className={`relative overflow-hidden transition-all hover:shadow-md ${
                card.href ? "cursor-pointer hover:border-primary/50" : ""
              }`}
            >
              {card.alert && (
                <div className="absolute top-3 right-3">
                  <AlertCircle className="h-5 w-5 text-amber-500 animate-pulse" />
                </div>
              )}
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${card.bgColor}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {loading ? "-" : card.value}
                </div>
                {card.subtitle && (
                  <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                )}
              </CardContent>
            </Card>
          )

          return card.href ? (
            <Link key={card.title} href={card.href}>
              {content}
            </Link>
          ) : (
            <div key={card.title}>{content}</div>
          )
        })}
      </div>

      {/* Ingresos de Diime: qué ha cobrado la plataforma y cuándo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground">Ingresos de Diime</CardTitle>
              <CardDescription className="text-xs">Comisiones cobradas por la plataforma</CardDescription>
            </div>
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Euro className="h-5 w-5 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-500">
              {loading ? "-" : formatearPrecio(stats.ingresosTotal)}
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Gastos de servicio a clientes (10%)</span>
                <span className="font-medium">{formatearPrecio(stats.ingresosComisionCliente)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Gastos de servicio a profesionales (5%)</span>
                <span className="font-medium">{formatearPrecio(stats.ingresosComisionProveedor)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Retenciones en reembolsos</span>
                <span className="font-medium">{formatearPrecio(stats.ingresosRetenciones)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground">Últimos cobros</CardTitle>
              <CardDescription className="text-xs">Comisión ingresada al liberar cada pago</CardDescription>
            </div>
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Wallet className="h-5 w-5 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">-</p>
            ) : cobros.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Todavía no se ha liberado ningún pago.</p>
            ) : (
              <ul className="divide-y divide-border">
                {cobros.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{c.trabajoTitulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.fecha ? formatearFecha(c.fecha) : "Sin fecha"}
                      </p>
                    </div>
                    <span className="font-semibold text-emerald-500 shrink-0">
                      +{formatearPrecio(c.importe)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Acciones Rápidas</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/admin/usuarios"
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
          >
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Ver Usuarios</p>
              <p className="text-sm text-muted-foreground">Gestionar usuarios registrados</p>
            </div>
          </Link>
          <Link
            href="/admin/disputas"
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
          >
            <Scale className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Resolver Disputas</p>
              <p className="text-sm text-muted-foreground">Mediar conflictos entre usuarios</p>
            </div>
          </Link>
          <Link
            href="/admin/incidencias"
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
          >
            <ShieldAlert className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Gestionar Incidencias</p>
              <p className="text-sm text-muted-foreground">Reportes de fraude, abuso y soporte</p>
            </div>
          </Link>
          <Link
            href="/admin/pagos"
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
          >
            <CreditCard className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Ver Pagos</p>
              <p className="text-sm text-muted-foreground">Monitorizar transacciones</p>
            </div>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import { useIdioma } from "@/components/idioma-provider"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import { formatearPrecio } from "@/lib/comisiones"
import { ResumenComisiones } from "@/components/admin/resumen-comisiones"
import { ResumenOperativoPanel } from "@/components/admin/resumen-operativo"
import { Users, Briefcase, Scale, CreditCard, TrendingUp, AlertCircle, ShieldAlert } from "lucide-react"
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
}

export default function AdminDashboard() {
  const { t, idioma } = useIdioma()

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
  })
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
        // `id` en vez de `*`: con las columnas personales revocadas, expandir `*`
        // haría fallar la consulta aunque solo se quiera el recuento.
        .select("id", { count: "exact", head: true })

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
        .in("estado", ["fondos_retenidos", t("disputa")])

      const pagosEscrow = escrowData?.length || 0
      const montoTotal = escrowData?.reduce((sum, t) => sum + Number(t.monto || 0), 0) || 0

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
      })
    } catch (error) {
      console.error("Error loading stats:", error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      title: t("Total Usuarios"),
      value: stats.totalUsuarios,
      icon: Users,
      href: "/admin/usuarios",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: t("Profesionales"),
      value: stats.totalProfesionales,
      icon: Briefcase,
      href: "/admin/usuarios?tipo=profesional",
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: t("Trabajos Activos"),
      value: stats.trabajosActivos,
      subtitle: t("de {total} totales", { total: stats.totalTrabajos }),
      icon: TrendingUp,
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
    },
    {
      title: t("Disputas Abiertas"),
      value: stats.disputasAbiertas,
      icon: Scale,
      href: "/admin/disputas",
      color: stats.disputasAbiertas > 0 ? "text-amber-500" : "text-emerald-500",
      bgColor: stats.disputasAbiertas > 0 ? "bg-amber-500/10" : "bg-emerald-500/10",
      alert: stats.disputasAbiertas > 0,
    },
    {
      title: t("Incidencias"),
      value: stats.incidenciasAbiertas,
      subtitle:
        stats.incidenciasCriticas > 0
          ? t(stats.incidenciasCriticas === 1 ? "{cantidad} crítica" : "{cantidad} críticas", { cantidad: stats.incidenciasCriticas })
          : t("abiertas o en revisión"),
      icon: ShieldAlert,
      href: "/admin/incidencias",
      color: stats.incidenciasCriticas > 0 ? "text-red-500" : stats.incidenciasAbiertas > 0 ? "text-amber-500" : "text-emerald-500",
      bgColor: stats.incidenciasCriticas > 0 ? "bg-red-500/10" : stats.incidenciasAbiertas > 0 ? "bg-amber-500/10" : "bg-emerald-500/10",
      alert: stats.incidenciasCriticas > 0,
    },
    {
      title: t("Pagos en Escrow"),
      value: stats.pagosEnEscrow,
      subtitle: t("{importe} retenidos en custodia", { importe: formatearPrecio(stats.montoEscrow, idioma) }),
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
        <h1 className="text-3xl font-bold">{t("Dashboard")}</h1>
        <p className="text-muted-foreground mt-1">
          {t("Bienvenido al panel de administración de Diime")}</p>
      </div>

      <ResumenOperativoPanel />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card) => {
          const content = (
            <Card
              // h-full: el envoltorio se estira con la rejilla pero la Card no,
              // así que las tarjetas sin subtítulo quedaban más bajas que las
              // que sí lo tienen ("de 20 totales", "retenidos en custodia"…).
              className={`relative flex h-full flex-col overflow-hidden transition-all hover:shadow-md ${
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
            <Link key={card.title} href={card.href} className="h-full">
              {content}
            </Link>
          ) : (
            <div key={card.title} className="h-full">
              {content}
            </div>
          )
        })}
      </div>

      <ResumenComisiones mostrarCobros />

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>{t("Acciones Rápidas")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <Link
            href="/admin/usuarios"
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
          >
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">{t("Ver Usuarios")}</p>
              <p className="text-sm text-muted-foreground">{t("Gestionar usuarios registrados")}</p>
            </div>
          </Link>
          <Link
            href="/admin/trabajos"
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
          >
            <Briefcase className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">{t("Trabajos y justificantes")}</p>
              <p className="text-sm text-muted-foreground">{t("Consultar todas las contrataciones")}</p>
            </div>
          </Link>
          <Link
            href="/admin/disputas"
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
          >
            <Scale className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">{t("Resolver Disputas")}</p>
              <p className="text-sm text-muted-foreground">{t("Mediar conflictos entre usuarios")}</p>
            </div>
          </Link>
          <Link
            href="/admin/incidencias"
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
          >
            <ShieldAlert className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">{t("Gestionar Incidencias")}</p>
              <p className="text-sm text-muted-foreground">{t("Reportes de fraude, abuso y soporte")}</p>
            </div>
          </Link>
          <Link
            href="/admin/pagos"
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
          >
            <CreditCard className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">{t("Ver Pagos")}</p>
              <p className="text-sm text-muted-foreground">{t("Monitorizar transacciones")}</p>
            </div>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

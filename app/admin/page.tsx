"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import { Users, Briefcase, Scale, CreditCard, TrendingUp, AlertCircle } from "lucide-react"
import Link from "next/link"

interface Stats {
  totalUsuarios: number
  totalProfesionales: number
  totalTrabajos: number
  trabajosActivos: number
  disputasAbiertas: number
  pagosEnEscrow: number
  montoEscrow: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalUsuarios: 0,
    totalProfesionales: 0,
    totalTrabajos: 0,
    trabajosActivos: 0,
    disputasAbiertas: 0,
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
        .select("*", { count: "exact", head: true })

      // Total profesionales
      const { count: profesionales } = await supabase
        .from("profesionales")
        .select("*", { count: "exact", head: true })

      // Total trabajos
      const { count: trabajos } = await supabase
        .from("trabajos")
        .select("*", { count: "exact", head: true })

      // Trabajos activos
      const { count: activos } = await supabase
        .from("trabajos")
        .select("*", { count: "exact", head: true })
        .in("estado", ["pendiente", "en_progreso"])

      // Disputas abiertas
      const { count: disputas } = await supabase
        .from("disputas")
        .select("*", { count: "exact", head: true })
        .eq("estado", "abierta")

      // Pagos en escrow
      const { data: escrowData } = await supabase
        .from("transacciones_escrow")
        .select("monto")
        .eq("estado", "retenido")

      const pagosEscrow = escrowData?.length || 0
      const montoTotal = escrowData?.reduce((sum, t) => sum + (t.monto || 0), 0) || 0

      setStats({
        totalUsuarios: usuarios || 0,
        totalProfesionales: profesionales || 0,
        totalTrabajos: trabajos || 0,
        trabajosActivos: activos || 0,
        disputasAbiertas: disputas || 0,
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
      title: "Pagos en Escrow",
      value: stats.pagosEnEscrow,
      subtitle: `${stats.montoEscrow.toFixed(2)} EUR retenidos`,
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
          Bienvenido al panel de administracion de Diime
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

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Acciones Rapidas</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

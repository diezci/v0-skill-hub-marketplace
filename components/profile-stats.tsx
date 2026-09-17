"use client"

import { useT } from "@/components/idioma-provider"

import { Card } from "@/components/ui/card"
import { Star, Briefcase, MessageSquare, Award, TrendingUp, Clock } from "lucide-react"

interface ProfileStatsProps {
  rating: number
  totalReviews: number
  completedProjects: number
  yearsExperience: number
  responseTime: string
  level: string
}

export default function ProfileStats({
  rating,
  totalReviews,
  completedProjects,
  yearsExperience,
  responseTime,
  level,
}: ProfileStatsProps) {
  const t = useT()
  const stats = [
    {
      icon: Star,
      label: t("Valoración Media"),
      value: rating.toFixed(1),
      subtext: t("{n} valoraciones", { n: totalReviews }),
      color: "text-amber-500",
    },
    {
      icon: Briefcase,
      label: t("Proyectos Completados"),
      value: completedProjects,
      subtext: t("trabajos finalizados"),
      color: "text-blue-500",
    },
    {
      icon: MessageSquare,
      label: t("Opiniones de Clientes"),
      value: totalReviews,
      subtext: t("reseñas verificadas"),
      color: "text-green-500",
    },
    {
      icon: Award,
      label: t("Años de Experiencia"),
      value: yearsExperience,
      subtext: t("años en el sector"),
      color: "text-purple-500",
    },
    {
      icon: Clock,
      label: t("Tiempo de Respuesta"),
      value: t(responseTime),
      subtext: t("respuesta media"),
      color: "text-orange-500",
    },
    {
      icon: TrendingUp,
      label: t("Nivel Profesional"),
      value: t(level).split(" ")[0],
      subtext: t(level),
      color: "text-indigo-500",
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
      {stats.map((stat, index) => (
        <Card key={index} className="p-4 hover:shadow-lg transition-shadow">
          <div className="flex flex-col items-center text-center">
            <stat.icon className={`h-8 w-8 mb-2 ${stat.color}`} />
            <div className="text-2xl font-bold mb-1">{stat.value}</div>
            <div className="text-xs font-medium text-muted-foreground mb-1">{stat.label}</div>
            <div className="text-xs text-muted-foreground">{stat.subtext}</div>
          </div>
        </Card>
      ))}
    </div>
  )
}

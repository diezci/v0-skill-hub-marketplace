"use client"

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
  const stats = [
    {
      icon: Star,
      label: "Valoración Media",
      value: rating.toFixed(1),
      subtext: `${totalReviews} valoraciones`,
      color: "text-amber-500",
    },
    {
      icon: Briefcase,
      label: "Proyectos Completados",
      value: completedProjects,
      subtext: "trabajos finalizados",
      color: "text-blue-500",
    },
    {
      icon: MessageSquare,
      label: "Opiniones de Clientes",
      value: totalReviews,
      subtext: "reseñas verificadas",
      color: "text-green-500",
    },
    {
      icon: Award,
      label: "Años de Experiencia",
      value: yearsExperience,
      subtext: "años en el sector",
      color: "text-purple-500",
    },
    {
      icon: Clock,
      label: "Tiempo de Respuesta",
      value: responseTime,
      subtext: "respuesta media",
      color: "text-orange-500",
    },
    {
      icon: TrendingUp,
      label: "Nivel Profesional",
      value: level.split(" ")[0],
      subtext: level,
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

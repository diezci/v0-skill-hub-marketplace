"use client"

import { Card } from "@/components/ui/card"
import { Hammer, PaintBucket, Zap, Droplets, Ruler, Wind, Trees, Lock, Home, ArrowRight } from "lucide-react"
import Link from "next/link"

const categories = [
  {
    name: "Albañilería",
    description: "Reformas y construcción",
    icon: Hammer,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500/10",
    href: "/profesionales?category=albanileria",
  },
  {
    name: "Fontanería",
    description: "Instalaciones y reparaciones",
    icon: Droplets,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
    href: "/profesionales?category=fontaneria",
  },
  {
    name: "Electricidad",
    description: "Instalaciones eléctricas",
    icon: Zap,
    color: "text-yellow-600 dark:text-yellow-400",
    bg: "bg-yellow-500/10",
    href: "/profesionales?category=electricidad",
  },
  {
    name: "Pintura",
    description: "Interior y exterior",
    icon: PaintBucket,
    color: "text-pink-600 dark:text-pink-400",
    bg: "bg-pink-500/10",
    href: "/profesionales?category=pintura",
  },
  {
    name: "Carpintería",
    description: "Muebles a medida",
    icon: Ruler,
    color: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-500/10",
    href: "/profesionales?category=carpinteria",
  },
  {
    name: "Climatización",
    description: "Aire y calefacción",
    icon: Wind,
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-500/10",
    href: "/profesionales?category=climatizacion",
  },
  {
    name: "Jardinería",
    description: "Diseño y mantenimiento",
    icon: Trees,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    href: "/profesionales?category=jardineria",
  },
  {
    name: "Cerrajería",
    description: "Cerraduras y seguridad",
    icon: Lock,
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-500/10",
    href: "/profesionales?category=cerrajeria",
  },
  {
    name: "Arquitectura",
    description: "Proyectos y diseño",
    icon: Home,
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-500/10",
    href: "/profesionales?category=arquitectura",
  },
]

const Categories = () => {
  return (
    <section className="container mx-auto px-4 py-16 md:py-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
        <div className="max-w-xl">
          <h2 className="text-3xl md:text-4xl font-bold mb-3 tracking-tight text-balance">
            Explora por especialidad
          </h2>
          <p className="text-muted-foreground text-lg">
            Encuentra al profesional adecuado para cualquier tipo de servicio
          </p>
        </div>
        <Link
          href="/profesionales"
          className="text-sm font-medium text-primary hover:gap-3 transition-all flex items-center gap-2 self-start md:self-auto"
        >
          Ver todas las categorias
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {categories.map((cat) => (
          <Link key={cat.name} href={cat.href}>
            <Card className="p-5 h-full card-hover cursor-pointer group border-border/40 hover:border-primary/40 transition-colors">
              <div
                className={`${cat.bg} ${cat.color} w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
              >
                <cat.icon className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-base mb-1">{cat.name}</h3>
              <p className="text-xs text-muted-foreground">{cat.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default Categories

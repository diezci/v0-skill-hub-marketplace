"use client"

import { Card } from "@/components/ui/card"
import { Hammer, PaintBucket, Zap, Droplets, Ruler, Wind, Trees, Lock, Home } from "lucide-react"
import Link from "next/link"

const categories = [
  {
    name: "Albañilería",
    icon: Hammer,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    href: "/gigs?category=albanileria",
  },
  {
    name: "Fontanería",
    icon: Droplets,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    href: "/gigs?category=fontaneria",
  },
  {
    name: "Electricidad",
    icon: Zap,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    href: "/gigs?category=electricidad",
  },
  { name: "Pintura", icon: PaintBucket, color: "text-pink-500", bg: "bg-pink-500/10", href: "/gigs?category=pintura" },
  {
    name: "Carpintería",
    icon: Ruler,
    color: "text-amber-600",
    bg: "bg-amber-500/10",
    href: "/gigs?category=carpinteria",
  },
  {
    name: "Climatización",
    icon: Wind,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
    href: "/gigs?category=climatizacion",
  },
  {
    name: "Jardinería",
    icon: Trees,
    color: "text-green-500",
    bg: "bg-green-500/10",
    href: "/gigs?category=jardineria",
  },
  { name: "Cerrajería", icon: Lock, color: "text-slate-500", bg: "bg-slate-500/10", href: "/gigs?category=cerrajeria" },
  {
    name: "Arquitectura",
    icon: Home,
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
    href: "/gigs?category=arquitectura",
  },
]

const Categories = () => {
  return (
    <section className="container mx-auto px-4 py-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold mb-2">Categorías</h2>
          <p className="text-muted-foreground">Explora servicios por especialidad</p>
        </div>
        <Link href="/gigs" className="text-sm text-primary hover:underline hidden sm:block">
          Ver todas
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {categories.map((cat) => (
          <Link key={cat.name} href={cat.href}>
            <Card className="p-4 h-full card-hover cursor-pointer group">
              <div
                className={`${cat.bg} ${cat.color} w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}
              >
                <cat.icon className="h-5 w-5" />
              </div>
              <h3 className="font-medium text-sm">{cat.name}</h3>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default Categories

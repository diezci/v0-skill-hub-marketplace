"use client"

import { Card } from "@/components/ui/card"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

const categories = [
  {
    name: "Albañilería",
    description: "Reformas y construcción",
    image: "/categories/albanileria.jpg",
    href: "/profesionales?category=albanileria",
  },
  {
    name: "Fontanería",
    description: "Instalaciones y reparaciones",
    image: "/categories/fontaneria.jpg",
    href: "/profesionales?category=fontaneria",
  },
  {
    name: "Electricidad",
    description: "Instalaciones eléctricas",
    image: "/categories/electricidad.jpg",
    href: "/profesionales?category=electricidad",
  },
  {
    name: "Pintura",
    description: "Interior y exterior",
    image: "/categories/pintura.jpg",
    href: "/profesionales?category=pintura",
  },
  {
    name: "Carpintería",
    description: "Muebles a medida",
    image: "/categories/carpinteria.jpg",
    href: "/profesionales?category=carpinteria",
  },
  {
    name: "Climatización",
    description: "Aire y calefacción",
    image: "/categories/climatizacion.jpg",
    href: "/profesionales?category=climatizacion",
  },
  {
    name: "Jardinería",
    description: "Diseño y mantenimiento",
    image: "/categories/jardineria.jpg",
    href: "/profesionales?category=jardineria",
  },
  {
    name: "Cerrajería",
    description: "Cerraduras y seguridad",
    image: "/categories/cerrajeria.jpg",
    href: "/profesionales?category=cerrajeria",
  },
  {
    name: "Arquitectura",
    description: "Proyectos y diseño",
    image: "/categories/arquitectura.jpg",
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
            <Card className="relative h-48 overflow-hidden cursor-pointer group border-border/40 hover:border-primary/40 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 rounded-2xl p-0">
              {/* Background image */}
              <img
                src={cat.image || "/placeholder.svg"}
                alt={`${cat.name} - ${cat.description}`}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />

              {/* Dark gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />

              {/* Content */}
              <div className="relative h-full flex flex-col justify-end p-4 text-white">
                <h3 className="font-semibold text-base mb-1 drop-shadow-md">{cat.name}</h3>
                <p className="text-xs text-white/85 drop-shadow">{cat.description}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default Categories

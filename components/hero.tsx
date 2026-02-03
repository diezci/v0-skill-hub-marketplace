"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, CheckCircle2, Users, Star, Shield } from "lucide-react"
import Link from "next/link"

const stats = [
  { value: "5,000+", label: "Profesionales", icon: Users },
  { value: "4.9", label: "Valoración media", icon: Star },
  { value: "100%", label: "Pagos seguros", icon: Shield },
]

const Hero = () => {
  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />

      <div className="container mx-auto px-4 py-20 md:py-28 relative">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
            <CheckCircle2 className="h-4 w-4" />
            Profesionales verificados
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-balance">
            Encuentra al <span className="gradient-text">profesional perfecto</span> para tu proyecto
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 text-pretty">
            Conectamos a miles de profesionales cualificados con clientes que buscan servicios de calidad. Rápido,
            seguro y garantizado.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link href="/gigs">
              <Button size="lg" className="rounded-xl text-base px-8 h-12 gap-2">
                Buscar profesionales
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/convertirse-profesional">
              <Button size="lg" variant="outline" className="rounded-xl text-base px-8 h-12 bg-transparent">
                Ofrecer mis servicios
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 max-w-lg mx-auto">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <stat.icon className="h-4 w-4 text-primary" />
                  <span className="text-2xl md:text-3xl font-bold">{stat.value}</span>
                </div>
                <p className="text-xs md:text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero

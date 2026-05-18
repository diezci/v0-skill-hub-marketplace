import SolicitudServicioForm from "@/components/solicitud-servicio-form"
import FeaturedGigs from "@/components/featured-gigs"
import Categories from "@/components/categories"
import Testimonials from "@/components/testimonials"
import HowItWorks from "@/components/how-it-works"
import CtaSection from "@/components/cta-section"
import { CheckCircle2, Users, Star, Shield } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const trustStats = [
  { value: "5,000+", label: "Profesionales", icon: Users },
  { value: "4.9", label: "Valoracion media", icon: Star },
  { value: "100%", label: "Pagos seguros", icon: Shield },
]

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero Section with embedded form */}
      <section className="relative overflow-hidden">
        {/* Background gradients */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-0 -left-32 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute top-32 -right-32 w-96 h-96 rounded-full bg-emerald-400/5 blur-3xl" />

        <div className="container mx-auto px-4 pt-12 pb-20 md:pt-20 md:pb-28 relative">
          <div className="text-center max-w-4xl mx-auto mb-12">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6 border border-primary/20">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Profesionales verificados en toda España
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight text-balance leading-[1.05]">
              Publica tu <span className="gradient-text">proyecto</span>
              <br className="hidden md:block" /> y recibe ofertas en minutos
            </h1>

            {/* Subheadline */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
              Describe lo que necesitas y conecta con profesionales cualificados al instante. Rapido, seguro y sin
              complicaciones.
            </p>
          </div>

          {/* Embedded form */}
          <SolicitudServicioForm embedded />

          {/* Trust stats */}
          <div className="grid grid-cols-3 gap-4 md:gap-8 max-w-2xl mx-auto mt-14 pt-10 border-t border-border/50">
            {trustStats.map((stat) => {
              const Icon = stat.icon
              return (
                <div key={stat.label} className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="text-2xl md:text-3xl font-bold tracking-tight">{stat.value}</span>
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground">{stat.label}</p>
                </div>
              )
            })}
          </div>

          {/* Secondary CTA for professionals */}
          
        </div>
      </section>

      <Categories />
      <HowItWorks />
      <FeaturedGigs />
      <Testimonials />
      <CtaSection />
    </div>
  )
}

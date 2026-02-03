import SolicitudServicioForm from "@/components/solicitud-servicio-form"
import FeaturedGigs from "@/components/featured-gigs"
import Categories from "@/components/categories"
import Testimonials from "@/components/testimonials"

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero with Form */}
      <section className="relative py-16 md:py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-emerald-500/5" />
        <div className="container mx-auto px-4 relative">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              Encuentra al profesional perfecto
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Publica tu proyecto y recibe ofertas de profesionales cualificados en minutos
            </p>
          </div>

          <SolicitudServicioForm embedded />
        </div>
      </section>

      <Categories />
      <FeaturedGigs />
      <Testimonials />
    </div>
  )
}

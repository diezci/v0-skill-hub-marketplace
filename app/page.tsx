import SolicitudServicioForm from "@/components/solicitud-servicio-form"
import FeaturedGigs from "@/components/featured-gigs"
import Categories from "@/components/categories"
import Testimonials from "@/components/testimonials"
import HowItWorks from "@/components/how-it-works"
import CtaSection from "@/components/cta-section"
import { CheckCircle2 } from "lucide-react"
import { getT } from "@/lib/i18n-servidor"

export default async function Home() {
  const { t } = await getT()

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
              {t("home.badge")}
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight text-balance leading-[1.05]">
              {t("home.titulo1")} <span className="gradient-text">{t("home.tituloResaltado")}</span>
              <br className="hidden md:block" /> {t("home.titulo2")}
            </h1>

            {/* Subheadline */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
              {t("home.subtitulo")}
            </p>
          </div>

          {/* Embedded form */}
          <SolicitudServicioForm embedded />

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

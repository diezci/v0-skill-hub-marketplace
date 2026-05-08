import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles } from "lucide-react"

const CtaSection = () => {
  return (
    <section className="container mx-auto px-4 py-16 md:py-24">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-emerald-600 to-emerald-700 p-8 md:p-16">
        {/* Decorative blur circles */}
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />

        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-medium mb-6 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Empieza gratis hoy mismo
          </div>

          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight text-balance">
            Tu proximo proyecto esta a un clic
          </h2>
          <p className="text-white/90 text-lg md:text-xl mb-10 max-w-2xl mx-auto text-pretty">
            Unete a miles de personas que ya estan construyendo, reformando y mejorando con Diime
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/solicitar-servicio">
              <Button
                size="lg"
                className="rounded-xl bg-white text-emerald-700 hover:bg-white/90 h-12 px-8 text-base font-semibold shadow-xl"
              >
                Publicar un proyecto
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/convertirse-profesional">
              <Button
                size="lg"
                variant="outline"
                className="rounded-xl bg-transparent text-white border-white/40 hover:bg-white/10 hover:text-white h-12 px-8 text-base font-semibold"
              >
                Soy profesional
              </Button>
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 mt-12 text-sm text-white/80">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-white/80" />
              Sin permanencia
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-white/80" />
              Pagos seguros con escrow
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-white/80" />
              Soporte 7 dias a la semana
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default CtaSection

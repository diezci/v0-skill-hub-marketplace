import { FileText, Users, ShieldCheck, Star } from "lucide-react"

const steps = [
  {
    number: "01",
    title: "Publica tu proyecto",
    description: "Cuentanos que necesitas en menos de 2 minutos. Es gratis y sin compromiso.",
    icon: FileText,
  },
  {
    number: "02",
    title: "Recibe ofertas",
    description: "Profesionales verificados te enviaran sus mejores propuestas en pocas horas.",
    icon: Users,
  },
  {
    number: "03",
    title: "Paga con seguridad",
    description: "Tu dinero queda retenido hasta que el trabajo este completado a tu satisfaccion.",
    icon: ShieldCheck,
  },
  {
    number: "04",
    title: "Valora la experiencia",
    description: "Comparte tu opinion para ayudar a otros usuarios y mejorar la comunidad.",
    icon: Star,
  },
]

const HowItWorks = () => {
  return (
    <section className="container mx-auto px-4 py-16 md:py-24">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4 tracking-wide uppercase">
          Como funciona
        </span>
        <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight text-balance">
          Encuentra a tu profesional en 4 pasos
        </h2>
        <p className="text-muted-foreground text-lg text-pretty">
          Un proceso simple, transparente y seguro que te conecta con los mejores profesionales de tu zona
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
        {/* Decorative line connecting steps on large screens */}
        <div className="hidden lg:block absolute top-12 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {steps.map((step) => {
          const Icon = step.icon
          return (
            <div
              key={step.number}
              className="relative bg-card border border-border/50 rounded-2xl p-6 hover:border-primary/40 hover:shadow-lg transition-all duration-300 group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                  <Icon className="h-6 w-6" />
                </div>
                <span className="text-3xl font-bold text-muted-foreground/20 font-mono">{step.number}</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default HowItWorks
